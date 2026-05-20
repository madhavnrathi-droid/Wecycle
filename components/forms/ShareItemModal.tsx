'use client';

import { useRef, useState } from 'react';
import { Gift, Tag, MapPin } from 'lucide-react';
import Modal from '../Modal';
import PhotoCarousel from '../PhotoCarousel';
import PhotoPicker, { type PhotoPickerHandle } from '../PhotoPicker';
import { createListingWithMedia } from '../../lib/liveData';
import { isDemoMode } from '../../lib/demoMode';
import { hasSupabaseEnv } from '../../lib/supabase';

const CATEGORIES = [
  'Electronics', 'Furniture', 'Books', 'Stationery', 'Sports',
  'Tools', 'Kitchen', 'Lab', 'Art', 'Clothing', 'Services', 'Other',
];

const CONDITIONS = [
  { value: 'like_new', label: 'Like new' },
  { value: 'good',     label: 'Good' },
  { value: 'fair',     label: 'Fair' },
];

interface ShareItemModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit?: (data: ShareItemForm) => void;
}

export interface ShareItemForm {
  title: string;
  category: string;
  condition: string;
  description: string;
  location: string;
  pricing: 'free' | 'sell';
  price?: number;
  photos: string[];
}

const MAX_PHOTOS = 3;

export default function ShareItemModal({ open, onClose, onSubmit }: ShareItemModalProps) {
  const [form, setForm] = useState<ShareItemForm>({
    title: '', category: '', condition: '', description: '',
    location: '', pricing: 'free', photos: [],
  });
  const [errors, setErrors] = useState<Partial<Record<keyof ShareItemForm, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const pickerRef = useRef<PhotoPickerHandle>(null);

  const update = <K extends keyof ShareItemForm>(key: K, value: ShareItemForm[K]) => {
    setForm(f => ({ ...f, [key]: value }));
    setErrors(e => ({ ...e, [key]: undefined }));
  };

  const validate = () => {
    const e: typeof errors = {};
    if (!form.title.trim()) e.title = 'Required';
    if (!form.category) e.category = 'Pick a category';
    if (!form.condition) e.condition = 'Pick a condition';
    if (!form.location.trim()) e.location = 'Where can people pick this up?';
    if (form.pricing === 'sell' && !form.price) e.price = 'Set a price';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const reset = () => setForm({
    title: '', category: '', condition: '', description: '', location: '', pricing: 'free', photos: [],
  });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (hasSupabaseEnv && !isDemoMode()) {
        /* Real path: upload the picker's compressed blobs + insert the row. */
        await createListingWithMedia({
          title: form.title,
          category: form.category,
          condition: form.condition as 'like_new' | 'good' | 'fair',
          description: form.description,
          location: form.location,
          listingType: form.pricing === 'sell' ? 'sell' : 'free',
          price: form.price,
          media: pickerRef.current?.getMedia() ?? [],
        });
      } else {
        /* Demo path — no backend; just simulate latency. */
        await new Promise(r => setTimeout(r, 400));
      }
      onSubmit?.(form);
      pickerRef.current?.clear();
      reset();
      onClose();
    } catch (err) {
      setSubmitError((err as Error).message || 'Could not post — please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Share an item"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-secondary" style={{ flex: 1 }}>
            Cancel
          </button>
          <button
            type="submit" form="share-item-form"
            disabled={submitting}
            className="btn btn-primary"
            style={{ flex: 2 }}
          >
            {submitting ? 'Sharing…' : 'Share with community'}
          </button>
        </>
      }
    >
      <form id="share-item-form" onSubmit={handleSubmit} noValidate>

        {/* ── PHOTOS at top — visual content first ── */}
        <section style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
            <label className="field-label" style={{ margin: 0 }}>
              Photos <span className="field-hint" style={{ fontWeight: 400, marginLeft: 4 }}>({form.photos.length} / {MAX_PHOTOS})</span>
            </label>
            {form.photos.length === 0 && (
              <span className="field-hint">Optional — first is cover</span>
            )}
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

        <div className="field" style={{ marginBottom: 14 }}>
          <label htmlFor="si-title" className="field-label">
            Title <span className="required" aria-hidden="true">*</span>
          </label>
          <input
            id="si-title"
            className="form-input"
            placeholder="e.g. Physics Textbook 12th Edition"
            value={form.title}
            onChange={e => update('title', e.target.value)}
            aria-required="true"
            aria-invalid={!!errors.title}
            aria-describedby={errors.title ? 'si-title-err' : undefined}
          />
          {errors.title && <span id="si-title-err" className="field-error">{errors.title}</span>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div className="field">
            <label htmlFor="si-cat" className="field-label">
              Category <span className="required" aria-hidden="true">*</span>
            </label>
            <select
              id="si-cat"
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
            <label htmlFor="si-cond" className="field-label">
              Condition <span className="required" aria-hidden="true">*</span>
            </label>
            <select
              id="si-cond"
              className="form-select"
              value={form.condition}
              onChange={e => update('condition', e.target.value)}
              aria-required="true"
              aria-invalid={!!errors.condition}
            >
              <option value="">Select…</option>
              {CONDITIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            {errors.condition && <span className="field-error">{errors.condition}</span>}
          </div>
        </div>

        <div className="field" style={{ marginBottom: 14 }}>
          <label htmlFor="si-desc" className="field-label">Description</label>
          <textarea
            id="si-desc"
            className="form-textarea"
            placeholder="Condition notes, accessories, anything to mention…"
            value={form.description}
            onChange={e => update('description', e.target.value)}
            maxLength={500}
          />
          <span className="field-hint">{form.description.length}/500 characters</span>
        </div>

        <div className="field" style={{ marginBottom: 14 }}>
          <label htmlFor="si-loc" className="field-label">
            <MapPin size={11} strokeWidth={2} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
            Pickup location <span className="required" aria-hidden="true">*</span>
          </label>
          <input
            id="si-loc"
            className="form-input"
            placeholder="e.g. Meera Bhawan, Block 15"
            value={form.location}
            onChange={e => update('location', e.target.value)}
            aria-required="true"
            aria-invalid={!!errors.location}
          />
          {errors.location && <span className="field-error">{errors.location}</span>}
        </div>

        <fieldset style={{ border: 'none', padding: 0, margin: '0 0 14px' }}>
          <legend className="field-label" style={{ marginBottom: 8 }}>Pricing</legend>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button
              type="button"
              className="option-card"
              aria-pressed={form.pricing === 'free'}
              onClick={() => update('pricing', 'free')}
            >
              <Gift size={20} strokeWidth={1.8} />
              <span style={{ fontWeight: 600, fontSize: 13 }}>Free</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Give it away</span>
            </button>
            <button
              type="button"
              className="option-card"
              aria-pressed={form.pricing === 'sell'}
              onClick={() => update('pricing', 'sell')}
            >
              <Tag size={20} strokeWidth={1.8} />
              <span style={{ fontWeight: 600, fontSize: 13 }}>Sell</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Set a price</span>
            </button>
          </div>
          {form.pricing === 'sell' && (
            <div className="field" style={{ marginTop: 10 }}>
              <label htmlFor="si-price" className="field-label">
                Price (₹) <span className="required" aria-hidden="true">*</span>
              </label>
              <input
                id="si-price"
                type="number" inputMode="numeric" min="1"
                className="form-input"
                placeholder="500"
                value={form.price ?? ''}
                onChange={e => update('price', Number(e.target.value) || undefined)}
                aria-invalid={!!errors.price}
              />
              {errors.price && <span className="field-error">{errors.price}</span>}
            </div>
          )}
        </fieldset>

        {submitError && (
          <div role="alert" style={{
            marginTop: 4, padding: '10px 12px',
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
