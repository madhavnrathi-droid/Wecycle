'use client';

import { useEffect, useState } from 'react';
import { Bell, MapPin, IndianRupee, Mail, Phone, Trash2, AlertTriangle } from 'lucide-react';
import Modal from '../Modal';
import {
  createAlert, updateAlert, deleteAlert,
  DURATION_OPTIONS,
  type WecycleAlert, type NotifyChannel, type CreateAlertInput, type StorageMode,
} from '../../lib/alerts';

const CATEGORIES = [
  'Electronics', 'Furniture', 'Books', 'Stationery', 'Sports',
  'Tools', 'Kitchen', 'Lab', 'Art', 'Clothing', 'Other',
];

const CONDITIONS: { value: NonNullable<WecycleAlert['condition']>; label: string }[] = [
  { value: 'any',      label: 'Any condition' },
  { value: 'like_new', label: 'Like new' },
  { value: 'good',     label: 'Good' },
  { value: 'fair',     label: 'Fair' },
];

interface AlertFormModalProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  mode: StorageMode;
  /** When present → edit mode. Omit for create mode. */
  alert?: WecycleAlert | null;
  onSaved?: () => void;
}

export default function AlertFormModal({
  open, onClose, userId, mode, alert, onSaved,
}: AlertFormModalProps) {
  const isEdit = !!alert;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [condition, setCondition] = useState<NonNullable<WecycleAlert['condition']>>('any');
  const [maxPrice, setMaxPrice] = useState<string>('');
  const [locationPref, setLocationPref] = useState('');
  const [notify, setNotify] = useState<NotifyChannel>('email');
  const [durationHours, setDurationHours] = useState<number>(24);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<'save' | 'delete' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  /* Hydrate when opening */
  useEffect(() => {
    if (!open) return;
    if (alert) {
      setTitle(alert.title);
      setDescription(alert.description);
      setCategory(alert.category);
      setCondition(alert.condition ?? 'any');
      setMaxPrice(alert.maxPrice ? String(alert.maxPrice) : '');
      setLocationPref(alert.locationPref ?? '');
      setNotify(alert.notify);
      setDurationHours(alert.durationHours);
    } else {
      setTitle('');
      setDescription('');
      setCategory('');
      setCondition('any');
      setMaxPrice('');
      setLocationPref('');
      setNotify('email');
      setDurationHours(24);
    }
    setErrors({});
    setConfirmDelete(false);
  }, [open, alert]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (title.trim().length < 2) e.title = 'What are you looking for?';
    if (description.trim().length < 5) e.description = 'Give a few details';
    if (!category) e.category = 'Pick a category';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!validate()) return;
    setError(null);
    setSubmitting('save');
    const payload: CreateAlertInput = {
      userId,
      title: title.trim(),
      description: description.trim(),
      category,
      condition: condition === 'any' ? undefined : condition,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      locationPref: locationPref.trim() || undefined,
      notify,
      durationHours,
    };
    try {
      if (isEdit && alert) {
        await updateAlert(alert.id, payload, mode);
      } else {
        await createAlert(payload, mode);
      }
      onSaved?.();
      onClose();
    } catch (e) {
      setError((e as Error).message ?? 'Could not save alert');
    } finally {
      setSubmitting(null);
    }
  };

  const handleDelete = async () => {
    if (!alert) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setError(null);
    setSubmitting('delete');
    try {
      await deleteAlert(alert.id, mode);
      onSaved?.();
      onClose();
    } catch (e) {
      setError((e as Error).message ?? 'Could not delete alert');
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit alert' : 'Create alert'}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-secondary" style={{ flex: 1 }}>
            Cancel
          </button>
          <button
            type="submit"
            form="alert-form"
            disabled={!!submitting}
            className="btn btn-primary"
            style={{ flex: 2, gap: 6 }}
          >
            <Bell size={14} strokeWidth={2} />
            {submitting === 'save' ? 'Saving…' : isEdit ? 'Save changes' : 'Create alert'}
          </button>
        </>
      }
    >
      <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        We'll ping you when someone uploads something matching this alert.
        It auto-deletes when the duration runs out.
      </p>

      <form id="alert-form" onSubmit={e => { e.preventDefault(); handleSave(); }} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Title */}
        <div className="field">
          <label htmlFor="alert-title" className="field-label">
            What are you looking for? <span className="required" aria-hidden="true">*</span>
          </label>
          <input
            id="alert-title"
            type="text"
            className="form-input"
            placeholder="e.g. Casio fx-991 calculator"
            value={title}
            onChange={e => setTitle(e.target.value)}
            aria-invalid={!!errors.title}
            required
          />
          {errors.title && <span className="field-error">{errors.title}</span>}
        </div>

        {/* Description */}
        <div className="field">
          <label htmlFor="alert-desc" className="field-label">
            Details <span className="required" aria-hidden="true">*</span>
          </label>
          <textarea
            id="alert-desc"
            className="form-textarea"
            placeholder="Specs, brand, size — anything that helps match"
            value={description}
            onChange={e => setDescription(e.target.value)}
            aria-invalid={!!errors.description}
            maxLength={400}
          />
          {errors.description && <span className="field-error">{errors.description}</span>}
        </div>

        {/* Category + Condition */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field">
            <label htmlFor="alert-cat" className="field-label">
              Category <span className="required" aria-hidden="true">*</span>
            </label>
            <select
              id="alert-cat"
              className="form-select"
              value={category}
              onChange={e => setCategory(e.target.value)}
              aria-invalid={!!errors.category}
              required
            >
              <option value="">Select…</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {errors.category && <span className="field-error">{errors.category}</span>}
          </div>
          <div className="field">
            <label htmlFor="alert-cond" className="field-label">Condition</label>
            <select
              id="alert-cond"
              className="form-select"
              value={condition}
              onChange={e => setCondition(e.target.value as NonNullable<WecycleAlert['condition']>)}
            >
              {CONDITIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>

        {/* Max price + Location preference */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 12 }}>
          <div className="field">
            <label htmlFor="alert-price" className="field-label">
              <IndianRupee size={11} style={{ display: 'inline', marginRight: 3, verticalAlign: '-1px' }} />
              Max price
            </label>
            <input
              id="alert-price"
              type="number"
              inputMode="numeric"
              min="0"
              className="form-input"
              placeholder="any"
              value={maxPrice}
              onChange={e => setMaxPrice(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="alert-loc" className="field-label">
              <MapPin size={11} style={{ display: 'inline', marginRight: 3, verticalAlign: '-1px' }} />
              Pickup near
            </label>
            <input
              id="alert-loc"
              type="text"
              className="form-input"
              placeholder="any block"
              value={locationPref}
              onChange={e => setLocationPref(e.target.value)}
            />
          </div>
        </div>

        {/* Duration */}
        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend className="field-label" style={{ marginBottom: 8 }}>
            Active for <span className="required" aria-hidden="true">*</span>
          </legend>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {DURATION_OPTIONS.map(opt => (
              <button
                key={opt.hours}
                type="button"
                className="option-card"
                style={{ padding: '10px 6px', flexDirection: 'column', gap: 0 }}
                aria-pressed={durationHours === opt.hours}
                onClick={() => setDurationHours(opt.hours)}
              >
                <span style={{ fontSize: 13, fontWeight: 600 }}>{opt.label}</span>
              </button>
            ))}
          </div>
          <p className="field-hint" style={{ marginTop: 6 }}>
            Auto-deletes after the duration expires.
          </p>
        </fieldset>

        {/* Notify channel */}
        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend className="field-label" style={{ marginBottom: 8 }}>
            Notify me via
          </legend>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <button
              type="button"
              className="option-card"
              aria-pressed={notify === 'email'}
              onClick={() => setNotify('email')}
              style={{ flexDirection: 'column' }}
            >
              <Mail size={18} strokeWidth={1.8} />
              <span style={{ fontSize: 12, fontWeight: 600 }}>Email</span>
            </button>
            <button
              type="button"
              className="option-card"
              aria-pressed={notify === 'phone'}
              onClick={() => setNotify('phone')}
              style={{ flexDirection: 'column' }}
            >
              <Phone size={18} strokeWidth={1.8} />
              <span style={{ fontSize: 12, fontWeight: 600 }}>Phone</span>
            </button>
            <button
              type="button"
              className="option-card"
              aria-pressed={notify === 'both'}
              onClick={() => setNotify('both')}
              style={{ flexDirection: 'column' }}
            >
              <Bell size={18} strokeWidth={1.8} />
              <span style={{ fontSize: 12, fontWeight: 600 }}>Both</span>
            </button>
          </div>
          <p className="field-hint" style={{ marginTop: 6 }}>
            You'll always see a push notification in the app.
          </p>
        </fieldset>

        {error && (
          <div role="alert" style={{
            padding: '10px 12px',
            background: 'rgba(237,46,80,0.10)',
            border: '1px solid rgba(237,46,80,0.25)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--accent-rose)',
            fontSize: 12, fontWeight: 500,
          }}>
            {error}
          </div>
        )}

        {/* Delete (edit mode only) */}
        {isEdit && (
          <div style={{ paddingTop: 10, borderTop: '1px solid var(--border-subtle)' }}>
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
                    Delete this alert? You won't be notified about new matches.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button type="button" onClick={() => setConfirmDelete(false)} className="btn btn-secondary btn-sm" style={{ flex: 1 }}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={submitting === 'delete'}
                    className="btn btn-sm"
                    style={{ flex: 1, background: 'var(--accent-rose)', color: '#fff', border: 'none' }}
                  >
                    {submitting === 'delete' ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleDelete}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
                  color: 'var(--accent-rose)', fontSize: 13, fontWeight: 500,
                }}
              >
                <Trash2 size={14} strokeWidth={1.8} />
                Delete this alert
              </button>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}
