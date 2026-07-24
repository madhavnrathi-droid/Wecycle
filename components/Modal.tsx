'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { lockBodyScroll } from '../lib/bodyLock';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** width override for desktop */
  maxWidth?: number;
}

/**
 * Accessible modal: focus trap, Escape closes, body scroll lock,
 * ARIA roles, returns focus on close. Mobile = bottom sheet, desktop = dialog.
 */
export default function Modal({
  open, onClose, title, children, footer, maxWidth,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  /* Keep the latest onClose without retriggering the effect every parent re-render.
     (Stale-closure bug otherwise stole focus from inputs on each keystroke.) */
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  /* Body scroll lock — ref-counted so a full-page surface layered above
     (e.g. the form builder) can hold its own lock without the restore order
     wedging the body. */
  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  /* Keyboard + focus management — runs ONLY when the modal opens/closes */
  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement;

    /* Pick the best initial focus target. Prefer an explicit [autoFocus]
       inside the modal body so we don't steal focus from form fields. */
    const autoFocused = modalRef.current?.querySelector<HTMLElement>('[autofocus]');
    const focusables = getFocusableElements(modalRef.current);
    /* Skip the close-X button as initial focus target — almost always a form field is better. */
    const target = autoFocused
      ?? focusables.find(el => !el.classList.contains('modal-close'))
      ?? focusables[0]
      ?? modalRef.current;
    target?.focus();

    const handleKey = (e: KeyboardEvent) => {
      /* A full-page surface (form builder, [data-fbs]) layered above this
         modal owns the keyboard — stand down so Escape doesn't rip through
         both layers and Tab isn't yanked back into the covered modal. */
      if (document.querySelector('[data-fbs]')) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;

      const list = getFocusableElements(modalRef.current);
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      previousFocusRef.current?.focus?.();
    };
  }, [open]);  /* ← intentionally NOT depending on onClose */

  if (!open) return null;

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        ref={modalRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        style={maxWidth ? { maxWidth } : undefined}
        tabIndex={-1}
      >
        {/* Mobile drag handle (purely decorative) */}
        <div className="mobile-only" style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 0' }}>
          <div style={{
            width: 36, height: 4,
            background: 'var(--border-strong)',
            borderRadius: 999,
          }} aria-hidden="true" />
        </div>

        <div className="modal-header">
          <h2 id="modal-title" className="modal-title">{title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close dialog">
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <div className="modal-body">{children}</div>

        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </>
  );
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter(el => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement);
}
