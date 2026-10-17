'use client';

import { useEffect } from 'react';
import { X, Tag, Briefcase, Megaphone, Calendar, Binoculars, ChevronRight, type LucideIcon } from '@/lib/icons';
import { track, EVT } from '../lib/analytics';
import { haptics } from '../lib/haptics';
import { useSheet } from '../lib/useSheet';

export type PostKind = 'share' | 'service' | 'request' | 'event' | 'report-lf';

interface PostSheetProps {
  onClose: () => void;
  onSelect: (kind: PostKind) => void;
}

/* Each kind is a thin Phosphor glyph and two lines of type. The emoji in
   tinted squares that were here made every row a coloured box, and five
   coloured boxes in a column read as a menu of stickers rather than a
   choice. Now the words carry the choice and the glyph only labels it. */
const POST_OPTIONS: { id: PostKind; icon: LucideIcon; label: string; desc: string }[] = [
  { id: 'share',     icon: Tag,        label: 'Share an item',      desc: 'Give away, sell, rent out or swap' },
  { id: 'service',   icon: Briefcase,  label: 'Offer a service',    desc: 'A skill, a gig, or help you can give' },
  { id: 'request',   icon: Megaphone,  label: 'Post a request',     desc: 'Ask the campus for what you need' },
  { id: 'event',     icon: Calendar,   label: 'Submit an event',    desc: 'Workshops, drives, meet-ups' },
  { id: 'report-lf', icon: Binoculars, label: 'Report lost / found', desc: 'Help something find its owner' },
];

export default function PostSheet({ onClose, onSelect }: PostSheetProps) {
  /* Fire-once when the sheet opens — the parent decides whether to mount us. */
  useEffect(() => { track(EVT.post_picker_opened); }, []);
  /* Mounted only while shown, so it is always "open" here; closing animates
     out first and then tells the parent. */
  const { sheetRef, backdropRef, requestClose, dragProps } = useSheet({ open: true, onClose });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') requestClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [requestClose]);
  return (
    <>
      <div ref={backdropRef} className="modal-backdrop" onClick={requestClose} aria-hidden="true" />
      <div
        ref={sheetRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="post-sheet-title"
      >
        {/* drag handle */}
        <div className="mobile-only sheet-grab" {...dragProps} style={{ ...dragProps.style, display: 'flex', justifyContent: 'center', padding: '8px 0 6px', marginBottom: -6 }}>
          <div style={{
            width: 36, height: 4,
            background: 'var(--border-strong)',
            borderRadius: 999,
          }} aria-hidden="true" />
        </div>

        <div className="modal-header" onPointerDown={dragProps.onPointerDown} style={{ alignItems: 'flex-start', paddingTop: 12 }}>
          <div style={{ flex: 1 }}>
            <h2 id="post-sheet-title" className="t-title2" style={{ margin: 0, color: 'var(--text-primary)' }}>Create</h2>
            <p className="t-footnote" style={{ margin: '2px 0 0', color: 'var(--text-muted)' }}>
              What would you like to post?
            </p>
          </div>
          <button className="modal-close" onClick={requestClose} aria-label="Close dialog">
            <X size={16} weight="regular" />
          </button>
        </div>

        <div className="modal-body" style={{ gap: 2, paddingTop: 8, paddingLeft: 8, paddingRight: 8 }}>
          {POST_OPTIONS.map(opt => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.id}
                onClick={() => { haptics.selection(); track(EVT.post_kind_selected, { post_kind: opt.id }); onSelect(opt.id); }}
                className="post-option"
              >
                <Icon size={26} aria-hidden="true" />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="t-body" style={{ display: 'block', color: 'var(--text-primary)' }}>{opt.label}</span>
                  <span className="t-footnote" style={{ display: 'block', marginTop: 1, color: 'var(--text-muted)' }}>{opt.desc}</span>
                </span>
                <ChevronRight size={16} aria-hidden="true" style={{ color: 'var(--text-quaternary)', flexShrink: 0 }} />
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
