'use client';

import { X, Camera, Gift, HelpCircle, Repeat2, CalendarDays, Wrench, Search } from 'lucide-react';

interface PostSheetProps {
  onClose: () => void;
}

const POST_OPTIONS = [
  {
    id: 'share',
    icon: '🎁', label: 'Share / Donate', desc: 'Give an item to your community',
    color: '#22C55E', bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.25)',
  },
  {
    id: 'request',
    icon: '🙋', label: 'Request Something', desc: 'Ask your community for help',
    color: '#FF9A40', bg: 'rgba(255,154,64,0.12)', border: 'rgba(255,154,64,0.25)',
  },
  {
    id: 'swap',
    icon: '🔄', label: 'Swap / Exchange', desc: 'Trade something you have',
    color: '#6C63FF', bg: 'rgba(108,99,255,0.12)', border: 'rgba(108,99,255,0.25)',
  },
  {
    id: 'event',
    icon: '📅', label: 'Create Event', desc: 'Organize a community activity',
    color: '#3DD6F5', bg: 'rgba(61,214,245,0.12)', border: 'rgba(61,214,245,0.25)',
  },
  {
    id: 'repair',
    icon: '🔧', label: 'Repair Request', desc: 'Need something fixed?',
    color: '#A855F7', bg: 'rgba(168,85,247,0.12)', border: 'rgba(168,85,247,0.25)',
  },
  {
    id: 'lost',
    icon: '🔍', label: 'Lost & Found', desc: 'Report lost or found item',
    color: '#FF6B80', bg: 'rgba(255,107,128,0.12)', border: 'rgba(255,107,128,0.25)',
  },
];

export default function PostSheet({ onClose }: PostSheetProps) {
  return (
    <>
      <div className="bottom-sheet-overlay" onClick={onClose} />
      <div className="bottom-sheet">
        <div className="sheet-handle" />
        <div style={{ padding: '16px 20px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div>
              <h2 style={{
                margin: '0 0 2px', fontSize: 'var(--text-lg)', fontWeight: 800,
                letterSpacing: '-0.02em', color: 'var(--text-primary)',
              }}>
                Post to Community
              </h2>
              <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                What would you like to share?
              </p>
            </div>
            <button
              onClick={onClose}
              style={{
                width: 32, height: 32, borderRadius: '50%',
                background: 'var(--bg-inset)', border: '1px solid var(--border-default)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: 'var(--text-muted)',
              }}
            >
              <X size={16} strokeWidth={2} />
            </button>
          </div>
        </div>

        <div style={{ padding: '8px 20px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {POST_OPTIONS.map(opt => (
            <button
              key={opt.id}
              onClick={onClose}
              className="press-scale"
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                background: opt.bg, border: `1.5px solid ${opt.border}`,
                borderRadius: 'var(--radius-lg)', padding: '14px',
                cursor: 'pointer', textAlign: 'left', width: '100%',
              }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 'var(--radius-md)',
                background: `${opt.color}20`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, flexShrink: 0,
              }}>
                {opt.icon}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: '0 0 2px', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {opt.label}
                </p>
                <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                  {opt.desc}
                </p>
              </div>
              <div style={{ color: opt.color, fontSize: 18 }}>›</div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
