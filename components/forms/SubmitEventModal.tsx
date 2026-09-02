'use client';

import { useRef, useState } from 'react';
import { MapPin, ClipboardList, ChevronRight } from 'lucide-react';
import Modal from '../Modal';
import PhotoPicker, { type PhotoPickerHandle } from '../PhotoPicker';
import FormBuilderScreen from './FormBuilderScreen';
import { createEvent } from '../../lib/liveData';
import { upsertEventForm, validateFields, type FormField } from '../../lib/eventForms';
import { isDemoMode } from '../../lib/demoMode';
import { hasSupabaseEnv } from '../../lib/supabase';
import { track, EVT } from '../../lib/analytics';
import { haptics } from '../../lib/haptics';
import { eventTypeGroups, DEFAULT_EVENT_TYPE } from '../../lib/eventTypes';
import {
  defaultSchedule, applyChange, durationLabel,
  type Schedule, type ScheduleField,
} from '../../lib/eventSchedule';

interface SubmitEventModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit?: (data: EventForm) => void;
}

export interface EventForm {
  title: string;
  eventType: string;
  /** The whole range. Replaces the old date + time pair, which could only
   *  express a start — an event had no way to end. */
  schedule: Schedule;
  location: string;
  description: string;
  maxAttendees?: number;
  photos: string[];
}

/** A fresh draft. Type and schedule arrive already filled in, because a default
 *  that is usually right costs one tap to change and none when it is right,
 *  while an empty required field costs a tap every single time — and used to
 *  cost a validation error too. */
const emptyForm = (): EventForm => ({
  title: '',
  eventType: DEFAULT_EVENT_TYPE,
  schedule: defaultSchedule(),
  location: '',
  description: '',
  photos: [],
});

const MAX_PHOTOS = 3;

export default function SubmitEventModal({ open, onClose, onSubmit }: SubmitEventModalProps) {
  const [form, setForm] = useState<EventForm>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof EventForm, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const pickerRef = useRef<PhotoPickerHandle>(null);
  /* Registration form (optional). null = no form attached. The builder is a
     dedicated full-page surface (FormBuilderScreen) — the modal underneath
     stays mounted, so the event draft survives the round trip. */
  const [regFields, setRegFields] = useState<FormField[] | null>(null);
  const [regError, setRegError] = useState<string | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);

  const closeBuilder = () => {
    /* Done/back both keep the draft. Validate softly: an empty draft simply
       means "no form" so the summary row doesn't advertise zero questions. */
    setBuilderOpen(false);
    setRegFields(prev => (prev !== null && prev.length === 0 ? null : prev));
  };
  const builderSave = () => {
    const bad = regFields !== null && regFields.length > 0 ? validateFields(regFields) : null;
    setRegError(bad);
    if (bad) return;
    closeBuilder();
  };

  const update = <K extends keyof EventForm>(key: K, value: EventForm[K]) => {
    setForm(f => ({ ...f, [key]: value }));
    setErrors(e => ({ ...e, [key]: undefined }));
  };

  /* One check, on one field.
   *
   * This used to demand five: title, type, date, location AND a description. A
   * description is something you write when you have something to say, not a
   * toll on announcing that a thing is happening — requiring it does not
   * produce better descriptions, it produces fewer events. Type and date now
   * arrive pre-filled, and location is genuinely optional (an online talk, a
   * campus-wide drive, a room not booked yet); "TBC" typed into a required box
   * is worse data than an empty column, because nothing downstream can tell it
   * is not a place.
   *
   * The title stays. These are public listings other people browse, not a
   * private calendar — an untitled event is noise in everyone else's feed, not
   * just the poster's. It is the one thing only the organiser can supply. */
  const validate = () => {
    const e: typeof errors = {};
    if (!form.title.trim()) e.title = 'Give your event a name';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  /** Edit one part of the range and let the rest follow — see lib/eventSchedule. */
  const updateSchedule = (field: ScheduleField, value: string | boolean) => {
    setForm(f => ({ ...f, schedule: applyChange(f.schedule, field, value) }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) return;
    /* Registration form (when attached) must be publishable. */
    if (regFields !== null) {
      const bad = validateFields(regFields);
      setRegError(bad);
      if (bad) return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (hasSupabaseEnv && !isDemoMode()) {
        const eventId = await createEvent({
          title: form.title,
          eventType: form.eventType,
          schedule: form.schedule,
          location: form.location,
          description: form.description,
          maxAttendees: form.maxAttendees,
          media: pickerRef.current?.getMedia() ?? [],
        });
        /* Attach the registration form right after the event exists. This is
           caught SEPARATELY: the event is already live, so surfacing a
           submit-level error here would invite a retry that duplicates the
           event. Tell the user where to add the form instead. */
        if (regFields !== null && regFields.length > 0) {
          try {
            await upsertEventForm(eventId, regFields);
            track(EVT.event_form_saved, { event_id: eventId, field_count: regFields.length, source: 'create' });
          } catch {
            track(EVT.post_form_failed, { post_kind: 'event', reason: 'form_attach_failed' });
            if (typeof window !== 'undefined') {
              window.alert('Your event is live, but the registration form could not be attached. Open the event and use the form button to add it.');
            }
          }
        }
      } else {
        await new Promise(r => setTimeout(r, 400));
      }
      haptics.success();
      track(EVT.post_form_submitted, {
        post_kind: 'event',
        event_type: form.eventType,
        all_day: form.schedule.allDay,
        has_end: Boolean(form.schedule.endTime) || form.schedule.endDate !== form.schedule.startDate,
        spans_days: form.schedule.endDate !== form.schedule.startDate,
        has_location: form.location.trim().length > 0,
        has_max_attendees: typeof form.maxAttendees === 'number',
        has_description: form.description.trim().length > 0,
        has_photos: form.photos.length > 0,
        has_registration_form: regFields !== null && regFields.length > 0,
        registration_field_count: regFields?.length ?? 0,
      });
      onSubmit?.(form);
      pickerRef.current?.clear();
      setForm(emptyForm());
      setRegFields(null);
      setRegError(null);
      onClose();
    } catch (err) {
      haptics.error();
      track(EVT.post_form_failed, { post_kind: 'event', reason: (err as Error).message?.slice(0, 80) });
      setSubmitError((err as Error).message || 'Could not submit — please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
    <Modal
      open={open}
      onClose={onClose}
      title="Submit an event"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-secondary" style={{ flex: 1 }}>
            Cancel
          </button>
          <button
            type="submit" form="event-form"
            disabled={submitting}
            className="btn btn-gradient"
            style={{ flex: 2 }}
          >
            {submitting ? 'Posting…' : 'Post'}
          </button>
        </>
      }
    >
      <p style={{ margin: '0 0 6px', fontSize: 'calc(13px * var(--text-scale))', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        Events are reviewed by community admins before they go live.
      </p>

      <form id="event-form" onSubmit={handleSubmit} noValidate>
        <div className="field" style={{ marginBottom: 14 }}>
          <label htmlFor="ev-title" className="field-label">
            Title <span className="required" aria-hidden="true">*</span>
          </label>
          <input
            id="ev-title"
            className="form-input"
            placeholder="e.g. Semester-End Swap Drive"
            value={form.title}
            onChange={e => update('title', e.target.value)}
            aria-required="true"
            aria-invalid={!!errors.title}
          />
          {errors.title && <span className="field-error">{errors.title}</span>}
        </div>

        {/* ── When ──────────────────────────────────────────────────────
            One block, not four loose inputs. The end follows the start by the
            rules in lib/eventSchedule, so in the common case — an event on one
            day, lasting an hour or two — the organiser touches the start and
            the rest is already right. Nothing in here can produce a validation
            error: every rule corrects rather than refuses. */}
        <fieldset style={{ border: 0, padding: 0, margin: '0 0 14px' }}>
          <legend className="field-label" style={{ padding: 0, marginBottom: 8 }}>When</legend>

          <div style={{
            background: 'var(--surface-muted, rgba(0,0,0,0.03))',
            borderRadius: 14,
            padding: 12,
          }}>
            {/* All day — a switch rather than a checkbox, because it changes
                what the rest of the block shows rather than recording a fact. */}
            {/* The app's own .pill-switch, not a bare checkbox. A checkbox
                records a fact; this changes what the rest of the block shows,
                which is what a switch is for — and it is the control already
                used for the same job in Settings and the form builder. */}
            <label style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 12, minHeight: 32, cursor: 'pointer', userSelect: 'none',
            }}>
              <span style={{ fontSize: 'calc(14px * var(--text-scale))', fontWeight: 500 }}>All day</span>
              <span className="pill-switch" style={{ width: 42, height: 25 }}>
                <input
                  type="checkbox"
                  checked={form.schedule.allDay}
                  onChange={e => { haptics.selection(); updateSchedule('allDay', e.target.checked); }}
                  aria-label="All day"
                />
                <span className="pill-switch-track" aria-hidden="true" style={{
                  position: 'absolute', inset: 0, borderRadius: 999,
                  background: form.schedule.allDay ? 'var(--text-primary)' : 'var(--bg-inset)',
                  transition: 'background 180ms',
                  pointerEvents: 'none',
                }} />
                <span aria-hidden="true" style={{
                  position: 'absolute', top: 3, left: form.schedule.allDay ? 22 : 3,
                  width: 19, height: 19, borderRadius: '50%',
                  background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                  transition: 'left 180ms', pointerEvents: 'none',
                }} />
              </span>
            </label>

            <div style={{ height: 1, background: 'rgba(0,0,0,0.07)', margin: '10px -12px' }} />

            {/* Starts / Ends share a grid so the date and time columns line up
                between the two rows — the ranges are read by comparing down a
                column, not across a row. */}
            {/* Fixed narrow label + flexible date + fixed time. The first
                attempt let the date take 1fr against a 116px time column and a
                wider label, which on a 375px screen clipped the year: the field
                read "27/08/202". A date input needs ~150px for dd/mm/yyyy plus
                its picker glyph, so the time column gives the space back. */}
            <div style={{ display: 'grid', gridTemplateColumns: '34px minmax(0, 1fr) auto', gap: '10px 6px', alignItems: 'center' }}>
              <label htmlFor="ev-start-date" style={{ fontSize: 'calc(12.5px * var(--text-scale))', color: 'var(--text-secondary, #6B6B60)' }}>
                Starts
              </label>
              <input
                id="ev-start-date"
                type="date"
                className="form-input"
                value={form.schedule.startDate}
                onChange={e => updateSchedule('startDate', e.target.value)}
                style={{ minWidth: 0 }}
              />
              {form.schedule.allDay ? <span /> : (
                <input
                  aria-label="Start time"
                  type="time"
                  className="form-input"
                  value={form.schedule.startTime}
                  onChange={e => updateSchedule('startTime', e.target.value)}
                  style={{ minWidth: 0, width: 118, paddingLeft: 8, paddingRight: 4 }}
                />
              )}

              <label htmlFor="ev-end-date" style={{ fontSize: 'calc(12.5px * var(--text-scale))', color: 'var(--text-secondary, #6B6B60)' }}>
                Ends
              </label>
              <input
                id="ev-end-date"
                type="date"
                className="form-input"
                value={form.schedule.endDate}
                /* The start is the floor. Offering earlier dates only to correct
                   them afterwards is a worse experience than not offering them. */
                min={form.schedule.startDate}
                onChange={e => updateSchedule('endDate', e.target.value)}
                style={{ minWidth: 0 }}
              />
              {form.schedule.allDay ? <span /> : (
                <input
                  aria-label="End time"
                  type="time"
                  className="form-input"
                  value={form.schedule.endTime}
                  onChange={e => updateSchedule('endTime', e.target.value)}
                  style={{ minWidth: 0, width: 118, paddingLeft: 8, paddingRight: 4 }}
                />
              )}
            </div>

            {/* The running length, so the range can be sanity-checked without
                doing the subtraction. Also the only feedback that confirms a
                deliberate 11pm→1am event was understood as spanning midnight
                rather than silently corrected. */}
            {durationLabel(form.schedule) && (
              <p aria-live="polite" style={{
                margin: '10px 0 0', fontSize: 'calc(12.5px * var(--text-scale))',
                color: 'var(--text-secondary, #6B6B60)',
              }}>
                {durationLabel(form.schedule)}
                {form.schedule.endDate !== form.schedule.startDate && !form.schedule.allDay
                  ? ' · runs past midnight' : ''}
              </p>
            )}
          </div>
        </fieldset>

        {/* ── Type ──────────────────────────────────────────────────────
            Sixteen options, grouped into four headings. Grouping is what keeps
            the choice cheap: you scan four headings, not sixteen labels. */}
        <div className="field" style={{ marginBottom: 14 }}>
          <label htmlFor="ev-type" className="field-label">Event type</label>
          <select
            id="ev-type"
            className="form-select"
            value={form.eventType}
            onChange={e => update('eventType', e.target.value)}
          >
            {eventTypeGroups().map(g => (
              <optgroup key={g.group} label={g.group}>
                {g.options.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </optgroup>
            ))}
          </select>
        </div>

        <div className="field" style={{ marginBottom: 14 }}>
          <label htmlFor="ev-loc" className="field-label">
            <MapPin size={11} style={{ display: 'inline', marginRight: 3, verticalAlign: '-1px' }} />
            Location
          </label>
          <input
            id="ev-loc"
            className="form-input"
            /* The placeholder carries the "you can skip this" signal, rather
               than an "(optional)" tag on the label. With one required field in
               the whole form, tagging six others as optional is noise that
               makes the form look longer than it is. */
            placeholder="e.g. SAC Lawn — or leave blank"
            value={form.location}
            onChange={e => update('location', e.target.value)}
          />
        </div>

        <div className="field" style={{ marginBottom: 14 }}>
          <label htmlFor="ev-desc" className="field-label">Description</label>
          <textarea
            id="ev-desc"
            className="form-textarea"
            placeholder="Anything people should know — what to bring, who it's for. Optional."
            value={form.description}
            onChange={e => update('description', e.target.value)}
            maxLength={600}
          />
          {errors.description && <span className="field-error">{errors.description}</span>}
        </div>

        <div className="field" style={{ marginBottom: 14 }}>
          <label htmlFor="ev-max" className="field-label">
            Max attendees <span className="field-hint" style={{ fontWeight: 400 }}>(optional)</span>
          </label>
          <input
            id="ev-max"
            type="number" inputMode="numeric" min="1"
            className="form-input"
            placeholder="e.g. 50"
            value={form.maxAttendees ?? ''}
            onChange={e => update('maxAttendees', Number(e.target.value) || undefined)}
          />
        </div>

        {/* ── Registration form (optional) — building happens on a dedicated
           full-page surface; this row is just the doorway + summary. */}
        <section style={{ marginBottom: 14 }}>
          <button
            type="button"
            onClick={() => {
              haptics.selection();
              if (regFields === null) setRegFields([]);
              setRegError(null);
              setBuilderOpen(true);
            }}
            className="press-scale"
            style={{
              display: 'flex', alignItems: 'center', gap: 12, width: '100%',
              padding: '13px 14px', textAlign: 'left',
              background: 'var(--bg-inset)',
              border: 'none',
              borderRadius: 16, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <span style={{
              width: 38, height: 38, borderRadius: 12, flexShrink: 0,
              background: 'rgba(139,92,246,0.12)', color: '#8B5CF6',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }} aria-hidden="true">
              <ClipboardList size={18} strokeWidth={2} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 'calc(13.5px * var(--text-scale))', fontWeight: 600, color: 'var(--text-primary)' }}>
                {regFields !== null && regFields.length > 0
                  ? `Registration form · ${regFields.length} question${regFields.length === 1 ? '' : 's'}`
                  : 'Add a registration form'}
              </span>
              <span style={{ display: 'block', fontSize: 'calc(11.5px * var(--text-scale))', color: 'var(--text-muted)', marginTop: 1 }}>
                {regFields !== null && regFields.length > 0
                  ? 'Tap to edit — people fill it in when they RSVP'
                  : 'Optional — collect names, choices or files when people RSVP'}
              </span>
            </span>
            <ChevronRight size={16} strokeWidth={2} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          </button>
          {regFields !== null && regFields.length > 0 && (
            <button
              type="button"
              onClick={() => { haptics.selection(); setRegFields(null); setRegError(null); }}
              style={{
                marginTop: 6, background: 'none', border: 'none', padding: '2px 4px', cursor: 'pointer',
                fontSize: 'calc(12px * var(--text-scale))', fontWeight: 600, color: 'var(--accent-rose)', fontFamily: 'inherit',
              }}
            >
              Remove form
            </button>
          )}
          {regError && <span className="field-error">{regError}</span>}
        </section>

        {/* ── Event photos (up to 3, drag-reorder, camera or library, auto-compressed) ── */}
        <section>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
            <label className="field-label" style={{ margin: 0 }}>Photos</label>
            <span className="field-hint">Optional — first is cover</span>
          </div>

          {/* PhotoPicker shows its own large preview now. */}
          <PhotoPicker
            ref={pickerRef}
            photos={form.photos}
            onChange={next => update('photos', next)}
            max={MAX_PHOTOS}
          />
        </section>

        {submitError && (
          <div role="alert" style={{
            marginTop: 14, padding: '10px 12px',
            background: 'rgba(237,46,80,0.10)',
            border: '1px solid rgba(237,46,80,0.25)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--accent-rose)',
            fontSize: 'calc(12px * var(--text-scale))', fontWeight: 500,
          }}>
            {submitError}
          </div>
        )}
      </form>
    </Modal>

    {/* Full-page builder — covers the modal + bottom nav; back returns here
        with the event draft untouched. */}
    <FormBuilderScreen
      open={open && builderOpen}
      subtitle={form.title.trim() || 'New event'}
      fields={regFields ?? []}
      onChange={f => { setRegFields(f); setRegError(null); }}
      onBack={closeBuilder}
      onSave={builderSave}
      error={regError}
      saveLabel="Done"
    />
    </>
  );
}
