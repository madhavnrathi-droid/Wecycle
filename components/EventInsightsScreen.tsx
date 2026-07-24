'use client';

/* ── Organizer insights for one event ──────────────────────────────────────
 * YouTube/Instagram-style analytics, organizer-only:
 *   · stat tiles — Views · Saves · Comments · Going
 *   · Attendees tab — everyone who RSVP'd (name/@username → their storefront)
 *   · Responses tab — per-question summary (bars for choice fields, answer
 *     lists for text, signed-link chips for files) + individual browser + CSV.
 * Mobile: full-page takeover. Desktop: rendered inside a centered modal.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft, Eye, Heart, MessageCircle, Users, Download, Paperclip, ChevronDown,
} from 'lucide-react';
import type { CommunityEvent, User } from '../lib/mockData';
import { USERS } from '../lib/mockData';
import {
  fetchEventAttendees, fetchEventCommentCount, type EventAttendee,
} from '../lib/liveData';
import {
  fetchEventForm, fetchEventResponses, signedFormFileUrl, fileAnswerName,
  responsesToCsv, FIELD_TYPE_META,
  type EventFormRecord, type FormResponse, type FormField,
} from '../lib/eventForms';
import { getAvatar } from '../lib/photos';
import { getEventMetrics } from '../lib/metrics';
import { isDemoMode } from '../lib/demoMode';
import { useBreakpoint } from '../lib/useBreakpoint';
import { track, EVT } from '../lib/analytics';
import { haptics } from '../lib/haptics';

interface EventInsightsScreenProps {
  event: CommunityEvent;
  onBack: () => void;
  onOpenUser?: (user: User) => void;
}

type Tab = 'attendees' | 'responses';

export default function EventInsightsScreen({ event, onBack, onOpenUser }: EventInsightsScreenProps) {
  const { isDesktop } = useBreakpoint();
  const [tab, setTab] = useState<Tab>('attendees');
  const [attendees, setAttendees] = useState<EventAttendee[]>([]);
  const [commentCount, setCommentCount] = useState(0);
  const [form, setForm] = useState<EventFormRecord | null>(null);
  const [responses, setResponses] = useState<FormResponse[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<'summary' | 'individual'>('summary');

  const demo = isDemoMode();

  useEffect(() => {
    let cancelled = false;
    track(EVT.insights_opened, { event_id: event.id, has_form: !!event.hasForm });

    if (demo) {
      /* Demo: derive a believable attendee list from the fixture users. */
      const n = Math.min(event.attendees, USERS.length);
      const list: EventAttendee[] = Array.from({ length: n }, (_, i) => ({
        user: USERS[i % USERS.length],
        rsvpedAt: `${i + 1}d ago`,
      }));
      Promise.all([fetchEventForm(event.id), fetchEventResponses(event.id)]).then(([f, r]) => {
        if (cancelled) return;
        setAttendees(list);
        setCommentCount(getEventMetrics(event.id).questions);
        setForm(f);
        setResponses(r);
        setLoaded(true);
      });
      return () => { cancelled = true; };
    }

    Promise.all([
      fetchEventAttendees(event.id),
      fetchEventCommentCount(event.id),
      fetchEventForm(event.id),
      fetchEventResponses(event.id),
    ]).then(([att, cc, f, r]) => {
      if (cancelled) return;
      setAttendees(att);
      setCommentCount(cc);
      setForm(f);
      setResponses(r);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [event.id, event.attendees, event.hasForm, demo]);

  /* Demo metric fallbacks — live events carry real counts on the object. */
  const demoMetrics = demo ? getEventMetrics(event.id) : null;
  const views = demo ? (demoMetrics?.views ?? 0) : (event.viewCount ?? 0);
  const saves = demo ? ((demoMetrics?.views ?? 40) % 37) + 3 : (event.saveCount ?? 0);
  const going = event.attendees;

  const hasFormTab = !!form && form.fields.length > 0;

  const exportCsv = () => {
    if (!form) return;
    haptics.selection();
    track(EVT.insights_exported, { event_id: event.id, response_count: responses.length });
    const csv = responsesToCsv(form.fields, responses);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${event.title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'event'}-responses.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  return (
    <div style={{ paddingBottom: isDesktop ? 24 : 96 }}>
      {/* ── Header ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 30,
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '14px 16px',
        background: 'var(--bg-base)',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <button onClick={onBack} aria-label="Back" className="theme-toggle">
          <ChevronLeft size={20} strokeWidth={1.8} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>
            Insights
          </h1>
          <p style={{
            margin: '1px 0 0', fontSize: 12, color: 'var(--text-muted)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {event.title}
          </p>
        </div>
        {hasFormTab && responses.length > 0 && (
          <button
            onClick={exportCsv}
            className="press-scale"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 12px',
              background: 'var(--bg-inset)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 999, cursor: 'pointer',
              fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'inherit',
            }}
          >
            <Download size={13} strokeWidth={2} /> CSV
          </button>
        )}
      </header>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '16px 16px 0' }}>
        {/* ── Stat tiles ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isDesktop ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)',
          gap: 10, marginBottom: 18,
        }}>
          <StatTile icon={<Eye size={15} strokeWidth={2} />} value={views} label="Views" />
          <StatTile icon={<Heart size={15} strokeWidth={2} />} value={saves} label="Saves" />
          <StatTile icon={<MessageCircle size={15} strokeWidth={2} />} value={commentCount} label="Comments" />
          <StatTile
            icon={<Users size={15} strokeWidth={2} />}
            value={going}
            label={event.maxAttendees ? `Going · of ${event.maxAttendees}` : 'Going'}
          />
        </div>

        {/* ── Tabs ── */}
        <div className="segmented" style={{ marginBottom: 16, maxWidth: 420 }}>
          <button
            onClick={() => { setTab('attendees'); track(EVT.insights_opened, { event_id: event.id, tab: 'attendees' }); }}
            aria-pressed={tab === 'attendees'}
            data-active={tab === 'attendees' || undefined}
          >
            Attendees · {attendees.length}
          </button>
          {hasFormTab && (
            <button
              onClick={() => { setTab('responses'); track(EVT.insights_opened, { event_id: event.id, tab: 'responses' }); }}
              aria-pressed={tab === 'responses'}
              data-active={tab === 'responses' || undefined}
            >
              Responses · {responses.length}
            </button>
          )}
        </div>

        {!loaded ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 13 }}>
            Loading insights…
          </div>
        ) : tab === 'attendees' ? (
          <AttendeeList attendees={attendees} onOpenUser={onOpenUser} />
        ) : (
          <div>
            {/* Summary ↔ Individual toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              {(['summary', 'individual'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`pill ${view === v ? 'pill-active' : ''}`}
                  aria-pressed={view === v}
                >
                  {v === 'summary' ? 'Summary' : 'Individual'}
                </button>
              ))}
            </div>
            {responses.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                No responses yet — they&rsquo;ll appear here the moment someone registers.
              </div>
            ) : view === 'summary' ? (
              <ResponseSummary form={form!} responses={responses} isDesktop={isDesktop} />
            ) : (
              <IndividualResponses form={form!} responses={responses} onOpenUser={onOpenUser} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Stat tile ────────────────────────────────────── */

function StatTile({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 14, padding: '14px 14px 12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', marginBottom: 6 }}>
        {icon}
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
        {value.toLocaleString('en-IN')}
      </div>
    </div>
  );
}

/* ── Attendees tab ────────────────────────────────── */

function AttendeeList({ attendees, onOpenUser }: { attendees: EventAttendee[]; onOpenUser?: (u: User) => void }) {
  if (!attendees.length) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: 13 }}>
        No RSVPs yet — share the event to get the word out.
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {attendees.map((a, i) => (
        <button
          key={`${a.user.id}-${i}`}
          type="button"
          onClick={() => onOpenUser?.(a.user)}
          className="press-scale"
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 12px', width: '100%', textAlign: 'left',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)', cursor: onOpenUser ? 'pointer' : 'default',
            fontFamily: 'inherit',
          }}
        >
          <span style={{
            width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
            background: a.user.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }} aria-hidden="true">
            <img src={getAvatar(a.user.id)} alt="" width={36} height={36} draggable={false} />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>
              {a.user.name}
            </span>
            <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)' }}>
              {a.user.role ? `${a.user.role} · ` : ''}RSVP&rsquo;d {formatWhen(a.rsvpedAt)}
            </span>
          </span>
          <span style={{
            fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
            color: '#16A34A', background: 'rgba(34,197,94,0.12)',
            padding: '3px 8px', borderRadius: 999, flexShrink: 0,
          }}>
            Going
          </span>
        </button>
      ))}
    </div>
  );
}

function formatWhen(v: string): string {
  /* Demo strings are already relative ("2d ago"); ISO gets shortened. */
  if (!/\dT\d|\d-\d/.test(v)) return v;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}

/* ── Responses: summary view ──────────────────────── */

function ResponseSummary({ form, responses, isDesktop }: { form: EventFormRecord; responses: FormResponse[]; isDesktop: boolean }) {
  return (
    <div style={{
      display: 'grid', gap: 12,
      gridTemplateColumns: isDesktop ? 'repeat(2, minmax(0, 1fr))' : '1fr',
      alignItems: 'start',
    }}>
      {form.fields.map(f => (
        <QuestionBlock key={f.id} field={f} responses={responses} />
      ))}
    </div>
  );
}

function QuestionBlock({ field, responses }: { field: FormField; responses: FormResponse[] }) {
  const [expanded, setExpanded] = useState(false);
  const answered = responses.filter(r => {
    const a = r.answers[field.id];
    return Array.isArray(a) ? a.length > 0 : typeof a === 'string' && a.length > 0;
  });

  const meta = FIELD_TYPE_META[field.type];
  const isChoice = meta.hasOptions;

  /* Choice fields → option counts (checkboxes count each selection). */
  const counts = useMemo(() => {
    if (!isChoice) return null;
    const map = new Map<string, number>();
    for (const o of (field.options ?? []).filter(o => o.trim())) map.set(o, 0);
    for (const r of answered) {
      const a = r.answers[field.id];
      const picks = Array.isArray(a) ? a : [a as string];
      for (const p of picks) map.set(p, (map.get(p) ?? 0) + 1);
    }
    return [...map.entries()];
  }, [isChoice, field, answered]);

  const maxCount = counts ? Math.max(1, ...counts.map(([, n]) => n)) : 1;

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-lg)', padding: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
        <span aria-hidden="true" style={{ fontSize: 13 }}>{meta.icon}</span>
        <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
          {field.label || meta.label}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
          {answered.length} answer{answered.length === 1 ? '' : 's'}
        </span>
      </div>

      {isChoice && counts ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {counts.map(([opt, n]) => {
            const pct = answered.length ? Math.round((n / answered.length) * 100) : 0;
            return (
              <div key={opt}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{opt}</span>
                  <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{n} · {pct}%</span>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: 'var(--bg-inset)', overflow: 'hidden' }} aria-hidden="true">
                  <div style={{
                    width: `${(n / maxCount) * 100}%`, height: '100%', borderRadius: 999,
                    background: 'linear-gradient(90deg, #8B5CF6, #A855F7)',
                    transition: 'width 300ms var(--ease-smooth, ease)',
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      ) : field.type === 'file' ? (
        <FileAnswerList field={field} responses={answered} />
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(expanded ? answered : answered.slice(0, 5)).map(r => (
              <div key={r.id} style={{
                padding: '8px 10px', borderRadius: 10,
                background: 'var(--bg-inset)', fontSize: 12.5, lineHeight: 1.45,
              }}>
                <span style={{ color: 'var(--text-primary)' }}>{String(r.answers[field.id])}</span>
                <span style={{ color: 'var(--text-muted)' }}> — {r.user.name}</span>
              </div>
            ))}
            {answered.length === 0 && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No answers yet.</span>
            )}
          </div>
          {answered.length > 5 && (
            <button
              type="button"
              onClick={() => setExpanded(x => !x)}
              style={{
                marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 4,
                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'inherit',
              }}
            >
              <ChevronDown size={13} strokeWidth={2} style={{ transform: expanded ? 'rotate(180deg)' : undefined }} />
              {expanded ? 'Show fewer' : `Show all ${answered.length}`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

/* ── File answers (signed links) ──────────────────── */

function FileAnswerList({ field, responses }: { field: FormField; responses: FormResponse[] }) {
  const [opening, setOpening] = useState<string | null>(null);
  const open = async (path: string) => {
    if (path.startsWith('demo/')) return; /* demo placeholder — nothing stored */
    setOpening(path);
    const url = await signedFormFileUrl(path);
    setOpening(null);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };
  if (!responses.length) return <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No files yet.</span>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {responses.map(r => {
        const path = String(r.answers[field.id]);
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => open(path)}
            className="press-scale"
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px', width: '100%', textAlign: 'left',
              background: 'var(--bg-inset)', border: '1px solid var(--border-subtle)',
              borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <Paperclip size={13} strokeWidth={2} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
            <span style={{
              flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 500, color: 'var(--text-primary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {opening === path ? 'Opening…' : fileAnswerName(path)}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{r.user.name}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ── Responses: individual view ───────────────────── */

function IndividualResponses({ form, responses, onOpenUser }: {
  form: EventFormRecord; responses: FormResponse[]; onOpenUser?: (u: User) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {responses.map(r => (
        <div key={r.id} style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)', padding: 14,
        }}>
          <button
            type="button"
            onClick={() => onOpenUser?.(r.user)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
              background: 'none', border: 'none', padding: 0, marginBottom: 10,
              cursor: onOpenUser ? 'pointer' : 'default', fontFamily: 'inherit',
            }}
          >
            <span style={{
              width: 30, height: 30, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
              background: r.user.color,
            }} aria-hidden="true">
              <img src={getAvatar(r.user.id)} alt="" width={30} height={30} draggable={false} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{r.user.name}</span>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>{r.submittedAt}</span>
            </span>
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {form.fields.map(f => {
              const a = r.answers[f.id];
              const empty = a == null || (Array.isArray(a) ? a.length === 0 : a === '');
              return (
                <div key={f.id} style={{ fontSize: 12.5, lineHeight: 1.45 }}>
                  <span style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 2 }}>
                    {f.label || FIELD_TYPE_META[f.type].label}
                  </span>
                  {empty ? (
                    <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>—</span>
                  ) : f.type === 'file' ? (
                    <FileAnswerList field={f} responses={[r]} />
                  ) : (
                    <span style={{ color: 'var(--text-primary)' }}>{Array.isArray(a) ? a.join(', ') : a}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
