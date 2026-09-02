'use client';

/* ── Event registration (form-fill) screen ─────────────────────────────────
 * Opened when a user RSVPs to an event that carries a registration form.
 * Mobile: full-page takeover (app/page.tsx early-return). Desktop: rendered
 * inside a centered modal. Submitting the form is what confirms the RSVP —
 * the parent (app/page.tsx) completes the RSVP in onSubmitted.
 */

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, CalendarDays, MapPin, Paperclip, X, Check, Loader2 } from 'lucide-react';
import type { CommunityEvent } from '../lib/mockData';
import {
  fetchEventForm, fetchMyFormResponse, submitFormResponse,
  validateAnswers, checkUploadFile, fileAnswerName,
  FORM_UPLOAD_ACCEPT,
  type EventFormRecord, type FormAnswers, type FormField,
} from '../lib/eventForms';
import { useBreakpoint } from '../lib/useBreakpoint';
import { track, EVT } from '../lib/analytics';
import { haptics } from '../lib/haptics';

interface EventRegistrationScreenProps {
  event: CommunityEvent;
  /** True when the user is already going and is editing their submission. */
  editMode?: boolean;
  onBack: () => void;
  /** Fired after the response is stored — parent confirms the RSVP + closes. */
  onSubmitted: () => void | Promise<void>;
}

export default function EventRegistrationScreen({
  event, editMode, onBack, onSubmitted,
}: EventRegistrationScreenProps) {
  const { isDesktop } = useBreakpoint();
  const [form, setForm] = useState<EventFormRecord | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [answers, setAnswers] = useState<FormAnswers>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    track(EVT.registration_opened, { event_id: event.id, edit: !!editMode });
    Promise.all([fetchEventForm(event.id), fetchMyFormResponse(event.id)]).then(([f, mine]) => {
      if (cancelled) return;
      setForm(f);
      if (mine) setAnswers(mine.answers);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [event.id, editMode]);

  const setAnswer = (id: string, v: string | string[]) => {
    setAnswers(a => ({ ...a, [id]: v }));
    setErrors(e => ({ ...e, [id]: '' }));
  };

  const handleSubmit = async () => {
    if (!form || submitting) return;
    const errs = validateAnswers(form.fields, answers, files);
    setErrors(errs);
    if (Object.keys(errs).length) {
      haptics.error();
      /* Scroll the first offending field into view. */
      const first = form.fields.find(f => errs[f.id]);
      if (first) document.getElementById(`reg-${first.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitFormResponse(event.id, form.id, form.fields, answers, files);
      haptics.success();
      track(EVT.registration_submitted, {
        event_id: event.id,
        field_count: form.fields.length,
        has_files: form.fields.some(f => f.type === 'file' && files[f.id]),
        edit: !!editMode,
      });
      await onSubmitted();
    } catch (err) {
      haptics.error();
      setSubmitError((err as Error).message || 'Could not submit — please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={isDesktop ? { padding: '0 0 24px' } : { paddingBottom: 120 }}>
      {/* ── Header ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 30,
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '14px 16px',
        background: 'var(--bg-base)',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <button onClick={onBack} aria-label="Back" className="theme-toggle">
          <ChevronLeft size={20} strokeWidth={1.8} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 'calc(16px * var(--text-scale))', fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>
            {editMode ? 'Your registration' : 'Register'}
          </h1>
          <p style={{
            margin: '1px 0 0', fontSize: 'calc(12px * var(--text-scale))', color: 'var(--text-muted)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {event.title}
          </p>
        </div>
      </header>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '16px 20px 0' }}>
        {/* ── Event context card ── */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 6,
          padding: '14px 16px', marginBottom: 20,
          background: 'var(--bg-inset)',
          borderRadius: 16,
          fontSize: 'calc(12.5px * var(--text-scale))', color: 'var(--text-secondary)',
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <CalendarDays size={13} strokeWidth={2} /> {event.date} · {event.time}
          </span>
          {/* Hidden when there is no venue — location is optional now, and a
              lone pin with nothing beside it reads as a rendering fault. */}
          {event.location && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <MapPin size={13} strokeWidth={2} /> {event.location}
            </span>
          )}
          <span style={{ fontSize: 'calc(11.5px * var(--text-scale))', color: 'var(--text-muted)' }}>
            {editMode
              ? 'Update your answers below — the organizer sees the latest version.'
              : 'The organizer asks everyone to fill this in — your RSVP confirms once you submit.'}
          </span>
        </div>

        {/* ── Fields ── */}
        {!loaded ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 'calc(13px * var(--text-scale))' }}>
            Loading the form…
          </div>
        ) : !form || form.fields.length === 0 ? (
          /* The organizer removed the form after this snapshot was loaded —
             don't dead-end the user: confirm the RSVP right here. */
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: 'calc(13px * var(--text-scale))' }}>
            <p style={{ margin: '0 0 16px' }}>
              This event no longer needs a registration form.
            </p>
            <button
              type="button"
              onClick={() => { haptics.success(); onSubmitted(); }}
              className="btn btn-gradient"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}
            >
              <Check size={15} strokeWidth={2.4} /> Confirm RSVP
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {form.fields.map((f, i) => (
              <FieldInput
                key={f.id}
                field={f}
                index={i}
                value={answers[f.id]}
                file={files[f.id] ?? null}
                error={errors[f.id]}
                onChange={v => setAnswer(f.id, v)}
                onFile={file => {
                  setFiles(prev => ({ ...prev, [f.id]: file }));
                  setErrors(e => ({ ...e, [f.id]: '' }));
                }}
              />
            ))}
          </div>
        )}

        {submitError && (
          <div role="alert" style={{
            marginTop: 16, padding: '10px 12px',
            background: 'rgba(237,46,80,0.10)',
            border: '1px solid rgba(237,46,80,0.25)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--accent-rose)', fontSize: 'calc(12px * var(--text-scale))', fontWeight: 500,
          }}>
            {submitError}
          </div>
        )}

        {/* ── Submit CTA ── */}
        {form && form.fields.length > 0 && (
          <div style={isDesktop
            ? { marginTop: 26, display: 'flex', justifyContent: 'center' }
            : {
                position: 'fixed', left: 0, right: 0, zIndex: 40,
                bottom: 'calc(14px + env(safe-area-inset-bottom))',
                display: 'flex', justifyContent: 'center',
                padding: '0 16px',
                pointerEvents: 'none',
              }}>
            {/* Floating action pill — soft shadow, no bordered bar. */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', maxWidth: 480,
              padding: 8,
              background: 'var(--bg-card)',
              borderRadius: 999,
              boxShadow: '0 2px 6px rgba(28,28,26,0.06), 0 12px 36px rgba(28,28,26,0.14)',
              pointerEvents: 'auto',
            }}>
              <button
                type="button"
                onClick={onBack}
                style={{
                  height: 44, padding: '0 18px', borderRadius: 999, flexShrink: 0,
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  fontSize: 'calc(13px * var(--text-scale))', fontWeight: 600, color: 'var(--text-secondary)',
                  fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                style={{
                  flex: 1, height: 44, borderRadius: 999,
                  background: 'var(--text-primary)', color: 'var(--bg-base)',
                  border: 'none', cursor: submitting ? 'wait' : 'pointer',
                  fontSize: 'calc(13.5px * var(--text-scale))', fontWeight: 600, letterSpacing: '-0.01em',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  fontFamily: 'inherit',
                }}
              >
                {submitting
                  ? <><Loader2 size={15} strokeWidth={2.2} className="spin" /> Submitting…</>
                  : editMode ? 'Save changes' : <><Check size={15} strokeWidth={2.4} /> Submit &amp; RSVP</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── One answer input, per field type ─────────────── */

function FieldInput({
  field, index, value, file, error, onChange, onFile,
}: {
  field: FormField;
  index: number;
  value: string | string[] | undefined;
  file: File | null;
  error?: string;
  onChange: (v: string | string[]) => void;
  onFile: (f: File | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const str = typeof value === 'string' ? value : '';
  const arr = Array.isArray(value) ? value : [];

  const label = (
    <label className="field-label" htmlFor={`reg-${field.id}`} style={{ display: 'block', marginBottom: 6 }}>
      {field.label || `Question ${index + 1}`}
      {field.required && <span className="required" aria-hidden="true"> *</span>}
    </label>
  );

  const errEl = error ? <span className="field-error">{error}</span> : null;

  switch (field.type) {
    case 'long_text':
      return (
        <div id={`reg-${field.id}-wrap`}>
          {label}
          <textarea
            id={`reg-${field.id}`}
            className="form-textarea"
            value={str}
            maxLength={1000}
            onChange={e => onChange(e.target.value)}
            aria-required={field.required}
            aria-invalid={!!error}
          />
          {errEl}
        </div>
      );

    case 'mcq':
    case 'checkboxes': {
      const multi = field.type === 'checkboxes';
      const opts = (field.options ?? []).filter(o => o.trim());
      const toggle = (opt: string) => {
        if (multi) onChange(arr.includes(opt) ? arr.filter(o => o !== opt) : [...arr, opt]);
        else onChange(opt);
      };
      return (
        <fieldset id={`reg-${field.id}`} style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend className="field-label" style={{ marginBottom: 6 }}>
            {field.label || `Question ${index + 1}`}
            {field.required && <span className="required" aria-hidden="true"> *</span>}
          </legend>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {opts.map((opt, oi) => {
              const on = multi ? arr.includes(opt) : str === opt;
              return (
                <button
                  key={`${oi}-${opt}`}
                  type="button"
                  role={multi ? 'checkbox' : 'radio'}
                  aria-checked={on}
                  onClick={() => { haptics.selection(); toggle(opt); }}
                  style={{
                    /* Selection reads through FILL, not a border box — quiet
                       tonal row that turns solid when picked. */
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '12px 14px', textAlign: 'left', width: '100%',
                    background: on ? 'var(--text-primary)' : 'var(--bg-inset)',
                    border: 'none',
                    borderRadius: 14, cursor: 'pointer',
                    fontSize: 'calc(13.5px * var(--text-scale))', fontWeight: on ? 600 : 500,
                    color: on ? 'var(--bg-base)' : 'var(--text-primary)',
                    fontFamily: 'inherit',
                    transition: 'background 140ms, color 140ms',
                  }}
                >
                  <span aria-hidden="true" style={{
                    width: 17, height: 17, flexShrink: 0,
                    borderRadius: multi ? 5 : '50%',
                    border: on ? 'none' : '1.5px solid var(--border-strong)',
                    background: on ? 'var(--bg-base)' : 'transparent',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--text-primary)',
                  }}>
                    {on && <Check size={11} strokeWidth={3} />}
                  </span>
                  {opt}
                </button>
              );
            })}
          </div>
          {errEl}
        </fieldset>
      );
    }

    case 'dropdown': {
      const opts = (field.options ?? []).filter(o => o.trim());
      return (
        <div>
          {label}
          <select
            id={`reg-${field.id}`}
            className="form-select"
            value={str}
            onChange={e => onChange(e.target.value)}
            aria-required={field.required}
            aria-invalid={!!error}
          >
            <option value="">Select…</option>
            {opts.map((o, oi) => <option key={`${oi}-${o}`} value={o}>{o}</option>)}
          </select>
          {errEl}
        </div>
      );
    }

    case 'file': {
      const existingPath = str && !file ? str : null;
      return (
        <div id={`reg-${field.id}-wrap`}>
          {label}
          <input
            ref={fileRef}
            id={`reg-${field.id}`}
            type="file"
            accept={FORM_UPLOAD_ACCEPT}
            style={{ display: 'none' }}
            onChange={e => {
              const f = e.target.files?.[0] ?? null;
              if (!f) return;
              const bad = checkUploadFile(f);
              setFileErr(bad);
              if (!bad) onFile(f);
              e.target.value = '';
            }}
          />
          {file || existingPath ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 9,
              padding: '11px 14px',
              background: 'var(--bg-inset)',
              borderRadius: 14,
            }}>
              <Paperclip size={14} strokeWidth={2} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
              <span style={{
                flex: 1, minWidth: 0, fontSize: 'calc(12.5px * var(--text-scale))', fontWeight: 500, color: 'var(--text-primary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB` : fileAnswerName(existingPath!)}
              </span>
              <button
                type="button"
                aria-label="Remove file"
                onClick={() => { onFile(null); if (existingPath) onChange(''); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, flexShrink: 0 }}
              >
                <X size={14} strokeWidth={2} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="press-scale"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '12px 14px', width: '100%', justifyContent: 'center',
                background: 'var(--bg-inset)',
                border: 'none',
                borderRadius: 14, cursor: 'pointer',
                fontSize: 'calc(13px * var(--text-scale))', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'inherit',
              }}
            >
              <Paperclip size={14} strokeWidth={2} /> Attach PDF or image
            </button>
          )}
          <span className="field-hint" style={{ display: 'block', marginTop: 4 }}>
            PDF or image, up to 10 MB. Only the organizer can open it.
          </span>
          {(fileErr || error) && <span className="field-error">{fileErr || error}</span>}
        </div>
      );
    }

    /* name / email / phone / number / short_text → single-line input */
    default: {
      const inputProps =
        field.type === 'email'  ? { type: 'email', inputMode: 'email' as const, autoComplete: 'email' }
        : field.type === 'phone' ? { type: 'tel', inputMode: 'tel' as const, autoComplete: 'tel' }
        : field.type === 'number' ? { type: 'number', inputMode: 'numeric' as const }
        : field.type === 'name' ? { type: 'text', autoComplete: 'name' }
        : { type: 'text' };
      return (
        <div>
          {label}
          <input
            id={`reg-${field.id}`}
            className="form-input"
            value={str}
            maxLength={200}
            onChange={e => onChange(e.target.value)}
            aria-required={field.required}
            aria-invalid={!!error}
            {...inputProps}
          />
          {errEl}
        </div>
      );
    }
  }
}
