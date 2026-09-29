'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ChevronLeft, MoreHorizontal, ArrowUp, ArrowDown, ShieldCheck, ChevronRight, Package,
  User as UserIcon, Flag, Ban, Copy, RotateCw,
} from 'lucide-react';
import { useMessaging, usePostPreview, type PostPreview } from '../../lib/messaging/useMessaging';
import {
  setActiveConversation, loadThread, loadOlder, sendMessage, retryMessage, discardMessage,
  canMessage, threadContext, PERMANENT_FAILURES, type ChatContext, type ChatMessage,
} from '../../lib/messaging/store';
import {
  buildTimeline, clockTime, starterPrompts, MESSAGE_MAX, MESSAGE_WARN_AT, type TimelineItem,
} from '../../lib/messaging/format';
import type { DeepLinkPost } from '../../lib/liveData';
import { blockUser, unblockUser } from '../../lib/moderation';
import { haptics } from '../../lib/haptics';
import { sfxSend } from '../../lib/sfx';
import { getSettings } from '../../lib/settings';
import { track, EVT } from '../../lib/analytics';
import { collegeName } from '../../lib/colleges';
import ReportSheet from '../ReportSheet';
import PeerAvatar from './PeerAvatar';

interface ChatThreadProps {
  conversationId: string;
  /** Present on phones and when the thread was opened on its own. */
  onBack?: () => void;
  onOpenProfile: (peerId: string) => void;
  onOpenPost: (post: DeepLinkPost) => void;
}

/* Unsent text survives switching threads and closing the panel — losing a
   half-written message to a mis-tap is the one thing a messenger must not do.
   Memory only: a draft is not worth a stale copy in storage. */
const drafts = new Map<string, string>();


const finePointer = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches;
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* ── Text helpers ── */

const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|‍|️|\s)+$/u;
function isBigEmoji(body: string): boolean {
  if (!EMOJI_ONLY.test(body)) return false;
  const count = (body.match(/\p{Extended_Pictographic}|\p{Regional_Indicator}{2}/gu) ?? []).length;
  return count > 0 && count <= 3;
}

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])/g;
/** Links become links — people paste Drive folders and maps pins — opened in
 *  a new tab with no referrer, since the other end is someone else's page. */
function linkify(body: string): ReactNode[] {
  const parts = body.split(URL_RE);
  return parts.map((p, i) => (i % 2 === 1
    ? <a key={i} href={p} target="_blank" rel="noopener noreferrer nofollow">{p}</a>
    : p));
}

/* ── The thread ──────────────────────────────────────────────────────────── */

export default function ChatThread({ conversationId, onBack, onOpenProfile, onOpenPost }: ChatThreadProps) {
  const s = useMessaging();
  const me = s.me ?? '';
  const conv = s.conversations[conversationId];
  const thread = s.threads[conversationId];
  const peerId = conv?.peerId ?? thread?.peerId ?? '';
  const peer = s.peers[peerId] ?? null;
  const name = peer?.name ?? 'Wecycle member';
  const first = name.split(/\s+/)[0];
  const ctx = threadContext(s, conversationId);
  const preview = usePostPreview(ctx);
  const blockedByMe = s.blocked.has(peerId);
  const messages = thread?.messages ?? [];
  const hasSent = messages.some(m => m.state === 'sent');

  /* This thread is on screen: arriving messages are read on arrival. */
  useEffect(() => {
    setActiveConversation(conversationId);
    track(EVT.conversation_opened, { has_context: !!ctx, context_type: ctx?.type ?? 'none', is_new: !conv?.persisted });
    return () => setActiveConversation(null);
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Can a message get through? Asked up front so "X isn't taking messages"
     appears before someone writes a paragraph, not after. The server checks
     again on every send regardless. */
  const [policy, setPolicy] = useState<{ code?: string; message?: string } | null>(null);
  useEffect(() => {
    if (!peerId) return;
    let live = true;
    setPolicy(null);
    canMessage(peerId).then(r => { if (live && !r.ok) setPolicy({ code: r.code, message: r.message }); });
    return () => { live = false; };
  }, [peerId, blockedByMe]);

  const notice: { code?: string; message: string } | null = blockedByMe
    ? { code: 'you_blocked', message: `You’ve blocked ${first}. They can’t message you, and you can’t message them.` }
    : policy?.message ? { code: policy.code, message: policy.message } : null;

  /* ── Timeline ── */
  const [minute, setMinute] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setMinute(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  const items = useMemo(() => buildTimeline(messages, me, minute), [messages, me, minute]);

  /* ── Scroll: land at the newest message, keep the place when older ones load
     above, follow new ones only if the reader was already at the bottom. ── */
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const landed = useRef(false);
  const firstId = useRef<string | null>(null);
  const lastId = useRef<string | null>(null);
  const heightBeforeOlder = useRef(0);
  const [newBelow, setNewBelow] = useState(false);
  const seen = useRef<Set<string>>(new Set());

  const scrollToBottom = (smooth: boolean) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth && !reducedMotion() ? 'smooth' : 'auto' });
  };

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const f = messages[0]?.id ?? null;
    const l = messages[messages.length - 1]?.id ?? null;
    if (!landed.current) {
      if (thread?.status === 'ready' || messages.length) {
        el.scrollTop = el.scrollHeight;
        landed.current = true;
      }
    } else if (heightBeforeOlder.current && f !== firstId.current && l === lastId.current) {
      el.scrollTop += el.scrollHeight - heightBeforeOlder.current;
      heightBeforeOlder.current = 0;
    } else if (l !== lastId.current) {
      const last = messages[messages.length - 1];
      if (last && (last.senderId === me || atBottom.current)) scrollToBottom(true);
      else if (last) setNewBelow(true);
    }
    firstId.current = f;
    lastId.current = l;
  }, [messages, thread?.status, me]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Everything drawn so far counts as seen; only later arrivals animate in. */
  useEffect(() => { for (const m of messages) seen.current.add(m.id); }, [messages]);

  /* The composer growing, or the keyboard opening, shrinks the list — keep
     the newest message in view when the reader was already there. */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => { if (atBottom.current) el.scrollTop = el.scrollHeight; });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (atBottom.current && newBelow) setNewBelow(false);
    if (el.scrollTop < 160 && thread?.hasMore && !thread.loadingOlder) {
      heightBeforeOlder.current = el.scrollHeight;
      void loadOlder(conversationId);
    }
  };

  /* ── Composer ── */
  const [draft, setDraft] = useState(() => drafts.get(conversationId) ?? '');
  const taRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (draft) drafts.set(conversationId, draft); else drafts.delete(conversationId);
  }, [draft, conversationId]);
  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 148)}px`;
  }, [draft]);
  /* A keyboard on a desk is already under the hands; on a phone, opening the
     keyboard uninvited hides the post card and the conversation starters. */
  useEffect(() => { if (finePointer() && !notice) taRef.current?.focus(); }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  const length = useMemo(() => Array.from(draft).length, [draft]);
  const over = length > MESSAGE_MAX;
  const canSend = draft.trim().length > 0 && !over && !notice;

  const afterSend = (res: Awaited<ReturnType<typeof sendMessage>>, meta: Record<string, unknown>) => {
    if (res.ok) {
      sfxSend(getSettings().notifications.channels.sound);
      track(EVT.message_sent, meta);
    } else {
      haptics.error();
      track(EVT.message_failed, { code: res.code ?? 'unknown' });
      if (res.code && ['dms_off', 'unavailable', 'you_blocked', 'suspended', 'not_found'].includes(res.code)) {
        setPolicy({ code: res.code, message: res.message });
      }
    }
  };

  const send = async () => {
    if (!canSend) return;
    const body = draft;
    setDraft('');
    haptics.light();
    atBottom.current = true;
    const meta = { is_first: !hasSent, context_type: ctx?.type ?? 'none', length: body.length };
    afterSend(await sendMessage(conversationId, body), meta);
  };

  const fillStarter = (text: string) => {
    haptics.selection();
    track(EVT.message_starter_used, { context_type: ctx?.type ?? 'none' });
    setDraft(text);
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(text.length, text.length);
    });
  };

  const starters = preview && ctx && !draft && (s.pendingContext[conversationId] || !hasSent)
    ? starterPrompts(preview.starter) : [];

  /* ── Per-message actions: long-press on touch, right-click on a mouse ── */
  const [actionFor, setActionFor] = useState<string | null>(null);
  const [timeFor, setTimeFor] = useState<string | null>(null);
  const pressTimer = useRef<number | undefined>(undefined);
  const startPress = (id: string) => (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => { setActionFor(id); haptics.selection(); }, 450);
  };
  const endPress = () => window.clearTimeout(pressTimer.current);

  /* ── Menu, report, block ── */
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent) {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
      } else if (menuRef.current?.contains(e.target as Node)) return;
      setMenuOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close, true);
    requestAnimationFrame(() => menuRef.current?.querySelector('button')?.focus());
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close, true);
    };
  }, [menuOpen]);

  const [report, setReport] = useState<{ type: 'user' | 'message'; id: string; evidence?: string } | null>(null);

  const toggleBlock = async () => {
    setMenuOpen(false);
    if (blockedByMe) {
      if (await unblockUser(peerId)) haptics.success();
      return;
    }
    if (!window.confirm(`Block ${name}?\n\nThey won’t be able to message you, and you won’t see their posts. They aren’t told.`)) return;
    if (await blockUser(peerId)) haptics.success();
    else window.alert('Couldn’t block right now. Try again.');
  };

  const college = collegeName(peer?.college);
  const subline = college ?? 'View profile';

  return (
    <section className="dm-pane" aria-label={`Conversation with ${name}`} style={{ position: 'relative' }}>
      <header className="dm-head" style={{ position: 'relative' }}>
        {onBack && (
          <button type="button" className="theme-toggle" onClick={onBack} aria-label="Back">
            <ChevronLeft size={24} strokeWidth={1.9} />
          </button>
        )}
        <button type="button" className="dm-thread-peer" onClick={() => onOpenProfile(peerId)} aria-label={`${name} — view profile`}>
          <PeerAvatar id={peerId} peer={peer} size={36} />
          <span className="dm-thread-peer-text">
            <span className="dm-thread-peer-name">{name}</span>
            <span className="dm-thread-peer-sub">{subline}</span>
          </span>
        </button>
        <button
          type="button" className="theme-toggle"
          aria-label="Conversation options" aria-haspopup="menu" aria-expanded={menuOpen}
          onClick={() => setMenuOpen(o => !o)}
        >
          <MoreHorizontal size={21} strokeWidth={1.9} />
        </button>
        {menuOpen && (
          <div className="dm-menu" role="menu" ref={menuRef} aria-label="Conversation options">
            <button role="menuitem" type="button" onClick={() => { setMenuOpen(false); onOpenProfile(peerId); }}>
              <UserIcon size={17} strokeWidth={1.9} /> View profile
            </button>
            <button role="menuitem" type="button" onClick={() => { setMenuOpen(false); setReport({ type: 'user', id: peerId }); }}>
              <Flag size={17} strokeWidth={1.9} /> Report {first}
            </button>
            <button role="menuitem" type="button" data-danger={!blockedByMe || undefined} onClick={toggleBlock}>
              <Ban size={17} strokeWidth={1.9} /> {blockedByMe ? `Unblock ${first}` : `Block ${first}`}
            </button>
          </div>
        )}
      </header>

      {ctx && <ContextCard ctx={ctx} preview={preview} onOpen={onOpenPost} />}

      <div
        ref={scrollRef}
        className="dm-scroll"
        onScroll={onScroll}
        onClick={e => { if (!(e.target as HTMLElement).closest('.dm-actions, .dm-bubble')) setActionFor(null); }}
      >
        {thread?.loadingOlder && (
          <div className="dm-marker" role="status">Loading earlier messages…</div>
        )}
        {thread && !thread.hasMore && thread.status !== 'loading' && (
          <div className="dm-intro">
            <PeerAvatar id={peerId} peer={peer} size={72} />
            <div className="dm-intro-name">{name}</div>
            <div className="dm-intro-sub">{college ? `${college} · ` : ''}Wecycle member</div>
            <button type="button" className="dm-btn dm-btn--soft" style={{ height: 36, marginTop: 6 }} onClick={() => onOpenProfile(peerId)}>
              View profile
            </button>
            <p className="dm-safety">
              <ShieldCheck size={16} strokeWidth={2} aria-hidden="true" />
              <span>Meet somewhere public on campus and check things before you pay. Wecycle will never ask for an OTP or password in a message.</span>
            </p>
          </div>
        )}
        {(!thread || thread.status === 'loading') && messages.length === 0 && (
          <div aria-busy="true" aria-label="Loading messages" style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 0' }}>
            {[62, 44, 70].map((w, i) => (
              <span key={i} className="dm-skel" style={{ width: `${w}%`, height: 36, borderRadius: 18, alignSelf: i === 1 ? 'flex-end' : 'flex-start' }} />
            ))}
          </div>
        )}
        {thread?.status === 'error' && messages.length === 0 && (
          <div className="dm-empty" role="alert">
            <p>Couldn’t load this conversation.</p>
            <button type="button" className="dm-btn dm-btn--soft" onClick={() => { void loadThread(conversationId); }}>
              <RotateCw size={15} strokeWidth={2} /> Try again
            </button>
          </div>
        )}

        <div className="dm-log" role="log" aria-live="polite" aria-relevant="additions" aria-label={`Messages with ${name}`}>
          {items.map(item => (
            <TimelineRow
              key={item.key}
              item={item}
              peerId={peerId}
              peer={peer}
              name={first}
              animate={item.kind === 'msg' && landed.current && !seen.current.has(item.msg.id)}
              actionsOpen={item.kind === 'msg' && actionFor === item.msg.id}
              timeOpen={item.kind === 'msg' && timeFor === item.msg.id}
              onTap={id => setTimeFor(t => (t === id ? null : id))}
              onContext={id => setActionFor(id)}
              onPressStart={startPress}
              onPressEnd={endPress}
              onCopy={async body => {
                setActionFor(null);
                try { await navigator.clipboard.writeText(body); haptics.light(); } catch { /* clipboard blocked */ }
              }}
              onReport={(id, body) => { setActionFor(null); setReport({ type: 'message', id, evidence: body }); }}
              onRetry={async id => {
                haptics.light();
                afterSend(await retryMessage(conversationId, id), { is_first: !hasSent, context_type: ctx?.type ?? 'none', retry: true });
              }}
              onDiscard={id => { discardMessage(conversationId, id); }}
              onEdit={id => {
                const text = discardMessage(conversationId, id);
                setDraft(text);
                requestAnimationFrame(() => taRef.current?.focus());
              }}
            />
          ))}
        </div>
      </div>

      {notice ? (
        <div className="dm-notice" role="status">
          <span>{notice.message}</span>
          {notice.code === 'you_blocked' && (
            <button type="button" className="dm-btn dm-btn--soft" onClick={toggleBlock}>Unblock {first}</button>
          )}
        </div>
      ) : (
        <form
          className="dm-composer"
          onSubmit={e => { e.preventDefault(); void send(); }}
        >
          {newBelow && (
            <button type="button" className="dm-jump" onClick={() => { setNewBelow(false); scrollToBottom(true); }}>
              <ArrowDown size={14} strokeWidth={2.4} /> New message
            </button>
          )}
          {starters.length > 0 && (
            <div className="dm-starters" role="group" aria-label="Suggested openers">
              {starters.map(t => (
                <button key={t} type="button" className="dm-starter" onClick={() => fillStarter(t)}>{t}</button>
              ))}
            </div>
          )}
          <div className="dm-composer-row">
            <textarea
              ref={taRef}
              className="dm-input"
              rows={1}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                /* Enter sends at a desk. On a phone the Return key is how
                   people write an address on two lines — Send is the button. */
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && finePointer()) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder={`Message ${first}…`}
              aria-label={`Message ${name}`}
              enterKeyHint="send"
              autoCapitalize="sentences"
              spellCheck
            />
            <button
              type="submit"
              className="dm-send"
              disabled={!canSend}
              aria-label="Send message"
              /* Keeps focus in the textarea, so the phone keyboard stays up
                 between messages instead of dropping after every send. */
              onMouseDown={e => e.preventDefault()}
            >
              <ArrowUp size={20} strokeWidth={2.4} />
            </button>
          </div>
          {length >= MESSAGE_WARN_AT && (
            <div className="dm-counter" data-over={over || undefined} aria-live="polite">
              {length.toLocaleString('en-IN')} / {MESSAGE_MAX.toLocaleString('en-IN')}
            </div>
          )}
        </form>
      )}

      <ReportSheet
        open={!!report}
        onClose={() => setReport(null)}
        targetType={report?.type ?? 'user'}
        targetId={report?.id ?? peerId}
        targetUserId={peerId}
        targetLabel={report?.type === 'message' ? `this message from ${first}` : name}
        evidence={report?.evidence}
      />
    </section>
  );
}

/* ── The post card under the header ── */

function ContextCard({ ctx, preview, onOpen }: {
  ctx: ChatContext; preview: PostPreview | null | undefined; onOpen: (post: DeepLinkPost) => void;
}) {
  const gone = preview === null;
  const body = (
    <>
      {preview?.image
        ? <img src={preview.image} alt="" draggable={false} />
        : <span className="dm-context-ph"><Package size={18} strokeWidth={1.8} /></span>}
      <span className="dm-context-text">
        <span className="dm-context-title">{preview?.title ?? ctx.title}</span>
        <span className="dm-context-sub">
          {gone ? 'No longer available'
            : preview === undefined ? ' '
            : preview.closedLabel ? <span className="dm-context-closed">{preview.closedLabel}</span>
            : preview.subtitle}
        </span>
      </span>
    </>
  );
  if (!preview) {
    return <div className="dm-context" style={{ cursor: 'default' }} aria-label={`About ${ctx.title}`}>{body}</div>;
  }
  return (
    <button type="button" className="dm-context" onClick={() => onOpen(preview.post)} aria-label={`About ${preview.title} — open post`}>
      {body}
      <ChevronRight size={18} strokeWidth={1.9} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
    </button>
  );
}

/* ── One row of the timeline ── */

interface RowProps {
  item: TimelineItem<ChatMessage>;
  peerId: string;
  peer: ReturnType<typeof useMessaging>['peers'][string] | null;
  name: string;
  animate: boolean;
  actionsOpen: boolean;
  timeOpen: boolean;
  onTap: (id: string) => void;
  onContext: (id: string) => void;
  onPressStart: (id: string) => (e: React.PointerEvent) => void;
  onPressEnd: () => void;
  onCopy: (body: string) => void;
  onReport: (id: string, body: string) => void;
  onRetry: (id: string) => void;
  onDiscard: (id: string) => void;
  onEdit: (id: string) => void;
}

function TimelineRow(p: RowProps) {
  const { item } = p;
  if (item.kind === 'day') return <div className="dm-marker" role="separator">{item.label}</div>;
  if (item.kind === 'time') return <div className="dm-marker dm-marker--time" role="separator">{item.label}</div>;

  const { msg, mine, pos, receipt } = item;
  const big = isBigEmoji(msg.body);
  const failed = receipt === 'failed';
  const permanent = failed && !!msg.error?.code && PERMANENT_FAILURES.has(msg.error.code);
  const showAvatar = !mine && (pos === 'last' || pos === 'single');

  return (
    <div className={`dm-row ${mine ? 'mine' : 'theirs'}`} data-pos={pos} data-state={msg.state}>
      {!mine && (
        <span className="dm-row-avatar" aria-hidden="true">
          {showAvatar && <PeerAvatar id={p.peerId} peer={p.peer} size={28} />}
        </span>
      )}
      <div className="dm-col">
        <p
          className={`dm-bubble${big ? ' dm-emoji' : ''}${p.animate ? ' dm-bubble-new' : ''}`}
          onClick={() => { if (!p.actionsOpen) p.onTap(msg.id); }}
          onContextMenu={e => { e.preventDefault(); p.onContext(msg.id); }}
          onPointerDown={p.onPressStart(msg.id)}
          onPointerUp={p.onPressEnd}
          onPointerLeave={p.onPressEnd}
          onPointerCancel={p.onPressEnd}
        >
          <span className="dm-sr">{mine ? 'You' : p.name}, {clockTime(msg.createdAt)}: </span>
          {linkify(msg.body)}
        </p>

        {p.actionsOpen && (
          <div className="dm-actions">
            <button type="button" className="dm-chip" onClick={() => p.onCopy(msg.body)}>
              <Copy size={13} strokeWidth={2} style={{ marginRight: 6, verticalAlign: -2 }} />Copy
            </button>
            {!mine && (
              <button type="button" className="dm-chip" onClick={() => p.onReport(msg.id, msg.body)}>
                <Flag size={13} strokeWidth={2} style={{ marginRight: 6, verticalAlign: -2 }} />Report
              </button>
            )}
          </div>
        )}

        {failed ? (
          <div className="dm-meta dm-meta--failed" role="alert">
            <span>{msg.error?.message ?? 'Not sent.'}</span>
            {permanent ? (
              <button type="button" className="dm-link-btn" onClick={() => p.onEdit(msg.id)}>Edit</button>
            ) : (
              <button type="button" className="dm-link-btn" onClick={() => p.onRetry(msg.id)}>Retry</button>
            )}
            <button type="button" className="dm-link-btn" onClick={() => p.onDiscard(msg.id)}>Delete</button>
          </div>
        ) : receipt === 'sending' ? (
          <div className="dm-meta">Sending…</div>
        ) : p.timeOpen || receipt ? (
          <div className="dm-meta">
            {p.timeOpen && clockTime(msg.createdAt)}
            {p.timeOpen && receipt && ' · '}
            {receipt === 'seen' ? 'Seen' : receipt === 'sent' ? 'Sent' : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
