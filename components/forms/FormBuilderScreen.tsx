'use client';

/* ── Registration-form builder: a dedicated full-page surface ──────────────
 * Opens ABOVE everything (event-create modal, detail screen, bottom nav) so
 * the whole UI is the form builder — back arrow top-left returns to exactly
 * where the organizer was, with their event draft intact.
 *
 * Visual language: no bordered boxes — soft white pills floating on the cream
 * base with hairline dividers, matching the app's reference direction.
 */

import { useEffect, useRef } from 'react';
import { ChevronLeft, Trash2, Check, Loader2 } from 'lucide-react';
import FormBuilder from './FormBuilder';
import { lockBodyScroll } from '../../lib/bodyLock';
import type { FormField } from '../../lib/eventForms';

interface FormBuilderScreenProps {
  open: boolean;
  /** Event title (or draft title) shown under the page heading. */
  subtitle?: string;
  fields: FormField[];
  onChange: (next: FormField[]) => void;
  /** Back arrow — return to the flow underneath, keeping edits. */
  onBack: () => void;
  /** Primary action. Validation happens in the caller. */
  onSave: () => void | Promise<void>;
  saving?: boolean;
  /** True while the existing form/responses are still being fetched. */
  loading?: boolean;
  error?: string | null;
  /** When editing a live form that already has responses. */
  responseCount?: number;
  /** Offered only when a saved form exists (owner edit flow). */
  onRemove?: () => void | Promise<void>;
  /** Label for the primary button — "Done" while drafting, "Save form" live. */
  saveLabel?: string;
}

export default function FormBuilderScreen({
  open, subtitle, fields, onChange, onBack, onSave,
  saving, loading, error, responseCount = 0, onRemove, saveLabel = 'Save form',
}: FormBuilderScreenProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  /* Own the viewport: ref-counted body lock (a Modal underneath holds its own
     lock — counting prevents the restore-order wedge), move focus IN, trap
     Tab inside, own Escape (capture phase, so the covered Modal's document
     listener never sees it), and hand focus back on close. */
  useEffect(() => {
    if (!open) return;
    const unlock = lockBodyScroll();
    const prevFocus = document.activeElement as HTMLElement | null;
    const focusTimer = setTimeout(() => {
      rootRef.current?.querySelector<HTMLElement>('button, input, [tabindex]')?.focus();
    }, 30);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onBackRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const root = rootRef.current;
      if (!root) return;
      e.stopPropagation(); /* keep the covered Modal's trap out of it */
      const focusables = Array.from(root.querySelectorAll<HTMLElement>(
        'button, input, textarea, select, [tabindex]:not([tabindex="-1"])',
      )).filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!active || !root.contains(active)) { e.preventDefault(); first.focus(); return; }
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    /* Capture phase → runs before (and suppresses) bubble listeners like
       Modal.tsx's document-level Escape/Tab handling. */
    document.addEventListener('keydown', onKey, true);

    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKey, true);
      unlock();
      prevFocus?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={rootRef}
      data-fbs
      role="dialog"
      aria-modal="true"
      aria-label="Registration form builder"
      style={{
        position: 'fixed', inset: 0, zIndex: 240,
        background: 'var(--bg-base)',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* ── Header — back + hierarchy, hairline underneath ── */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: 'calc(10px + env(safe-area-inset-top)) 16px 10px',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-base)',
        flexShrink: 0,
      }}>
        <button onClick={onBack} aria-label="Back" className="theme-toggle">
          <ChevronLeft size={20} strokeWidth={1.8} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 'calc(17px * var(--text-scale))', fontWeight: 700, letterSpacing: '-0.015em', color: 'var(--text-primary)' }}>
            Registration form
          </h1>
          {subtitle && (
            <p style={{
              margin: '1px 0 0', fontSize: 'calc(12px * var(--text-scale))', color: 'var(--text-muted)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {subtitle}
            </p>
          )}
        </div>
      </header>

      {/* ── Scrollable canvas ── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ maxWidth: 620, margin: '0 auto', padding: '20px 20px 140px' }}>
          <p style={{ margin: '0 0 18px', fontSize: 'calc(12.5px * var(--text-scale))', color: 'var(--text-muted)', lineHeight: 1.55 }}>
            People answer these questions when they RSVP — their responses land
            in your event&rsquo;s Insights.
          </p>

          {responseCount > 0 && !loading && (
            <div style={{
              padding: '10px 14px', marginBottom: 16,
              background: 'rgba(245,132,0,0.10)',
              borderRadius: 14,
              fontSize: 'calc(12.5px * var(--text-scale))', lineHeight: 1.5, color: 'var(--text-primary)',
            }}>
              ⚠️ {responseCount} response{responseCount === 1 ? '' : 's'} already collected.
              Existing answers keep their values — edits apply to future submissions.
            </div>
          )}

          {loading ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '48px 0', color: 'var(--text-muted)', fontSize: 'calc(13px * var(--text-scale))',
            }}>
              <Loader2 size={15} strokeWidth={2.2} className="spin" /> Loading your form…
            </div>
          ) : (
            <FormBuilder fields={fields} onChange={onChange} />
          )}

          {error && (
            <div role="alert" style={{
              marginTop: 16, padding: '10px 14px',
              background: 'rgba(237,46,80,0.10)',
              borderRadius: 14,
              color: 'var(--accent-rose)', fontSize: 'calc(12.5px * var(--text-scale))', fontWeight: 500,
            }}>
              {error}
            </div>
          )}
        </div>
      </div>

      {/* ── Floating action pill — soft shadow, no bordered bar ── */}
      <div style={{
        position: 'absolute', left: 0, right: 0,
        bottom: 'calc(16px + env(safe-area-inset-bottom))',
        display: 'flex', justifyContent: 'center',
        padding: '0 16px',
        pointerEvents: 'none',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          width: '100%', maxWidth: 480,
          padding: 8,
          background: 'var(--bg-card)',
          borderRadius: 999,
          boxShadow: '0 2px 6px rgba(28,28,26,0.06), 0 12px 36px rgba(28,28,26,0.14)',
          pointerEvents: 'auto',
        }}>
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              disabled={saving}
              aria-label="Remove registration form"
              title="Remove registration form"
              style={{
                width: 44, height: 44, borderRadius: 999, flexShrink: 0,
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--accent-rose)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Trash2 size={17} strokeWidth={1.9} />
            </button>
          )}
          <span style={{
            flex: 1, paddingLeft: onRemove ? 2 : 14,
            fontSize: 'calc(12.5px * var(--text-scale))', color: 'var(--text-muted)', fontWeight: 500,
          }}>
            {fields.length} question{fields.length === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || loading}
            style={{
              height: 44, padding: '0 22px', borderRadius: 999,
              background: 'var(--text-primary)', color: 'var(--bg-base)',
              border: 'none', cursor: saving ? 'wait' : 'pointer',
              fontSize: 'calc(13.5px * var(--text-scale))', fontWeight: 600, letterSpacing: '-0.01em',
              display: 'inline-flex', alignItems: 'center', gap: 7,
              fontFamily: 'inherit',
            }}
          >
            {saving
              ? <><Loader2 size={15} strokeWidth={2.2} className="spin" /> Saving…</>
              : <><Check size={15} strokeWidth={2.4} /> {saveLabel}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
