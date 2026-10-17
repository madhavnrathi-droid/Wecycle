'use client';

import { useEffect, useState } from 'react';
import {
  ChevronLeft, Send, Heart, EyeOff, Eye, Sparkles,
  Bug, Lightbulb, Palette, SmileyMeh, Mail, type LucideIcon,
} from '@/lib/icons';
import { useAuth } from '../lib/AuthContext';
import { Toggle } from './SettingsScreen';

interface FeedbackScreenProps {
  onBack: () => void;
}

const FEEDBACK_EMAIL = 'wecycle.page@gmail.com';
const FEEDBACK_SUBJECT = 'Feedback For Wecycle';

/* Optional tag chips — they help users start typing. Tag selection is
   prepended to the body so we can route feedback even from anonymous senders.
   Each is named by a thin glyph rather than an emoji. */
const TAGS: ReadonlyArray<{ id: string; label: string; icon: LucideIcon }> = [
  { id: 'bug',       label: 'Bug', icon: Bug },
  { id: 'idea',      label: 'Feature idea', icon: Lightbulb },
  { id: 'design',    label: 'Design', icon: Palette },
  { id: 'love',      label: 'Praise', icon: Heart },
  { id: 'confused',  label: 'Confused', icon: SmileyMeh },
  { id: 'other',     label: 'Other', icon: Mail },
];

export default function FeedbackScreen({ onBack }: FeedbackScreenProps) {
  const { user, profile } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [text, setText] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [tag, setTag] = useState<string>('');
  const [justSent, setJustSent] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  if (!mounted) return null;

  const canSend = text.trim().length >= 5;
  const charCount = text.length;
  const MAX_CHARS = 2000;

  /* Build a mailto: URL that pre-fills the user's default mail client
     with subject + body + recipient ready to send. */
  const buildMailto = () => {
    const lines: string[] = [];
    if (tag) {
      const t = TAGS.find(x => x.id === tag);
      if (t) lines.push(`[${t.label}]`);
    }
    if (anonymous) {
      lines.push('(Anonymous feedback)');
    } else {
      const name = profile?.full_name ?? (user as { email?: string } | null)?.email ?? '';
      const email = (profile as { email?: string } | null)?.email ?? (user as { email?: string } | null)?.email ?? '';
      const phone = profile?.phone ?? '';
      const college = (profile as { college_id?: string } | null)?.college_id ?? '';
      const idParts = [name, email, phone, college].filter(Boolean);
      if (idParts.length) lines.push('From: ' + idParts.join(' · '));
    }
    if (lines.length) lines.push('');
    lines.push(text.trim());
    lines.push('');
    lines.push('—');
    lines.push('Sent from Wecycle');
    const body = lines.join('\n');
    return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(FEEDBACK_SUBJECT)}&body=${encodeURIComponent(body)}`;
  };

  const handleSend = () => {
    if (!canSend) return;
    const href = buildMailto();
    /* Open in same tab so the OS mail handler picks it up reliably on iOS/Android.
       Desktop users see Gmail/Outlook/Apple Mail compose. */
    window.location.href = href;
    setJustSent(true);
    /* Keep the text in case the user wants to amend; clear flash after a moment */
    setTimeout(() => setJustSent(false), 4000);
  };

  return (
    <div className="screen-transition" style={{ paddingBottom: 80, background: 'var(--bg-base)', minHeight: '100%' }}>

      <header
        style={{
          position: 'sticky', top: 0, zIndex: 30,
          /* Opaque. --bg-overlay is 88% alpha, so the feed showed
             through the header as it scrolled past. */
          background: 'var(--bg-card)',
          padding: '10px 12px',
          display: 'flex', alignItems: 'center', gap: 8,
        }}
      >
        <button onClick={onBack} aria-label="Back" className="theme-toggle">
          <ChevronLeft size={20} strokeWidth={1.8} />
        </button>
        <h1 style={{
          margin: 0, flex: 1, textAlign: 'center',
          fontSize: 'calc(16px * var(--text-scale))', fontWeight: 600,
          letterSpacing: '-0.02em', color: 'var(--text-primary)',
        }}>
          Feedback
        </h1>
        <span style={{ width: 36 }} aria-hidden="true" />
      </header>

      {/* ── Intro ── */}
      <section style={{ padding: '18px 20px 4px' }}>
        <div className="t-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Sparkles size={13} /> We read every note
        </div>
        <h2 className="t-title1" style={{ margin: '8px 0 6px', color: 'var(--text-primary)' }}>
          Help shape Wecycle
        </h2>
        <p style={{
          margin: 0, fontSize: 'calc(15px * var(--text-scale))', color: 'var(--text-secondary)', lineHeight: 1.4,
          letterSpacing: '-0.015em',
        }}>
          Bugs, half-baked ideas, things that confused you — drop them below.
          Your default mail app opens with everything pre-filled; just hit send.
        </p>
      </section>

      {/* ── Tags ── */}
      <section style={{ padding: '24px 20px 4px' }}>
        <div className="t-label" style={{ marginBottom: 10 }}>
          What's this about?
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {TAGS.map(t => {
            const active = tag === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTag(active ? '' : t.id)}
                aria-pressed={active}
                className={`pill ${active ? 'pill-active' : ''}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, paddingLeft: 12 }}
              >
                <Icon size={16} aria-hidden="true" weight={active ? 'regular' : undefined} /> {t.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Textarea ── */}
      <section style={{ padding: '20px 20px 4px' }}>
        <div style={{
          background: 'var(--bg-inset)',
          border: 'none',
          borderRadius: 16,
          padding: 14,
          display: 'flex', flexDirection: 'column',
        }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
            placeholder="What's on your mind?"
            rows={7}
            style={{
              all: 'unset', display: 'block', width: '100%',
              fontSize: 'calc(15px * var(--text-scale))', lineHeight: 1.5,
              color: 'var(--text-primary)',
              fontFamily: 'inherit',
              minHeight: 140,
              resize: 'vertical',
              boxSizing: 'border-box',
            }}
            aria-label="Feedback message"
          />
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginTop: 10, paddingTop: 10,
            borderTop: '0.5px solid var(--hairline)',
          }}>
            <div className="t-label" style={{ fontSize: 'calc(10.5px * var(--text-scale))', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
              {charCount} / {MAX_CHARS}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 'calc(13px * var(--text-scale))', color: 'var(--text-secondary)', fontWeight: 400,
              }}>
                {anonymous ? <EyeOff size={16} /> : <Eye size={16} />}
                Send anonymously
              </span>
              <Toggle on={anonymous} onChange={setAnonymous} />
            </div>
          </div>
        </div>
        {!anonymous && (
          <p style={{
            margin: '8px 4px 0', fontSize: 'calc(11px * var(--text-scale))', color: 'var(--text-muted)', lineHeight: 1.4,
          }}>
            We'll include your name, contact, and college ID so we can follow up if needed.
          </p>
        )}
        {anonymous && (
          <p style={{
            margin: '8px 4px 0', fontSize: 'calc(11px * var(--text-scale))', color: 'var(--text-muted)', lineHeight: 1.4,
          }}>
            Your identity won't be attached — but your default mail app will still show the
            sender as your own email address. Use a private alias if anonymity matters.
          </p>
        )}
      </section>

      {/* ── Send button ── */}
      <section style={{ padding: '14px 20px 0' }}>
        <button
          onClick={handleSend}
          disabled={!canSend}
          style={{
            all: 'unset', cursor: canSend ? 'pointer' : 'not-allowed',
            width: '100%', boxSizing: 'border-box',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '14px 20px', borderRadius: 999,
            background: canSend ? 'var(--ink)' : 'var(--bg-inset)',
            color: canSend ? '#FFFFFF' : 'var(--text-muted)',
            fontSize: 'calc(17px * var(--text-scale))', fontWeight: 600,
            letterSpacing: '-0.025em',
            transition: 'background-color var(--dur-2) var(--ease-standard), color var(--dur-2) var(--ease-standard)',
          }}
        >
          <Send size={18} />
          {justSent ? 'Mail app opened — hit send to deliver' : 'Open mail to send'}
        </button>
        <p style={{
          margin: '8px 4px 0', fontSize: 'calc(11px * var(--text-scale))', color: 'var(--text-muted)', lineHeight: 1.4,
          textAlign: 'center',
        }}>
          Goes to <strong style={{ color: 'var(--text-secondary)' }}>{FEEDBACK_EMAIL}</strong>
          {' '}with subject "<em>{FEEDBACK_SUBJECT}</em>"
        </p>
      </section>

      {/* ── Thank-you note — a glyph and a paragraph, set apart by space ── */}
      <section style={{ padding: '36px 20px 0' }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <Heart size={22} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--accent-rose-ink)', marginTop: -1 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{
              margin: 0, fontSize: 'calc(17px * var(--text-scale))', fontWeight: 600,
              letterSpacing: '-0.025em', color: 'var(--text-primary)',
            }}>
              Thanks for taking the time
            </h3>
            <p style={{
              margin: '4px 0 0', fontSize: 'calc(15px * var(--text-scale))', color: 'var(--text-secondary)', lineHeight: 1.4,
              letterSpacing: '-0.015em',
            }}>
              Wecycle gets better because people like you tell us when things feel off.
              Every note lands in our inbox and we reply to most within 48 hours.
              You're helping us build something useful for everyone.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
