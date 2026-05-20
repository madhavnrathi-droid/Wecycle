'use client';

import { useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import Modal from '../Modal';
import PhotoPicker, { type PhotoPickerHandle } from '../PhotoPicker';
import { createLostFound } from '../../lib/liveData';
import { isDemoMode } from '../../lib/demoMode';
import { hasSupabaseEnv } from '../../lib/supabase';

const CATEGORIES = [
  'Electronics', 'Bag/Wallet', 'Keys', 'ID/Card', 'Clothing',
  'Books', 'Accessory', 'Other',
];

interface ReportLostFoundModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit?: (data: ReportLFForm) => void;
  defaultStatus?: 'lost' | 'found';
}

export interface ReportLFForm {
  name: string;
  status: 'lost' | 'found' | '';
  category: string;
  location: string;
  dateLastSeen: string;
  description: string;
  contact: string;
  photos: string[];
}

const MAX_PHOTOS = 3;

export default function ReportLostFoundModal({
  open, onClose, onSubmit, defaultStatus,
}: ReportLostFoundModalProps) {
  const [form, setForm] = useState<ReportLFForm>({
    name: '', status: defaultStatus ?? '', category: '',
    location: '', dateLastSeen: '', description: '', contact: '', photos: [],
  });
  const [errors, setErrors] = useState<Partial<Record<keyof ReportLFForm, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const pickerRef = useRef<PhotoPickerHandle>(null);

  const update = <K extends keyof ReportLFForm>(key: K, value: ReportLFForm[K]) => {
    setForm(f => ({ ...f, [key]: value }));
    setErrors(e => ({ ...e, [key]: undefined }));
  };

  const validate = () => {
    const e: typeof errors = {};
    if (!form.name.trim()) e.name = 'Required';
    if (!form.status) e.status = 'Pick status';
    if (!form.category) e.category = 'Pick a category';
    if (!form.location.trim()) e.location = 'Required';
    if (!form.dateLastSeen) e.dateLastSeen = 'Required';
    if (!form.description.trim()) e.description = 'Help others identify it';
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
        await createLostFound({
          title: form.name,
          status: form.status as 'lost' | 'found',
          description: form.description,
          category: form.category,
          lastSeen: form.location,
          media: pickerRef.current?.getMedia() ?? [],
        });
      } else {
        await new Promise(r => setTimeout(r, 400));
      }
      onSubmit?.(form);
      pickerRef.current?.clear();
      setForm({ name: '', status: defaultStatus ?? '', category: '', location: '', dateLastSeen: '', description: '', contact: '', photos: [] });
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
      title="Report lost or found item"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-secondary" style={{ flex: 1 }}>
            Cancel
          </button>
          <button
            type="submit" form="report-lf-form"
            disabled={submitting}
            className="btn btn-primary"
            style={{ flex: 2 }}
          >
            {submitting ? 'Submitting…' : 'Submit report'}
          </button>
        </>
      }
    >
      <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        Help the community reunite items with their owners.
      </p>

      <form id="report-lf-form" onSubmit={handleSubmit} noValidate>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div className="field">
            <label htmlFor="lf-name" className="field-label">
              Item name <span className="required" aria-hidden="true">*</span>
            </label>
            <input
              id="lf-name"
              className="form-input"
              placeholder="e.g. Black backpack"
              value={form.name}
              onChange={e => update('name', e.target.value)}
              aria-required="true"
              aria-invalid={!!errors.name}
            />
            {errors.name && <span className="field-error">{errors.name}</span>}
          </div>
          <div className="field">
            <label htmlFor="lf-status" className="field-label">
              Status <span className="required" aria-hidden="true">*</span>
            </label>
            <select
              id="lf-status"
              className="form-select"
              value={form.status}
              onChange={e => update('status', e.target.value as 'lost' | 'found' | '')}
              aria-required="true"
              aria-invalid={!!errors.status}
            >
              <option value="">Select…</option>
              <option value="lost">I lost this</option>
              <option value="found">I found this</option>
            </select>
            {errors.status && <span className="field-error">{errors.status}</span>}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div className="field">
            <label htmlFor="lf-cat" className="field-label">
              Category <span className="required" aria-hidden="true">*</span>
            </label>
            <select
              id="lf-cat"
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
            <label htmlFor="lf-loc" className="field-label">
              <MapPin size={11} style={{ display: 'inline', marginRight: 3, verticalAlign: '-1px' }} />
              Location <span className="required" aria-hidden="true">*</span>
            </label>
            <input
              id="lf-loc"
              className="form-input"
              placeholder="Where?"
              value={form.location}
              onChange={e => update('location', e.target.value)}
              aria-required="true"
              aria-invalid={!!errors.location}
            />
            {errors.location && <span className="field-error">{errors.location}</span>}
          </div>
        </div>

        <div className="field" style={{ marginBottom: 14 }}>
          <label htmlFor="lf-date" className="field-label">
            Date last seen / found <span className="required" aria-hidden="true">*</span>
          </label>
          <input
            id="lf-date"
            type="date"
            className="form-input"
            value={form.dateLastSeen}
            onChange={e => update('dateLastSeen', e.target.value)}
            max={new Date().toISOString().split('T')[0]}
            aria-required="true"
            aria-invalid={!!errors.dateLastSeen}
          />
          {errors.dateLastSeen && <span className="field-error">{errors.dateLastSeen}</span>}
        </div>

        <div className="field" style={{ marginBottom: 14 }}>
          <label htmlFor="lf-desc" className="field-label">
            Description <span className="required" aria-hidden="true">*</span>
          </label>
          <textarea
            id="lf-desc"
            className="form-textarea"
            placeholder="Distinctive details that help identify the item…"
            value={form.description}
            onChange={e => update('description', e.target.value)}
            aria-required="true"
            aria-invalid={!!errors.description}
            maxLength={400}
          />
          {errors.description && <span className="field-error">{errors.description}</span>}
        </div>

        <div className="field" style={{ marginBottom: 14 }}>
          <label htmlFor="lf-contact" className="field-label">
            Contact phone <span className="field-hint" style={{ fontWeight: 400 }}>(optional)</span>
          </label>
          <input
            id="lf-contact"
            type="tel"
            className="form-input"
            placeholder="+91 …"
            value={form.contact}
            onChange={e => update('contact', e.target.value)}
            autoComplete="tel"
          />
        </div>

        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend className="field-label" style={{ marginBottom: 8 }}>
            Photo <span className="field-hint" style={{ fontWeight: 400 }}>(optional)</span>
          </legend>
          <PhotoPicker
            ref={pickerRef}
            photos={form.photos}
            onChange={next => update('photos', next)}
            max={MAX_PHOTOS}
          />
        </fieldset>

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
