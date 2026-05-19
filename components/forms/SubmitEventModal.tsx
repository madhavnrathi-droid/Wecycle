'use client';

import { useRef, useState } from 'react';
import { MapPin, Plus, X } from 'lucide-react';
import Modal from '../Modal';
import PhotoCarousel from '../PhotoCarousel';

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const update = <K extends keyof EventForm>(key: K, value: EventForm[K]) => {
    setForm(f => ({ ...f, [key]: value }));
    setErrors(e => ({ ...e, [key]: undefined }));
  };

  const addPhotos = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remaining = MAX_PHOTOS - form.photos.length;
    const toAdd = Array.from(files).slice(0, remaining);
    const urls = toAdd.map(f => URL.createObjectURL(f));
    setForm(f => ({ ...f, photos: [...f.photos, ...urls] }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePhoto = (idx: number) => {
    setForm(f => ({ ...f, photos: f.photos.filter((_, i) => i !== idx) }));
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

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setTimeout(() => {
      onSubmit?.(form);
      setSubmitting(false);
      setForm({ title: '', eventType: '', date: '', time: '', location: '', description: '', photos: [] });
      onClose();
    }, 400);
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

        {/* ── Event photos (up to 3) ── */}
        <section>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
            <label className="field-label" style={{ margin: 0 }}>
              Photos
              <span className="field-hint" style={{ fontWeight: 400, marginLeft: 4 }}>
                ({form.photos.length} / {MAX_PHOTOS} · optional)
              </span>
            </label>
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

          <div className="photo-picker">
            {form.photos.map((src, i) => (
              <div key={src + i} className="photo-picker-tile photo-picker-tile--filled">
                <img src={src} alt="" />
                {i === 0 && <span className="photo-picker-cover">Cover</span>}
                <button
                  type="button"
                  className="photo-picker-remove"
                  aria-label={`Remove photo ${i + 1}`}
                  onClick={() => removePhoto(i)}
                >
                  <X size={12} strokeWidth={2.5} />
                </button>
              </div>
            ))}

            {form.photos.length < MAX_PHOTOS && (
              <button
                type="button"
                className="photo-picker-tile"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Add photo"
              >
                <Plus size={20} strokeWidth={1.8} />
                <span style={{ fontSize: 11, fontWeight: 500 }}>
                  {form.photos.length === 0 ? 'Add' : 'More'}
                </span>
              </button>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            capture="environment"
            style={{ display: 'none' }}
            onChange={e => addPhotos(e.target.files)}
          />
        </section>
      </form>
    </Modal>
  );
}
