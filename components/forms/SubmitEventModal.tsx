'use client';

import { useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import Modal from '../Modal';
import PhotoCarousel from '../PhotoCarousel';
import PhotoPicker, { type PhotoPickerHandle } from '../PhotoPicker';
import { createEvent } from '../../lib/liveData';
import { isDemoMode } from '../../lib/demoMode';
import { hasSupabaseEnv } from '../../lib/supabase';

const EVENT_TYPES = [
  { value: 'swap',      label: '🔄 Swap Drive' },
  { value: 'repair',    label: '🔧 Repair Café' },
  { value: 'cleanup',   label: '🌿 Cleanup' },
  { value: 'workshop',  label: '📚 Workshop' },
  { value: 'drive',     label: '🚛 Drive' },
  { value: 'challenge', label: '⚡ Challenge' },
];

interface SubmitEventModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit?: (data: EventForm) => void;
}

export interface EventForm {
  title: string;
  eventType: string;
  date: string;
  time: string;
  location: string;
  description: string;
  maxAttendees?: number;
  photos: string[];
}

const MAX_PHOTOS = 3;

export default function SubmitEventModal({ open, onClose, onSubmit }: SubmitEventModalProps) {
  const [form, setForm] = useState<EventForm>({
    title: '', eventType: '', date: '', time: '', location: '', description: '', photos: [],
  });
  const [errors, setErrors] = useState<Partial<Record<keyof EventForm, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const pickerRef = useRef<PhotoPickerHandle>(null);

  const update = <K extends keyof EventForm>(key: K, value: EventForm[K]) => {
    setForm(f => ({ ...f, [key]: value }));
    setErrors(e => ({ ...e, [key]: undefined }));
  };

  const validate = () => {
    const e: typeof errors = {};
    if (!form.title.trim()) e.title = 'Required';
    if (!form.eventType) e.eventType = 'Pick a type';
    if (!form.date) e.date = 'Required';
    if (!form.time) e.time = 'Required';
    if (!form.location.trim()) e.location = 'Required';
    if (!form.description.trim()) e.description = 'Tell people what to expect';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (hasSupabaseEnv && !isDemoMode()) {
        await createEvent({
          title: form.title,
          eventType: form.eventType as 'swap' | 'repair' | 'cleanup' | 'workshop' | 'drive' | 'challenge',
          date: form.date,
          time: form.time,
          location: form.location,
          description: form.description,
          maxAttendees: form.maxAttendees,
          media: pickerRef.current?.getMedia() ?? [],
        });
      } else {
        await new Promise(r => setTimeout(r, 400));
      }
      onSubmit?.(form);
      pickerRef.current?.clear();
      setForm({ title: '', eventType: '', date: '', time: '', location: '', description: '', photos: [] });
      onClose();
    } catch (err) {
      setSubmitError((err as Error).message || 'Could not submit — please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
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
            className="btn btn-primary"
            style={{ flex: 2 }}
          >
            {submitting ? 'Submitting…' : 'Submit for review'}
          </button>
        </>
      }
    >
      <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
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

        <div className="field" style={{ marginBottom: 14 }}>
          <label htmlFor="ev-type" className="field-label">
            Event type <span className="required" aria-hidden="true">*</span>
          </label>
          <select
            id="ev-type"
            className="form-select"
            value={form.eventType}
            onChange={e => update('eventType', e.target.value)}
            aria-required="true"
            aria-invalid={!!errors.eventType}
          >
            <option value="">Select…</option>
            {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          {errors.eventType && <span className="field-error">{errors.eventType}</span>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div className="field">
            <label htmlFor="ev-date" className="field-label">
              Date <span className="required" aria-hidden="true">*</span>
            </label>
            <input
              id="ev-date"
              type="date"
              className="form-input"
              value={form.date}
              onChange={e => update('date', e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              aria-required="true"
              aria-invalid={!!errors.date}
            />
            {errors.date && <span className="field-error">{errors.date}</span>}
          </div>
          <div className="field">
            <label htmlFor="ev-time" className="field-label">
              Time <span className="required" aria-hidden="true">*</span>
            </label>
            <input
              id="ev-time"
              type="time"
              className="form-input"
              value={form.time}
              onChange={e => update('time', e.target.value)}
              aria-required="true"
              aria-invalid={!!errors.time}
            />
            {errors.time && <span className="field-error">{errors.time}</span>}
          </div>
        </div>

        <div className="field" style={{ marginBottom: 14 }}>
          <label htmlFor="ev-loc" className="field-label">
            <MapPin size={11} style={{ display: 'inline', marginRight: 3, verticalAlign: '-1px' }} />
            Location <span className="required" aria-hidden="true">*</span>
          </label>
          <input
            id="ev-loc"
            className="form-input"
            placeholder="e.g. SAC Lawn"
            value={form.location}
            onChange={e => update('location', e.target.value)}
            aria-required="true"
            aria-invalid={!!errors.location}
          />
          {errors.location && <span className="field-error">{errors.location}</span>}
        </div>

        <div className="field" style={{ marginBottom: 14 }}>
          <label htmlFor="ev-desc" className="field-label">
            Description <span className="required" aria-hidden="true">*</span>
          </label>
          <textarea
            id="ev-desc"
            className="form-textarea"
            placeholder="What is this event? Who is it for? What should attendees bring?"
            value={form.description}
            onChange={e => update('description', e.target.value)}
            aria-required="true"
            aria-invalid={!!errors.description}
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

        {/* ── Event photos (up to 3, drag-reorder, camera or library, auto-compressed) ── */}
        <section>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
            <label className="field-label" style={{ margin: 0 }}>Photos</label>
            <span className="field-hint">Optional — first is cover</span>
          </div>

          {form.photos.length > 0 && (
            <div style={{
              borderRadius: 16, overflow: 'hidden',
              background: 'var(--bg-inset)', marginBottom: 8,
            }}>
              <PhotoCarousel
                photos={form.photos}
                aspectRatio="4 / 5"
                dotsPosition="bottom"
                radius={16}
              />
            </div>
          )}

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
            fontSize: 12, fontWeight: 500,
          }}>
            {submitError}
          </div>
        )}
      </form>
    </Modal>
  );
}
