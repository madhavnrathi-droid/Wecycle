'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, MessageCircle, Search, X, RotateCw } from 'lucide-react';
import { useMessaging, usePostPreview } from '../../lib/messaging/useMessaging';
import { inboxRows, loadInbox, type InboxRow } from '../../lib/messaging/store';
import { inboxTime } from '../../lib/messaging/format';
import PeerAvatar from './PeerAvatar';

interface InboxProps {
  selectedId: string | null;
  onSelect: (conversationId: string) => void;
  onClose: () => void;
  /** 'back' on phones (a chevron, top-left), 'close' in the desktop panel. */
  closeStyle: 'back' | 'close';
  onBrowse: () => void;
}

/* ── The inbox ───────────────────────────────────────────────────────────────
 *
 * Newest first, one row per person. A row carries only what decides whether
 * to open it: who, what they last said and how long ago, whether it is new,
 * and — for chats about a post — the post's photo, because "which of these
 * three people was the lamp?" is the question the photo answers at a glance.
 *
 * Unread is bold text AND a dot, never the dot alone, so it survives colour
 * blindness and a washed-out screen in the sun. */
export default function Inbox({ selectedId, onSelect, onClose, closeStyle, onBrowse }: InboxProps) {
  const s = useMessaging();
  const [query, setQuery] = useState('');
  const [now, setNow] = useState(() => Date.now());

  /* "5m" has to become "6m" without a message arriving. */
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const rows = useMemo(() => inboxRows(s), [s]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      (r.peer?.name ?? '').toLowerCase().includes(q)
      || r.conversation.lastMessage.toLowerCase().includes(q)
      || (r.conversation.context?.title ?? '').toLowerCase().includes(q));
  }, [rows, query]);

  const showSearch = rows.length > 3 || !!query;

  return (
    <>
      <header className="dm-head">
        {closeStyle === 'back' && (
          <button type="button" className="theme-toggle" onClick={onClose} aria-label="Back">
            <ChevronLeft size={24} strokeWidth={1.9} />
          </button>
        )}
        <h1 className="dm-head-title" style={closeStyle === 'close' ? { paddingLeft: 12 } : undefined}>Messages</h1>
        {closeStyle === 'close' ? (
          <button type="button" className="theme-toggle" onClick={onClose} aria-label="Close messages">
            <X size={20} strokeWidth={1.9} />
          </button>
        ) : <span className="dm-head-spacer" aria-hidden="true" />}
      </header>

      {showSearch && (
        <label className="dm-search">
          <Search size={16} strokeWidth={2} aria-hidden="true" />
          <span className="dm-sr">Search messages</span>
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search"
            autoComplete="off"
            enterKeyHint="search"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear search"
              style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
              <X size={15} strokeWidth={2.2} />
            </button>
          )}
        </label>
      )}

      {s.status === 'loading' && rows.length === 0 ? (
        <div aria-busy="true" aria-label="Loading messages" style={{ paddingTop: 6 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="dm-skeleton" aria-hidden="true">
              <span className="dm-skel" style={{ width: 52, height: 52 }} />
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span className="dm-skel" style={{ width: `${40 + (i * 13) % 30}%`, height: 12 }} />
                <span className="dm-skel" style={{ width: `${55 + (i * 17) % 35}%`, height: 11 }} />
              </span>
            </div>
          ))}
        </div>
      ) : s.status === 'error' && rows.length === 0 ? (
        <div className="dm-empty" role="alert">
          <h2>Couldn’t load your messages</h2>
          <p>Check your connection and try again.</p>
          <button type="button" className="dm-btn dm-btn--soft" onClick={() => { void loadInbox(); }}>
            <RotateCw size={15} strokeWidth={2} /> Try again
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="dm-empty">
          <span className="dm-empty-mark" aria-hidden="true"><MessageCircle size={28} strokeWidth={1.8} /></span>
          <h2>No messages yet</h2>
          <p>Message someone from any post — asking “is this still available?” takes one tap. Your chats will show up here.</p>
          <button type="button" className="dm-btn" onClick={onBrowse} style={{ marginTop: 8 }}>Browse what’s here</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="dm-empty">
          <p>No chats match “{query.trim()}”.</p>
        </div>
      ) : (
        <ul className="dm-list" aria-label="Conversations">
          {filtered.map(r => (
            <li key={r.conversation.id}>
              <InboxItem row={r} me={s.me} now={now} selected={r.conversation.id === selectedId} onSelect={onSelect} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function InboxItem({ row, me, now, selected, onSelect }: {
  row: InboxRow; me: string | null; now: number; selected: boolean; onSelect: (id: string) => void;
}) {
  const { conversation: c, peer, unread } = row;
  const preview = usePostPreview(c.context);
  const name = peer?.name ?? 'Wecycle member';
  const mine = c.lastSenderId === me;
  const text = `${mine ? 'You: ' : ''}${c.lastMessage}`;
  const when = inboxTime(c.lastMessageAt, now);
  const label = [
    name,
    unread > 0 ? `${unread} unread` : null,
    c.context ? `about ${c.context.title}` : null,
    text,
    when === 'now' ? 'just now' : when ? `${when} ago` : null,
  ].filter(Boolean).join(', ');

  return (
    <button
      type="button"
      className="dm-list-item"
      data-unread={unread > 0 || undefined}
      aria-current={selected || undefined}
      aria-label={label}
      onClick={() => onSelect(c.id)}
    >
      <PeerAvatar id={c.peerId} peer={peer} size={52} />
      <span className="dm-list-text">
        <span className="dm-list-name">{name}</span>
        <span className="dm-list-preview">
          <span className="dm-list-preview-text">{text}</span>
          {when && <span className="dm-list-time">· {when}</span>}
        </span>
      </span>
      {preview?.image && <img src={preview.image} alt="" className="dm-list-thumb" draggable={false} />}
      {unread > 0 && <span className="dm-dot" aria-hidden="true" />}
    </button>
  );
}
