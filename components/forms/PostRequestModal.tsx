'use client';

import { useState } from 'react';
import Modal from '../Modal';
import PhotoCarousel from '../PhotoCarousel';
import PhotoPicker from '../PhotoPicker';

const CATEGORIES = [
  'Electronics', 'Furniture', 'Books', 'Stationery', 'Sports',
  'Tools', 'Kitchen', 'Lab', 'Art', 'Clothing', 'Services', 'Other',
];

interface PostRequestModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit?: (data: RequestForm) => void;
}

export interface RequestForm {
  title: string;
  category: string;
  urgency: 'normal' | 'urgent';
  description: string;
  needByDate: string;
  photos: string[];
}

const MAX_PHOTOS = 3;

export default function PostRequestModal({ open, onClose, onSubmit }: PostRequestModalProps) {
  const [form, setForm] = useState<RequestForm>({
    title: '', category: '', urgency: 'normal', description: '', needByDate: '', photos: [],
  });
  const [errors, setErrors] = useState<Partial<Record<keyof RequestForm, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  const update = <K extends keyof RequestForm>(key: K, value: RequestForm[K]) => {
    setForm(f => ({ ...f, [key]: value }));
    setErrors(e => ({ ...e, [key]: undefined }));
  };

  const validate = () => {
    const e: typeof errors = {};
    if (!form.title.trim()) e.title = 'Required';
    if (!form.category) e.category = 'Pick a category';
    if (!form.description.trim()) e.description = 'Help people understand';
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
      setForm({ title: '', category: '', urgency: 'normal', description: '', needByDate: '', photos: [] });
      onClose();
    }, 400);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Post a request"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-secondary" style={{ flex: 1 }}>
            Cancel
          </button>
          <button
            type="submit" form="request-form"
            disabled={submitting}
            className="btn btn-primary"
            style={{ flex: 2 }}
          >
            {submitting ? 'Posting…' : 'Post request'}
          </button>
        </>
      }
    >
      <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        Ask your community for what you need.
      </p>

      <form id="request-form" onSubmit={handleSubmit} noValidate>
        <div className="field" style={{ marginBottom: 14 }}>
          <label htmlFor="rq-title" className="field-label">
            What are you looking for? <span className="required" aria-hidden="true">*</span>
          </label>
          <input
            id="rq-title"
            className="form-input"
            placeholder="e.g. Casio fx-991 calculator"
            value={form.title}
            onChange={e => update('title', e.target.value)}
            aria-required="true"
            aria-invalid={!!errors.title}
          />
          {errors.title && <span className="field-error">{errors.title}</span>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div className="field">
            <label htmlFor="rq-cat" className="field-label">
              Category <span className="required" aria-hidden="true">*</span>
            </label>
            <select
              id="rq-cat"
              className="form-select"
              value={form.category}
              onChange={e => update('category', e.target.value)}
              aria-required="true"
              aria-invalid={!!errors.category}
            >
              <option value="">Select…</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {errors.category && <span className="field-error">{errors.category}</span>}
          </div>
          <div className="field">
            <label htmlFor="rq-by" className="field-label">
              Need by <span className="field-hint" style={{ fontWeight: 400 }}>(optional)</span>
            </label>
            <input
              id="rq-by"
              type="date"
              className="form-input"
              value={form.needByDate}
              onChange={e => update('needByDate', e.target.value)}
              min={new Date().toISOString().split('T')[0]}
            />
          </div>
        </div>

        <div className="field" style={{ marginBottom: 14 }}>
          <label htmlFor="rq-desc" className="field-label">
            Details <span className="required" aria-hidden="true">*</span>
          </label>
          <textarea
            id="rq-desc"
            className="form-textarea"
            placeholder="When you need it, condition, return timeline, what you can swap…"
            value={form.description}
            onChange={e => update('description', e.target.value)}
            aria-required="true"
            aria-invalid={!!errors.description}
            maxLength={500}
          />
          {errors.description && <span className="field-error">{errors.description}</span>}
        </div>

        <fieldset style={{ border: 'none', padding: 0, margin: '0 0 16px' }}>
          <legend className="field-label" style={{ marginBottom: 8 }}>Urgency</legend>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button
              type="button"
              className="option-card"
              aria-pressed={form.urgency === 'normal'}
              onClick={() => update('urgency', 'normal')}
            >
              <span style={{ fontSize: 22 }}>🙂</span>
              <span style={{ fontWeight: 600, fontSize: 13 }}>No rush</span>
            </button>
            <button
              type="button"
              className="option-card"
              aria-pressed={form.urgency === 'urgent'}
              onClick={() => update('urgency', 'urgent')}
            >
              <span style={{ fontSize: 22 }}>⚡</span>
              <span style={{ fontWeight: 600, fontSize: 13 }}>Urgent</span>
            </button>
          </div>
        </fieldset>

        {/* ── Optional reference photos (auto-compressed, camera or library) ── */}
        <section>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
            <label className="field-label" style={{ margin: 0 }}>Reference photos</label>
            <span className="field-hint">Optional</span>
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
            photos={form.photos}
            onChange={next => update('photos', next)}
            max={MAX_PHOTOS}
          />
        </section>
      </form>
    </Modal>
  );
}
