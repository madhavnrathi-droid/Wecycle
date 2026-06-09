'use client';

import { useEffect, useState, useCallback } from 'react';
import { ChevronLeft, MessageSquare } from 'lucide-react';
import {
  fetchConversations,
  subscribeToConversations,
  type Conversation,
} from '../lib/messaging';

/* ── Relative-time helper ── */
function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay === 1) return 'Yesterday';

  const d = new Date(iso);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

/* ── Props ── */
interface ConversationListScreenProps {
  onBack: () => void;
  onOpenThread: (
    conversationId: string,
    otherUser: { id: string; name: string; initials: string; color: string },
  ) => void;
}

/* ── Component ── */
export default function ConversationListScreen({
  onBack,
  onOpenThread,
}: ConversationListScreenProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await fetchConversations();
      /* Sort most-recent first */
      data.sort((a, b) =>
        new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
      );
      setConversations(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const unsub = subscribeToConversations(() => { load(); });
    return () => { unsub(); };
  }, [load]);

  return (
    <div
      className="screen-transition"
      style={{ paddingBottom: 80, background: 'var(--bg-base)', minHeight: '100%' }}
    >
      {/* ── Header ── */}
      <header
        style={{
          position: 'sticky', top: 0, zIndex: 30,
          background: 'var(--bg-overlay)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          padding: '10px 12px',
          display: 'flex', alignItems: 'center', gap: 8,
        }}
      >
        <button onClick={onBack} aria-label="Back" className="theme-toggle">
          <ChevronLeft size={20} strokeWidth={1.8} />
        </button>
        <h1
          style={{
            margin: 0, flex: 1, textAlign: 'center',
            fontSize: 16, fontWeight: 600, letterSpacing: '-0.02em',
            color: 'var(--text-primary)',
          }}
        >
          Messages
        </h1>
        <span style={{ width: 36 }} aria-hidden="true" />
      </header>

      {/* ── Body ── */}
      {loading ? (
        <LoadingSpinner />
      ) : conversations.length === 0 ? (
        <EmptyMessages />
      ) : (
        <ul
          role="list"
          style={{ margin: 0, padding: '8px 0', listStyle: 'none' }}
        >
          {conversations.map((conv) => (
            <ConversationRow
              key={conv.id}
              conversation={conv}
              onOpen={onOpenThread}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── Conversation row ── */
function ConversationRow({
  conversation: conv,
  onOpen,
}: {
  conversation: Conversation;
  onOpen: ConversationListScreenProps['onOpenThread'];
}) {
  const handleClick = () => {
    onOpen(conv.id, {
      id: conv.otherUser.id,
      name: conv.otherUser.name,
      initials: conv.otherUser.initials,
      color: conv.otherUser.color,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        aria-label={`Conversation with ${conv.otherUser.name}${conv.unreadCount > 0 ? `, ${conv.unreadCount} unread` : ''}`}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 16px',
          minHeight: 72,
          cursor: 'pointer',
          background: 'transparent',
          borderBottom: '1px solid var(--border-default)',
          transition: 'background 0.15s',
        }}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLDivElement).style.background = 'var(--bg-inset)')
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLDivElement).style.background = 'transparent')
        }
      >
        {/* Avatar */}
        <div
          aria-hidden="true"
          style={{
            flexShrink: 0,
            width: 44, height: 44,
            borderRadius: '50%',
            background: conv.otherUser.color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 700, color: '#fff',
            letterSpacing: '-0.02em',
          }}
        >
          {conv.otherUser.initials}
        </div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <span
              style={{
                fontSize: 15, fontWeight: conv.unreadCount > 0 ? 600 : 400,
                color: 'var(--text-primary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {conv.otherUser.name}
            </span>
            <span
              style={{
                flexShrink: 0,
                fontSize: 12,
                color: 'var(--text-muted)',
              }}
            >
              {formatRelativeTime(conv.lastMessageAt)}
            </span>
          </div>
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 8, marginTop: 2,
            }}
          >
            <span
              style={{
                fontSize: 14,
                color: conv.unreadCount > 0 ? 'var(--text-secondary)' : 'var(--text-muted)',
                fontWeight: conv.unreadCount > 0 ? 500 : 400,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                flex: 1,
              }}
            >
              {conv.lastMessage}
            </span>
            {conv.unreadCount > 0 && (
              <span
                aria-label={`${conv.unreadCount} unread`}
                style={{
                  flexShrink: 0,
                  minWidth: 20, height: 20,
                  padding: '0 5px',
                  borderRadius: 10,
                  background: 'var(--accent-green)',
                  color: '#fff',
                  fontSize: 11, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  lineHeight: 1,
                }}
              >
                {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

/* ── Loading spinner ── */
function LoadingSpinner() {
  return (
    <div
      role="status"
      aria-label="Loading messages"
      style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        padding: '64px 0',
      }}
    >
      <div
        style={{
          width: 28, height: 28,
          border: '2.5px solid var(--border-default)',
          borderTopColor: 'var(--accent-green)',
          borderRadius: '50%',
          animation: 'spin 0.75s linear infinite',
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ── Empty state ── */
function EmptyMessages() {
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '80px 32px 32px',
        gap: 12,
        textAlign: 'center',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: 64, height: 64,
          borderRadius: '50%',
          background: 'var(--bg-inset)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <MessageSquare size={28} strokeWidth={1.5} color="var(--text-muted)" />
      </div>
      <p
        style={{
          margin: 0, fontSize: 17, fontWeight: 600,
          color: 'var(--text-primary)',
        }}
      >
        No messages yet
      </p>
      <p
        style={{
          margin: 0, fontSize: 14,
          color: 'var(--text-muted)',
          maxWidth: 240, lineHeight: 1.5,
        }}
      >
        When you connect with neighbours about items, your conversations will appear here.
      </p>
    </div>
  );
}
