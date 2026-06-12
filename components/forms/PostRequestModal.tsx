'use client';

import { useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import Modal from '../Modal';
import PhotoCarousel from '../PhotoCarousel';
import PhotoPicker, { type PhotoPickerHandle } from '../PhotoPicker';
import { createRequest } from '../../lib/liveData';
import { isDemoMode } from '../../lib/demoMode';
import { hasSupabaseEnv } from '../../lib/supabase';
import { track, EVT } from '../../lib/analytics';
import { haptics } from '../../lib/haptics';

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
  /** Hours until the request auto-expires (24–168). */
  durationHours: number;
}

const MAX_PHOTOS = 3;

/* Human-friendly duration label for the slider. Below 48h we render in
 * hours; once we're a day or more in we shift to "Nd" / "Nd Mh" so the
 * label stays short and predictable in the green pill. */
function formatDuration(hours: number): string {
  const h = Math.max(24, Math.min(168, Math.round(hours)));
  if (h < 48) return `${h}h`;
  const days = Math.floor(h / 24);
  const rem  = h - days * 24;
  if (rem === 0) return `${days}d`;
  return `${days}d ${rem}h`;
}

export default function PostRequestModal({ open, onClose, onSubmit }: PostRequestModalProps) {
  const [form, setForm] = useState<RequestForm>({
    title: '', category: '', urgency: 'normal', description: '',
    needByDate: '', photos: [],
    /* Default to 3 days — comfortable middle of the 24h–7d range, matches
     * the "request feels active but not eternal" community norm. */
    durationHours: 72,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof RequestForm, string>>>({});
  const [notifyOnEngagement, setNotifyOnEngagement] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const pickerRef = useRef<PhotoPickerHandle>(null);

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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (hasSupabaseEnv && !isDemoMode()) {
        await createRequest({
          title: form.title,
          category: form.category,
          description: form.description,
          urgency: form.urgency,
          needByDate: form.needByDate,
          durationHours: form.durationHours,
          media: pickerRef.current?.getMedia() ?? [],
        });
      } else {
        await new Promise(r => setTimeout(r, 400));
      }
      haptics.success();
      track(EVT.post_form_submitted, {
        post_kind: 'request',
        urgency: form.urgency,
        has_need_by: !!form.needByDate,
        duration_hours: form.durationHours,
        has_description: form.description.trim().length > 0,
        category: form.category,
      });
      onSubmit?.(form);
      pickerRef.current?.clear();
      setForm({
        title: '', category: '', urgency: 'normal', description: '',
        needByDate: '', photos: [], durationHours: 72,
      });
      setNotifyOnEngagement(true);
      onClose();
    } catch (err) {
      haptics.error();
      track(EVT.post_form_failed, { post_kind: 'request', reason: (err as Error).message?.slice(0, 80) });
      setSubmitError((err as Error).message || 'Could not post — please try again.');
    } finally {
      setSubmitting(false);
    }
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

        {/* ── Post duration slider (24h–7d) ──
             Auto-expire windowed to keep the requests board fresh and shave
             Supabase storage costs. We snap to discrete steps + ping the
             haptics actuator on each step change so the slider feels
             tactile on phones. Same neon-green as the Post-request CTA so
             the control feels at home. */}
        <fieldset style={{ border: 'none', padding: 0, margin: '0 0 18px' }}>
          <div style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
            marginBottom: 8,
          }}>
            <legend className="field-label">Auto-delete after</legend>
            <span style={{
              fontSize: 13, fontWeight: 700,
              color: '#A8DD00',
              letterSpacing: '-0.01em',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {formatDuration(form.durationHours)}
            </span>
          </div>
          <input
            type="range"
            min={24}
            max={168}
            step={1}
            value={form.durationHours}
            onChange={e => {
              const next = Number(e.target.value);
              /* Light haptic tick at each detent. Centralised through
                 lib/haptics so it also fires on iOS via the Expo bridge,
                 not just Android's Web Vibration API. */
              if (next !== form.durationHours) haptics.selection();
              update('durationHours', next);
            }}
            className="duration-slider"
            aria-label="Auto-delete duration in hours"
            aria-valuetext={formatDuration(form.durationHours)}
            /* Drives the WebKit fill via a CSS variable — Firefox uses
               ::-moz-range-progress natively and ignores this. */
            style={{
              ['--fill' as string]:
                `${Math.round(((form.durationHours - 24) / (168 - 24)) * 100)}%`,
            } as React.CSSProperties}
          />
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            marginTop: 6,
            fontSize: 10, fontWeight: 500,
            color: 'var(--text-muted)',
            letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>
            <span>24h</span>
            <span>3d</span>
            <span>5d</span>
            <span>7d</span>
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
            ref={pickerRef}
            photos={form.photos}
            onChange={next => update('photos', next)}
            max={MAX_PHOTOS}
          />
        </section>

        {/* ── Engagement notification toggle ── */}
        <NotifyToggle
          checked={notifyOnEngagement}
          onChange={setNotifyOnEngagement}
          label="Alert me when someone responds"
          onClose={onClose}
        />

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

/* ── Engagement notification toggle ─────────────────────────────────────── */
function NotifyToggle({
  checked, onChange, label, onClose,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  onClose: () => void;
}) {
  return (
    <div style={{
      margin: '18px 0 4px',
      padding: '12px 14px',
      background: 'var(--bg-inset)',
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border-subtle, rgba(255,255,255,0.07))',
    }}>
      <label style={{
        display: 'flex', alignItems: 'center', gap: 10,
        cursor: 'pointer', userSelect: 'none',
      }}>
        <Bell size={15} strokeWidth={2} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
          {label}
        </span>
        <span style={{ position: 'relative', display: 'inline-block', width: 40, height: 22, flexShrink: 0 }}>
          <input
            type="checkbox"
            checked={checked}
            onChange={e => onChange(e.target.checked)}
            aria-label={label}
            style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
          />
          <span style={{
            position: 'absolute', inset: 0,
            borderRadius: 999,
            background: checked ? 'var(--accent-green, #A8DD00)' : 'var(--border-subtle, rgba(255,255,255,0.15))',
            transition: 'background 200ms',
            cursor: 'pointer',
          }} onClick={() => onChange(!checked)} />
          <span style={{
            position: 'absolute',
            top: 3, left: checked ? 21 : 3,
            width: 16, height: 16,
            borderRadius: '50%',
            background: '#fff',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            transition: 'left 200ms cubic-bezier(.2,.8,.2,1)',
            pointerEvents: 'none',
          }} />
        </span>
      </label>
      <p style={{ margin: '6px 0 0 25px', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        {"We'll send a push notification if you've turned that on in Settings, or an email otherwise."}
        {' '}
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'none', border: 'none', padding: 0,
            color: 'var(--accent-primary, #A8DD00)',
            fontSize: 11, fontWeight: 600, cursor: 'pointer',
            textDecoration: 'underline', textDecorationStyle: 'dotted',
          }}
        >
          Manage in Settings → Notifications
        </button>
      </p>
    </div>
  );
}
