'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { track, EVT } from '../lib/analytics';
import { haptics } from '../lib/haptics';

export type PostKind = 'share' | 'service' | 'request' | 'event' | 'report-lf';

interface PostSheetProps {
  onClose: () => void;
  onSelect: (kind: PostKind) => void;
}

const POST_OPTIONS: { id: PostKind; icon: string; label: string; desc: string; color: string }[] = [
  {
    id: 'share',
    icon: '🎁', label: 'Share an item', desc: 'Give or sell something to your community',
    color: '#22C55E',
  },
  {
    id: 'service',
    icon: '🛠️', label: 'Offer a service', desc: 'A skill, gig, or help you can provide',
    color: '#8B5CF6',
  },
  {
    id: 'request',
    icon: '🙋', label: 'Post a request', desc: 'Ask your community for what you need',
    color: '#FF9A40',
  },
  {
    id: 'event',
    icon: '📅', label: 'Submit an event', desc: 'Swap drive, repair café, workshop',
    color: '#3DD6F5',
  },
  {
    id: 'report-lf',
    icon: '🔍', label: 'Report lost / found', desc: 'Reunite items with their owners',
    color: '#FF6B80',
  },
];

export default function PostSheet({ onClose, onSelect }: PostSheetProps) {
  /* Fire-once when the sheet opens — the parent decides whether to mount us. */
  useEffect(() => { track(EVT.post_picker_opened); }, []);
  return (
    <>
      <div className="modal-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="post-sheet-title"
      >
        {/* drag handle */}
        <div className="mobile-only" style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 0' }}>
          <div style={{
            width: 36, height: 4,
            background: 'var(--border-strong)',
            borderRadius: 999,
          }} aria-hidden="true" />
        </div>

        <div className="modal-header">
          <div style={{ flex: 1 }}>
            <h2 id="post-sheet-title" className="modal-title">Create a post</h2>
            <p style={{ margin: '2px 0 0', fontSize: 'calc(12px * var(--text-scale))', color: 'var(--text-muted)' }}>
              What would you like to do?
            </p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close dialog">
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <div className="modal-body" style={{ gap: 8 }}>
          {POST_OPTIONS.map(opt => (
            <button
              key={opt.id}
              onClick={() => { haptics.selection(); track(EVT.post_kind_selected, { post_kind: opt.id }); onSelect(opt.id); }}
              className="press-scale"
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                background: 'var(--bg-inset)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-lg)', padding: '14px',
                cursor: 'pointer', textAlign: 'left', width: '100%',
                color: 'var(--text-primary)',
              }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 'var(--radius-md)',
                background: `${opt.color}1A`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 'calc(22px * var(--text-scale))', flexShrink: 0,
              }} aria-hidden="true">
                {opt.icon}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 'calc(14px * var(--text-scale))', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {opt.label}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 'calc(12px * var(--text-scale))', color: 'var(--text-secondary)' }}>
                  {opt.desc}
                </p>
              </div>
              <span aria-hidden="true" style={{ color: 'var(--text-muted)', fontSize: 'calc(18px * var(--text-scale))' }}>›</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
