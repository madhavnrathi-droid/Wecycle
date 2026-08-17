'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../lib/AuthContext';
import { X, Check, Loader2 } from 'lucide-react';
import { REPORT_REASONS, reportContent, blockUser, reportMailto } from '../lib/moderation';
import type { ReportTargetType } from '../lib/moderation';
import { Z_LAYER, zPanel } from '../lib/zLayers';

type ReportReason = typeof REPORT_REASONS[number];

interface ReportSheetProps {
  open: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetId: string;
  targetUserId?: string;
  targetLabel?: string;
  onReported?: () => void;
}

export default function ReportSheet({
  open,
  onClose,
  targetType,
  targetId,
  targetUserId,
  targetLabel,
  onReported,
}: ReportSheetProps) {
  const [selectedReason, setSelectedReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [blockConfirm, setBlockConfirm] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);
  /* reportContent/blockUser return false on failure — including when the
     viewer isn't signed in, since the RLS policies key on auth.uid(). Both
     used to swallow that: the report button just reset, and Block closed the
     sheet as if it had worked. */
  const [actionError, setActionError] = useState<string | null>(null);
  const { user, isDemo } = useAuth();

  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<Element | null>(null);
  const prevOpen = useRef(false);

  /* save trigger element + scroll lock */
  useEffect(() => {
    if (open && !prevOpen.current) {
      triggerRef.current = document.activeElement;
      document.body.style.overflow = 'hidden';
      // reset state on open
      setSelectedReason(null);
      setDetails('');
      setSubmitted(false);
      setBlockConfirm(false);
      setTimeout(() => closeButtonRef.current?.focus(), 50);
    }
    if (!open && prevOpen.current) {
      document.body.style.overflow = '';
      if (triggerRef.current && 'focus' in triggerRef.current) {
        (triggerRef.current as HTMLElement).focus();
      }
    }
    prevOpen.current = open;
  }, [open]);

  /* ESC closes */
  useEffect(() => {
    if (!open) return;
    /* Capture phase + preventDefault + stopPropagation: this sheet sits ABOVE
       the desktop detail theatre, so Escape must close only the sheet. Bubbling
       it also closed the product underneath. Same approach FormBuilderScreen
       already uses. */
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [open, onClose]);

  /* focus trap */
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]),textarea,[tabindex]:not([tabindex="-1"])'
        )
      ).filter(el => !el.closest('[aria-hidden="true"]'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    panel.addEventListener('keydown', handleTab);
    return () => panel.removeEventListener('keydown', handleTab);
  }, [open]);

  const handleSubmit = useCallback(async () => {
    if (!selectedReason || loading) return;
    setActionError(null);
    if (!user && !isDemo) {
      setActionError('Sign in to report this — reports are tied to your account so we can follow up.');
      return;
    }
    setLoading(true);
    const ok = await reportContent({
      targetType,
      targetId,
      targetUserId,
      reason: selectedReason,
      details: details.trim() || undefined,
    });
    setLoading(false);
    if (ok) {
      setSubmitted(true);
      /* Two channels on purpose. The insert has already fired the trigger that
         notifies admins in-app; this opens the reporter's mail client with the
         whole thing prefilled — reason, reference, and a link to the post — so
         a serious report also reaches a human who is not currently looking at
         Wecycle. Fired after the row is committed, so cancelling the email
         loses nothing: the report already stands. */
      try {
        window.location.href = reportMailto({
          targetType,
          targetId,
          reason: selectedReason,
          details: details.trim() || undefined,
          reporterEmail: user?.email ?? null,
        });
      } catch { /* no mail client — report + admin ping still stand */ }
      setTimeout(() => {
        onReported?.();
        onClose();
      }, 1800);
    } else {
      setActionError('That report didn’t go through. Check your connection and try again.');
    }
  }, [selectedReason, loading, user, isDemo, targetType, targetId, targetUserId, details, onReported, onClose]);

  const handleBlock = useCallback(async () => {
    if (!targetUserId) return;
    setActionError(null);
    if (!user && !isDemo) {
      setActionError('Sign in to block someone — the block is saved to your account.');
      return;
    }
    if (!blockConfirm) { setBlockConfirm(true); return; }
    setBlockLoading(true);
    const ok = await blockUser(targetUserId);
    setBlockLoading(false);
    /* Only dismiss on success. Closing regardless reported a block that never
       happened, and the person stayed visible. */
    if (ok) { onClose(); return; }
    setBlockConfirm(false);
    setActionError('Couldn’t block them just now. Check your connection and try again.');
  }, [targetUserId, blockConfirm, user, isDemo, onClose]);

  if (!open) return null;

  const label = targetLabel ?? 'this';

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          zIndex: Z_LAYER.dialog,
        }}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Report content"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: zPanel(Z_LAYER.dialog),
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-end',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 480,
            background: 'var(--bg-card)',
            borderRadius: '20px 20px 0 0',
            padding: '20px 20px calc(20px + env(safe-area-inset-bottom, 0px))',
            pointerEvents: 'all',
            boxSizing: 'border-box',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ flex: 1, fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
              Report
            </span>
            <button
              ref={closeButtonRef}
              onClick={onClose}
              aria-label="Close"
              style={{
                width: 36,
                height: 36,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                background: 'transparent',
                borderRadius: 8,
                cursor: 'pointer',
                color: 'var(--text-muted)',
              }}
            >
              <X size={18} strokeWidth={2} />
            </button>
          </div>

          {submitted ? (
            /* Success state */
            <div style={{
              textAlign: 'center',
              padding: '24px 0 8px',
              color: 'var(--text-primary)',
            }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
              <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
                Report submitted
              </p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Thanks for keeping Wecycle safe.
              </p>
            </div>
          ) : (
            <>
              {/* Intro */}
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
                Tell us what&apos;s wrong with {label}. We review reports within 24 hours.
              </p>

              {/* Reason list */}
              <div
                role="radiogroup"
                aria-label="Report reason"
                style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}
              >
                {REPORT_REASONS.map(reason => {
                  const checked = selectedReason === reason;
                  return (
                    <button
                      key={reason}
                      role="radio"
                      aria-checked={checked}
                      onClick={() => setSelectedReason(reason as ReportReason)}
                      style={{
                        minHeight: 44,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 14px',
                        border: `1px solid var(--border-default)`,
                        borderRadius: 12,
                        background: checked ? 'var(--bg-inset)' : 'transparent',
                        cursor: 'pointer',
                        fontSize: 14,
                        color: 'var(--text-primary)',
                        textAlign: 'left',
                        transition: 'background 0.15s',
                      }}
                    >
                      <span>{reason}</span>
                      {checked && <Check size={16} strokeWidth={2.5} color="var(--accent-green)" />}
                    </button>
                  );
                })}
              </div>

              {/* Details textarea */}
              <div style={{ marginBottom: 18 }}>
                <label
                  style={{ fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}
                >
                  Add details (optional)
                </label>
                <textarea
                  rows={4}
                  maxLength={1000}
                  value={details}
                  onChange={e => setDetails(e.target.value)}
                  placeholder="Any additional context…"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '10px 12px',
                    border: '1px solid var(--border-default)',
                    borderRadius: 12,
                    background: 'var(--bg-inset, var(--bg-card))',
                    color: 'var(--text-primary)',
                    fontSize: 14,
                    resize: 'vertical',
                    fontFamily: 'inherit',
                    outline: 'none',
                  }}
                />
                <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  {details.length}/1000
                </div>
              </div>

              {/* Why the last attempt didn't work. Without this the report
                  button simply reset and Block closed as if it had succeeded. */}
              {actionError && (
                <div role="alert" style={{
                  marginBottom: 10, padding: '10px 12px', borderRadius: 12,
                  background: 'rgba(237,46,80,0.10)', color: 'var(--accent-rose)',
                  fontSize: 12.5, fontWeight: 500, lineHeight: 1.45,
                }}>
                  {actionError}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={onClose}
                  style={{
                    flex: 1,
                    height: 44,
                    border: '1px solid var(--border-default)',
                    borderRadius: 12,
                    background: 'var(--bg-surface, transparent)',
                    color: 'var(--text-primary)',
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!selectedReason || loading}
                  style={{
                    flex: 1,
                    height: 44,
                    border: 'none',
                    borderRadius: 12,
                    background: selectedReason ? 'var(--text-primary)' : 'var(--border-default)',
                    color: 'var(--bg-base, #fff)',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: selectedReason ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    transition: 'background 0.15s',
                  }}
                >
                  {loading ? (
                    <Loader2 size={16} strokeWidth={2} style={{ animation: 'spin 1s linear infinite' }} />
                  ) : (
                    'Submit report'
                  )}
                </button>
              </div>

              {/* Block user section */}
              {targetUserId && (
                <>
                  <div style={{
                    borderTop: '1px solid var(--border-default)',
                    margin: '16px 0 12px',
                  }} />
                  {blockConfirm ? (
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>
                        Block? You won&apos;t see their content or messages.
                      </p>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                        <button
                          onClick={() => setBlockConfirm(false)}
                          style={{
                            padding: '8px 18px',
                            border: '1px solid var(--border-default)',
                            borderRadius: 10,
                            background: 'transparent',
                            color: 'var(--text-muted)',
                            fontSize: 13,
                            cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleBlock}
                          disabled={blockLoading}
                          style={{
                            padding: '8px 18px',
                            border: 'none',
                            borderRadius: 10,
                            background: 'var(--accent-rose)',
                            color: '#fff',
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: blockLoading ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          {blockLoading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : 'Block'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center' }}>
                      <button
                        onClick={handleBlock}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--accent-rose)',
                          fontSize: 14,
                          cursor: 'pointer',
                          padding: '4px 8px',
                        }}
                      >
                        Block this user
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}
