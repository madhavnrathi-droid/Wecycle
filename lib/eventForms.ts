'use client';

/* ── Event registration forms (Google-Forms-style) ─────────────────────────
 *
 * Organizers attach one optional form per event. RSVPing on an event that has
 * a form routes through a form-fill screen; the RSVP confirms on submit.
 *
 * Data model (Supabase):
 *   event_forms(id, event_id UNIQUE→events, fields jsonb, created_at, updated_at)
 *   event_form_responses(id, form_id, event_id, user_id, answers jsonb, submitted_at)
 *     — UNIQUE (event_id, user_id); RLS: respondent writes own, organizer reads all.
 *   storage bucket `form-uploads` (PRIVATE, pdf+images, 10 MB):
 *     path {event_id}/{user_id}/{ts}-{n}.{ext}; readable by uploader + organizer
 *     via signed URLs only.
 *
 * `fields` is an ordered array of FormField. `answers` maps fieldId →
 * string | string[] (checkboxes = string[]; file = storage object path).
 */

import { supabase, hasSupabaseEnv } from './supabase';
import { isDemoMode } from './demoMode';
import { USERS, type User } from './mockData';
import { profileToUser, type JoinedProfile } from './liveData';

/* ── Field model ───────────────────────────────────── */

export type FormFieldType =
  | 'short_text' | 'long_text'
  | 'mcq' | 'checkboxes' | 'dropdown'
  | 'name' | 'email' | 'phone' | 'number'
  | 'file';

export interface FormField {
  id: string;
  type: FormFieldType;
  label: string;
  required: boolean;
  /** mcq / checkboxes / dropdown only. */
  options?: string[];
}

export type FormAnswers = Record<string, string | string[]>;

export interface EventFormRecord {
  id: string;
  eventId: string;
  fields: FormField[];
}

export interface FormResponse {
  id: string;
  userId: string;
  answers: FormAnswers;
  submittedAt: string;
  user: User;
}

export const FIELD_TYPE_META: Record<FormFieldType, { label: string; icon: string; hasOptions: boolean; hint: string }> = {
  short_text: { label: 'Short answer', icon: '✏️', hasOptions: false, hint: 'One line of text' },
  long_text:  { label: 'Paragraph',    icon: '📝', hasOptions: false, hint: 'Longer free text' },
  mcq:        { label: 'Multiple choice', icon: '🔘', hasOptions: true, hint: 'Pick one option' },
  checkboxes: { label: 'Checkboxes',   icon: '☑️', hasOptions: true, hint: 'Pick any that apply' },
  dropdown:   { label: 'Dropdown',     icon: '▾',  hasOptions: true, hint: 'Pick one from a list' },
  name:       { label: 'Name',         icon: '🪪', hasOptions: false, hint: 'Full name field' },
  email:      { label: 'Email',        icon: '✉️', hasOptions: false, hint: 'Validated email' },
  phone:      { label: 'Phone',        icon: '📞', hasOptions: false, hint: 'Phone number' },
  number:     { label: 'Number',       icon: '#',  hasOptions: false, hint: 'Numeric answer' },
  file:       { label: 'File upload',  icon: '📎', hasOptions: false, hint: 'One PDF or image, 10 MB' },
};

export const FIELD_TYPE_ORDER: FormFieldType[] = [
  'short_text', 'long_text', 'mcq', 'checkboxes', 'dropdown',
  'name', 'email', 'phone', 'number', 'file',
];

let fieldSeq = 0;
export function newField(type: FormFieldType): FormField {
  fieldSeq += 1;
  return {
    id: `f_${Date.now().toString(36)}_${fieldSeq}`,
    type,
    label: '',
    required: false,
    ...(FIELD_TYPE_META[type].hasOptions ? { options: ['Option 1'] } : {}),
  };
}

/* ── Validation (fill screen) ──────────────────────── */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validate answers against the field list → { fieldId: error } (empty = valid).
 *  `files` carries picked-but-not-yet-uploaded File objects for file fields. */
export function validateAnswers(
  fields: FormField[],
  answers: FormAnswers,
  files: Record<string, File | null>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    const a = answers[f.id];
    const has =
      f.type === 'file'      ? !!files[f.id] || (typeof a === 'string' && a.length > 0)
      : f.type === 'checkboxes' ? Array.isArray(a) && a.length > 0
      : typeof a === 'string' && a.trim().length > 0;
    if (f.required && !has) { errors[f.id] = 'Required'; continue; }
    if (!has) continue;
    if (f.type === 'email' && typeof a === 'string' && !EMAIL_RE.test(a.trim())) errors[f.id] = 'Enter a valid email';
    if (f.type === 'number' && typeof a === 'string' && Number.isNaN(Number(a.trim()))) errors[f.id] = 'Numbers only';
    if (f.type === 'phone' && typeof a === 'string' && a.replace(/[^\d]/g, '').length < 7) errors[f.id] = 'Enter a valid phone number';
  }
  return errors;
}

/** True when a builder's field list is publishable. */
export function validateFields(fields: FormField[]): string | null {
  if (!fields.length) return 'Add at least one question';
  for (const f of fields) {
    if (!f.label.trim()) return 'Every question needs a label';
    if (FIELD_TYPE_META[f.type].hasOptions && !(f.options ?? []).some(o => o.trim())) {
      return `"${f.label.trim()}" needs at least one option`;
    }
  }
  return null;
}

/* ── File upload constraints (bucket-enforced too) ── */

export const FORM_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const FORM_UPLOAD_ACCEPT = '.pdf,application/pdf,image/*';
const UPLOAD_MIME_OK = /^(application\/pdf|image\/(jpeg|png|webp|gif|heic|heif))$/i;

export function checkUploadFile(file: File): string | null {
  if (file.size > FORM_UPLOAD_MAX_BYTES) return 'File is over 10 MB';
  if (!UPLOAD_MIME_OK.test(file.type)) return 'PDF or image files only';
  return null;
}

function uploadExt(file: File): string {
  if (file.type === 'application/pdf') return 'pdf';
  const m = /image\/(\w+)/.exec(file.type);
  return m ? (m[1] === 'jpeg' ? 'jpg' : m[1]) : 'bin';
}

/** Display name for a stored file path (strip folders + timestamp prefix). */
export function fileAnswerName(path: string): string {
  const base = path.split('/').pop() ?? path;
  return base.replace(/^\d+-/, 'upload-');
}

/** Signed URL for a form-uploads object (organizer or uploader; 1 h). */
export async function signedFormFileUrl(path: string): Promise<string | null> {
  if (!hasSupabaseEnv) return null;
  const { data, error } = await supabase.storage.from('form-uploads').createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/* ── Demo store (in-memory; reviewer-friendly) ─────── */

const DEMO_FORMS: Record<string, FormField[]> = {
  /* Repair Café (not the demo viewer's own) — demoes the register flow. */
  e2: [
    { id: 'd_name',  type: 'name',  label: 'Your full name', required: true },
    { id: 'd_email', type: 'email', label: 'Email for confirmation', required: true },
    { id: 'd_item',  type: 'mcq',   label: 'What are you bringing to repair?', required: true,
      options: ['Electronics', 'Clothing / textiles', 'Furniture', 'Cycle', 'Something else'] },
    { id: 'd_help',  type: 'checkboxes', label: 'Can you also volunteer a skill?', required: false,
      options: ['Soldering', 'Sewing', 'Woodwork', 'Just visiting'] },
    { id: 'd_photo', type: 'file',  label: 'Photo of the broken item (optional)', required: false },
  ],
  /* Cleanup Drive (MY_EVENT_IDS) — demoes organizer insights with responses. */
  e3: [
    { id: 'd3_name',  type: 'name', label: 'Full name', required: true },
    { id: 'd3_zone',  type: 'dropdown', label: 'Preferred zone', required: true,
      options: ['Beach front', 'Rocky side', 'Parking + entry'] },
    { id: 'd3_gloves', type: 'mcq', label: 'Do you need gloves?', required: true, options: ['Yes', 'Bringing my own'] },
    { id: 'd3_notes', type: 'long_text', label: 'Anything we should know?', required: false },
  ],
};

/* Demo responses for e3 so the insights screen has data to show. */
const DEMO_RESPONSES: Record<string, FormResponse[]> = {
  e3: [0, 1, 3, 4, 6].map((u, i) => ({
    id: `dr_${i}`,
    userId: USERS[u].id,
    answers: {
      d3_name: USERS[u].name,
      d3_zone: ['Beach front', 'Beach front', 'Rocky side', 'Parking + entry', 'Beach front'][i],
      d3_gloves: i % 2 === 0 ? 'Yes' : 'Bringing my own',
      ...(i === 0 ? { d3_notes: 'Bringing 3 friends along!' } : {}),
    },
    submittedAt: `${i + 1}d ago`,
    user: USERS[u],
  })),
};

/* Demo-session mutable state: the viewer's own responses. */
const demoMyResponses = new Map<string, FormAnswers>();

/* ── Live data ─────────────────────────────────────── */

interface FormRow { id: string; event_id: string; fields: unknown }

export async function fetchEventForm(eventId: string): Promise<EventFormRecord | null> {
  if (isDemoMode()) {
    const fields = DEMO_FORMS[eventId];
    return fields ? { id: `demo-form-${eventId}`, eventId, fields } : null;
  }
  if (!hasSupabaseEnv) return null;
  const { data, error } = await supabase
    .from('event_forms')
    .select('id, event_id, fields')
    .eq('event_id', eventId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as FormRow;
  return { id: row.id, eventId: row.event_id, fields: (row.fields as FormField[]) ?? [] };
}

/** Create or replace an event's form (organizer only, RLS-enforced). */
export async function upsertEventForm(eventId: string, fields: FormField[]): Promise<void> {
  if (isDemoMode()) { DEMO_FORMS[eventId] = fields; return; }
  if (!hasSupabaseEnv) throw new Error('Backend not configured');
  const { error } = await supabase
    .from('event_forms')
    .upsert({ event_id: eventId, fields, updated_at: new Date().toISOString() } as never, { onConflict: 'event_id' } as never);
  if (error) throw error;
}

export async function deleteEventForm(eventId: string): Promise<void> {
  if (isDemoMode()) { delete DEMO_FORMS[eventId]; return; }
  if (!hasSupabaseEnv) throw new Error('Backend not configured');
  const { error } = await supabase.from('event_forms').delete().eq('event_id', eventId);
  if (error) throw error;
}

/** The signed-in user's own response for an event (null if none). */
export async function fetchMyFormResponse(eventId: string): Promise<{ answers: FormAnswers } | null> {
  if (isDemoMode()) {
    const a = demoMyResponses.get(eventId);
    return a ? { answers: a } : null;
  }
  if (!hasSupabaseEnv) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('event_form_responses')
    .select('answers')
    .eq('event_id', eventId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error || !data) return null;
  return { answers: ((data as { answers?: FormAnswers }).answers ?? {}) };
}

/** Upload file answers + upsert the response row. `files` maps fieldId → File
 *  picked in this session (fields whose answer is already a stored path are
 *  left untouched). Returns the final answers as stored. */
export async function submitFormResponse(
  eventId: string,
  formId: string,
  fields: FormField[],
  answers: FormAnswers,
  files: Record<string, File | null>,
): Promise<FormAnswers> {
  if (isDemoMode()) {
    const final: FormAnswers = { ...answers };
    for (const f of fields) {
      const file = files[f.id];
      if (f.type === 'file' && file) final[f.id] = `demo/${file.name}`;
    }
    demoMyResponses.set(eventId, final);
    return final;
  }
  if (!hasSupabaseEnv) throw new Error('Backend not configured');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Please sign in first');

  const final: FormAnswers = { ...answers };
  let n = 0;
  for (const f of fields) {
    if (f.type !== 'file') continue;
    const file = files[f.id];
    if (!file) continue;
    const bad = checkUploadFile(file);
    if (bad) throw new Error(`${f.label || 'File'}: ${bad}`);
    const path = `${eventId}/${user.id}/${Date.now()}-${n++}.${uploadExt(file)}`;
    const { error: upErr } = await supabase.storage
      .from('form-uploads')
      .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
    if (upErr) throw upErr;
    /* Replacing an earlier upload? Best-effort delete of the old object. */
    const prev = final[f.id];
    if (typeof prev === 'string' && prev && !prev.startsWith('demo/')) {
      supabase.storage.from('form-uploads').remove([prev]).then(() => {}, () => {});
    }
    final[f.id] = path;
  }

  const { error } = await supabase
    .from('event_form_responses')
    .upsert({
      event_id: eventId,
      form_id: formId,
      user_id: user.id,
      answers: final,
      submitted_at: new Date().toISOString(),
    } as never, { onConflict: 'event_id,user_id' } as never);
  if (error) throw error;
  return final;
}

/** Withdraw own response (un-RSVP) — deletes the row + any uploaded files. */
export async function withdrawFormResponse(eventId: string): Promise<void> {
  if (isDemoMode()) { demoMyResponses.delete(eventId); return; }
  if (!hasSupabaseEnv) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  /* Collect file paths before deleting the row. */
  const mine = await fetchMyFormResponse(eventId);
  const paths = Object.values(mine?.answers ?? {})
    .filter((v): v is string => typeof v === 'string' && v.startsWith(`${eventId}/`));
  const { error } = await supabase
    .from('event_form_responses')
    .delete()
    .eq('event_id', eventId)
    .eq('user_id', user.id);
  if (error) throw error;
  if (paths.length) supabase.storage.from('form-uploads').remove(paths).then(() => {}, () => {});
}

/** All responses for an event (organizer; RLS filters for everyone else). */
export async function fetchEventResponses(eventId: string): Promise<FormResponse[]> {
  if (isDemoMode()) return DEMO_RESPONSES[eventId] ?? [];
  if (!hasSupabaseEnv) return [];
  const { data, error } = await supabase
    .from('event_form_responses')
    .select(`
      id, user_id, answers, submitted_at,
      user:profiles!event_form_responses_user_id_fkey(
        id, username, full_name, initials, avatar_url, avatar_color, role, is_online
      )
    `)
    .eq('event_id', eventId)
    .order('submitted_at', { ascending: false });
  if (error || !data) return [];
  return (data as unknown as Array<{
    id: string; user_id: string; answers: FormAnswers; submitted_at: string;
    user?: JoinedProfile | null;
  }>).map(r => ({
    id: r.id,
    userId: r.user_id,
    answers: r.answers ?? {},
    submittedAt: timeAgo(r.submitted_at),
    user: profileToUser(r.user, r.user_id),
  }));
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/* ── CSV export (insights) ─────────────────────────── */

export function responsesToCsv(fields: FormField[], responses: FormResponse[]): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const header = ['Name', 'Role', 'Submitted', ...fields.map(f => f.label || FIELD_TYPE_META[f.type].label)];
  const rows = responses.map(r => [
    r.user.name,
    r.user.role || '',
    r.submittedAt,
    ...fields.map(f => {
      const a = r.answers[f.id];
      if (a == null) return '';
      if (Array.isArray(a)) return a.join('; ');
      return f.type === 'file' ? fileAnswerName(a) : a;
    }),
  ]);
  return [header, ...rows].map(cols => cols.map(c => esc(String(c))).join(',')).join('\n');
}
