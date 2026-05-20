'use client';

import { useEffect, useState } from 'react';
import { Trash2, RefreshCw, MapPin, Gift, Tag, Eye, EyeOff, AlertTriangle, Camera } from 'lucide-react';
import Modal from '../Modal';
import PhotoCarousel from '../PhotoCarousel';
import PhotoPicker from '../PhotoPicker';
import type { MarketplaceItem } from '../../lib/mockData';
import { getItemPhotos } from '../../lib/photos';

const CATEGORIES = [
  'Electronics', 'Furniture', 'Books', 'Stationery', 'Sports',
  'Tools', 'Kitchen', 'Lab', 'Art', 'Clothing', 'Services', 'Other',
];
const CONDITIONS = [
  { value: 'like_new', label: 'Like new' },
  { value: 'good',     label: 'Good' },
  { value: 'fair',     label: 'Fair' },
];

export interface EditItemForm {
  title: string;
  category: string;
  condition: string;
  description: string;
  location: string;
  pricing: 'free' | 'sell' | 'borrow' | 'swap';
  price?: number;
  isHidden: boolean;
  photos: string[];
}

const MAX_PHOTOS = 3;

interface EditItemModalProps {
  open: boolean;
  onClose: () => void;
  item: MarketplaceItem;
  initiallyHidden?: boolean;
  onSave?: (data: EditItemForm) => void | Promise<void>;    // in-place update (does NOT bump feed)
  onRepost?: (data: EditItemForm) => void | Promise<void>;  // saves AND bumps to top of feed
  onDelete?: () => void | Promise<void>;
}

export default function EditItemModal({
  open, onClose, item, initiallyHidden = false,
  onSave, onRepost, onDelete,
}: EditItemModalProps) {
  const [form, setForm] = useState<EditItemForm>({
    title: '', category: '', condition: '', description: '',
    location: '', pricing: 'free', price: undefined, isHidden: false,
    photos: [],
  });
  const [errors, setErrors] = useState<Partial<Record<keyof EditItemForm, string>>>({});
  const [submitting, setSubmitting] = useState<'save' | 'repost' | 'delete' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  /* Hydrate form from item when modal opens */
  useEffect(() => {
    if (!open) return;
    setForm({
      title: item.title,
      category: item.category,
      condition: item.condition,
      description: item.description ?? '',
      location: item.location,
      pricing: item.listingType,
      price: item.price,
      isHidden: initiallyHidden,
      photos: getItemPhotos(item.id, item.category).slice(0, MAX_PHOTOS),
    });
    setErrors({});
    setConfirmDelete(false);
  }, [open, item, initiallyHidden]);

  const update = <K extends keyof EditItemForm>(key: K, value: EditItemForm[K]) => {
    setForm(f => ({ ...f, [key]: value }));
    setErrors(e => ({ ...e, [key]: undefined }));
  };

  const validate = () => {
    const e: typeof errors = {};
    if (!form.title.trim()) e.title = 'Required';
    if (!form.category) e.category = 'Pick a category';
    if (!form.condition) e.condition = 'Pick a condition';
    if (!form.location.trim()) e.location = 'Where can people pick this up?';
    if (form.pricing === 'sell' && (!form.price || form.price <= 0)) e.price = 'Set a price';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const [actionError, setActionError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!validate()) return;
    setSubmitting('save');
    setActionError(null);
    try {
      await onSave?.(form);
      onClose();
    } catch (e) {
      setActionError((e as Error).message || 'Could not save changes.');
    } finally {
      setSubmitting(null);
    }
  };

  const handleRepost = async () => {
    if (!validate()) return;
    setSubmitting('repost');
    setActionError(null);
    try {
      await onRepost?.(form);
      onClose();
    } catch (e) {
      setActionError((e as Error).message || 'Could not repost.');
    } finally {
      setSubmitting(null);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setSubmitting('delete');
    setActionError(null);
    try {
      await onDelete?.();
      onClose();
    } catch (e) {
      setActionError((e as Error).message || 'Could not delete.');
      setSubmitting(null);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit your post"
      footer={
        <div style={{ display: 'flex', gap: 8, width: '100%' }}>
          <button
            type="button"
            onClick={handleSave}
            disabled={!!submitting}
            className="btn btn-secondary"
            style={{ flex: 1 }}
          >
            {submitting === 'save' ? 'Saving…' : 'Save changes'}
          </button>
          <button
            type="button"
            onClick={handleRepost}
            disabled={!!submitting}
            className="btn btn-primary"
            style={{ flex: 1, gap: 5 }}
            title="Saves and bumps to the top of the community feed"
          >
            <RefreshCw size={13} strokeWidth={2.5} />
            {submitting === 'repost' ? 'Reposting…' : 'Save & repost'}
          </button>
        </div>
      }
    >
      <form id="edit-item-form" onSubmit={e => e.preventDefault()} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* ── PHOTOS (carousel + manager) ── */}
        <section>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
            <label className="field-label" style={{ margin: 0 }}>
              Photos
              <span className="field-hint" style={{ fontWeight: 400, marginLeft: 4 }}>
                ({form.photos.length} / {MAX_PHOTOS})
              </span>
            </label>
            {form.photos.length === 0 && (
              <span className="field-hint">First photo is the cover</span>
            )}
          </div>

          {form.photos.length > 0 ? (
            <div style={{
              borderRadius: 16,
              overflow: 'hidden',
              background: 'var(--bg-inset)',
              marginBottom: 8,
            }}>
              <PhotoCarousel
                photos={form.photos}
                aspectRatio="4 / 5"
                dotsPosition="bottom"
                radius={16}
              />
            </div>
          ) : null}

          <PhotoPicker
            photos={form.photos}
            onChange={next => update('photos', next)}
            max={MAX_PHOTOS}
          />
        </section>

        {/* ── Visibility toggle ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: 12,
          background: form.isHidden ? 'var(--bg-inset)' : 'rgba(34,197,94,0.08)',
          border: `1px solid ${form.isHidden ? 'var(--border-subtle)' : 'rgba(34,197,94,0.25)'}`,
          borderRadius: 14,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: form.isHidden ? 'var(--bg-card)' : '#22C55E',
            color: form.isHidden ? 'var(--text-muted)' : '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            {form.isHidden ? <EyeOff size={16} strokeWidth={1.8} /> : <Eye size={16} strokeWidth={1.8} />}
          </div>
          <div style={{ flex: 1, minWidth: 0, lineHeight: 1.3 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              {form.isHidden ? 'Hidden from feed' : 'Live for others'}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
              {form.isHidden
                ? 'No one can see or message you about it.'
                : 'Your community can see this in the feed and marketplace.'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={!form.isHidden}
            aria-label="Toggle visibility"
            onClick={() => update('isHidden', !form.isHidden)}
            className="toggle"
            data-active={!form.isHidden ? '' : undefined}
            style={{ background: form.isHidden ? 'var(--border-default)' : '#22C55E' }}
          />
        </div>

        {/* ── Title ── */}
        <div className="field">
          <label htmlFor="edit-title" className="field-label">
            Title <span className="required" aria-hidden="true">*</span>
          </label>
          <input
            id="edit-title"
            className="form-input"
            value={form.title}
            onChange={e => update('title', e.target.value)}
            aria-invalid={!!errors.title}
          />
          {errors.title && <span className="field-error">{errors.title}</span>}
        </div>

        {/* ── Category + Condition ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field">
            <label htmlFor="edit-cat" className="field-label">
              Category <span className="required" aria-hidden="true">*</span>
            </label>
            <select
              id="edit-cat"
              className="form-select"
              value={form.category}
              onChange={e => update('category', e.target.value)}
              aria-invalid={!!errors.category}
            >
              <option value="">Select…</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {errors.category && <span className="field-error">{errors.category}</span>}
          </div>
          <div className="field">
            <label htmlFor="edit-cond" className="field-label">
              Condition <span className="required" aria-hidden="true">*</span>
            </label>
            <select
              id="edit-cond"
              className="form-select"
              value={form.condition}
              onChange={e => update('condition', e.target.value)}
              aria-invalid={!!errors.condition}
            >
              <option value="">Select…</option>
              {CONDITIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            {errors.condition && <span className="field-error">{errors.condition}</span>}
          </div>
        </div>

        {/* ── Description ── */}
        <div className="field">
          <label htmlFor="edit-desc" className="field-label">Description</label>
          <textarea
            id="edit-desc"
            className="form-textarea"
            value={form.description}
            onChange={e => update('description', e.target.value)}
            maxLength={500}
          />
          <span className="field-hint">{form.description.length}/500</span>
        </div>

        {/* ── Pickup location ── */}
        <div className="field">
          <label htmlFor="edit-loc" className="field-label">
            <MapPin size={11} strokeWidth={2} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
            Pickup location <span className="required" aria-hidden="true">*</span>
          </label>
          <input
            id="edit-loc"
            className="form-input"
            value={form.location}
            onChange={e => update('location', e.target.value)}
            aria-invalid={!!errors.location}
          />
          {errors.location && <span className="field-error">{errors.location}</span>}
        </div>

        {/* ── Pricing chips ── */}
        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend className="field-label" style={{ marginBottom: 8 }}>Pricing</legend>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {[
              { id: 'free',   label: 'Free',   icon: <Gift size={16} strokeWidth={1.8} /> },
              { id: 'borrow', label: 'Borrow', icon: <RefreshCw size={16} strokeWidth={1.8} /> },
              { id: 'swap',   label: 'Swap',   icon: <RefreshCw size={16} strokeWidth={1.8} /> },
              { id: 'sell',   label: 'Sell',   icon: <Tag size={16} strokeWidth={1.8} /> },
            ].map(opt => (
              <button
                key={opt.id}
                type="button"
                className="option-card"
                aria-pressed={form.pricing === opt.id}
                onClick={() => update('pricing', opt.id as EditItemForm['pricing'])}
                style={{ flexDirection: 'row', gap: 8, padding: '12px' }}
              >
                {opt.icon}
                <span style={{ fontWeight: 600, fontSize: 13 }}>{opt.label}</span>
              </button>
            ))}
          </div>

          {form.pricing === 'sell' && (
            <div className="field" style={{ marginTop: 10 }}>
              <label htmlFor="edit-price" className="field-label">
                Price (₹) <span className="required" aria-hidden="true">*</span>
              </label>
              <input
                id="edit-price"
                type="number" inputMode="numeric" min="1"
                className="form-input"
                value={form.price ?? ''}
                onChange={e => update('price', Number(e.target.value) || undefined)}
                aria-invalid={!!errors.price}
              />
              {errors.price && <span className="field-error">{errors.price}</span>}
            </div>
          )}
        </fieldset>

        {/* ── Danger ── */}
        <div style={{
          marginTop: 4,
          paddingTop: 14,
          borderTop: '1px solid var(--border-subtle)',
        }}>
          {confirmDelete ? (
            <div style={{
              padding: 12,
              background: 'rgba(237,46,80,0.08)',
              border: '1px solid rgba(237,46,80,0.25)',
              borderRadius: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <AlertTriangle size={16} strokeWidth={1.8} style={{ color: 'var(--accent-rose)', flexShrink: 0, marginTop: 2 }} />
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                  This will permanently delete the post. Saves and messages will be lost.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="btn btn-secondary btn-sm"
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={submitting === 'delete'}
                  className="btn btn-sm"
                  style={{
                    flex: 1, background: 'var(--accent-rose)', color: '#fff',
                    border: 'none',
                  }}
                >
                  {submitting === 'delete' ? 'Deleting…' : 'Delete forever'}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleDelete}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'transparent', border: 'none',
                padding: 0, cursor: 'pointer',
                color: 'var(--accent-rose)',
                fontSize: 13, fontWeight: 500,
              }}
            >
              <Trash2 size={14} strokeWidth={1.8} />
              Delete this post
            </button>
          )}
        </div>

        {actionError && (
          <div role="alert" style={{
            marginTop: 14, padding: '10px 12px',
            background: 'rgba(237,46,80,0.10)',
            border: '1px solid rgba(237,46,80,0.25)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--accent-rose)',
            fontSize: 12, fontWeight: 500,
          }}>
            {actionError}
          </div>
        )}
      </form>
    </Modal>
  );
}
