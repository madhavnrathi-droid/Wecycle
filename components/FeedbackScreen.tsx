'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, Send, Heart, EyeOff, Eye, Sparkles } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { Toggle } from './SettingsScreen';

interface FeedbackScreenProps {
  onBack: () => void;
}

const FEEDBACK_EMAIL = 'wecycle.page@gmail.com';
const FEEDBACK_SUBJECT = 'Feedback For Wecycle';

/* Optional tag chips — they help users start typing. Tag selection is
   prepended to the body so we can route feedback even from anonymous senders. */
const TAGS = [
  { id: 'bug',       label: 'Bug', emoji: '🐛' },
  { id: 'idea',      label: 'Feature idea', emoji: '💡' },
  { id: 'design',    label: 'Design', emoji: '🎨' },
  { id: 'love',      label: 'Praise', emoji: '💚' },
  { id: 'confused',  label: 'Confused', emoji: '🤔' },
  { id: 'other',     label: 'Other', emoji: '✉️' },
] as const;

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
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 10px',
          background: 'var(--bg-inset)',
          borderRadius: 999,
          fontSize: 'calc(11px * var(--text-scale))', fontWeight: 600,
          color: 'var(--text-secondary)',
          letterSpacing: '0.02em',
        }}>
          <Sparkles size={11} strokeWidth={1.8} /> We read every note
        </div>
        <h2 style={{
          margin: '10px 0 4px',
          fontSize: 'calc(22px * var(--text-scale))', fontWeight: 600,
          letterSpacing: '-0.025em', color: 'var(--text-primary)',
        }}>
          Help shape Wecycle
        </h2>
        <p style={{
          margin: 0, fontSize: 'calc(14px * var(--text-scale))', color: 'var(--text-muted)', lineHeight: 1.5,
        }}>
          Bugs, half-baked ideas, things that confused you — drop them below.
          Your default mail app opens with everything pre-filled; just hit send.
        </p>
      </section>

      {/* ── Tags ── */}
      <section style={{ padding: '14px 20px 4px' }}>
        <div style={{
          fontSize: 'calc(11px * var(--text-scale))', fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          color: 'var(--text-secondary)',
          marginBottom: 8,
        }}>
          What's this about?
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {TAGS.map(t => {
            const active = tag === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTag(active ? '' : t.id)}
                style={{
                  all: 'unset', boxSizing: 'border-box', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '5px 11px',
                  fontSize: 'calc(12px * var(--text-scale))', fontWeight: 500,
                  borderRadius: 999,
                  border: '1px solid ' + (active ? 'var(--text-primary)' : 'var(--border-default)'),
                  background: active ? 'var(--text-primary)' : 'transparent',
                  color: active ? 'var(--bg-base)' : 'var(--text-primary)',
                  transition: 'all 0.15s',
                }}
              >
                <span aria-hidden="true">{t.emoji}</span> {t.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Textarea ── */}
      <section style={{ padding: '14px 20px 4px' }}>
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-default)',
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
            borderTop: '1px solid var(--border-default)',
          }}>
            <div style={{ fontSize: 'calc(11px * var(--text-scale))', color: 'var(--text-muted)' }}>
              {charCount} / {MAX_CHARS}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 'calc(12px * var(--text-scale))', color: 'var(--text-secondary)', fontWeight: 500,
              }}>
                {anonymous ? <EyeOff size={12} /> : <Eye size={12} />}
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
            padding: '14px 20px', borderRadius: 14,
            background: canSend ? 'var(--text-primary)' : 'var(--bg-inset)',
            color: canSend ? 'var(--bg-base)' : 'var(--text-muted)',
            fontSize: 'calc(15px * var(--text-scale))', fontWeight: 600,
            letterSpacing: '-0.01em',
            transition: 'background 0.18s',
          }}
        >
          <Send size={15} strokeWidth={2} />
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

      {/* ── Thank-you note ── */}
      <section style={{ padding: '24px 20px 0' }}>
        <div style={{
          background: 'linear-gradient(135deg, color-mix(in oklab, var(--accent-rose) 12%, var(--bg-card)) 0%, var(--bg-card) 100%)',
          border: '1px solid var(--border-default)',
          borderRadius: 16,
          padding: 18,
          display: 'flex', gap: 12,
        }}>
          <div style={{
            width: 38, height: 38, borderRadius: 12,
            background: 'color-mix(in oklab, var(--accent-rose) 18%, var(--bg-card))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--accent-rose)', flexShrink: 0,
          }}>
            <Heart size={18} strokeWidth={2} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{
              margin: 0, fontSize: 'calc(15px * var(--text-scale))', fontWeight: 600,
              letterSpacing: '-0.015em', color: 'var(--text-primary)',
            }}>
              Thanks for taking the time
            </h3>
            <p style={{
              margin: '6px 0 0', fontSize: 'calc(13px * var(--text-scale))', color: 'var(--text-muted)', lineHeight: 1.5,
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
