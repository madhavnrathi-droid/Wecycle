'use client';

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type KeyboardEvent,
} from 'react';
import { ChevronLeft, ArrowUp } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import {
  fetchMessages,
  sendMessage,
  markRead,
  subscribeToMessages,
  type Message,
} from '../lib/messaging';

export interface ChatThreadProps {
  conversationId: string;
  otherUser: { id: string; name: string; initials: string; color: string };
  onBack: () => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateSeparator(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (msgDay.getTime() === today.getTime()) return 'Today';
  if (msgDay.getTime() === yesterday.getTime()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export default function ChatThread({
  conversationId,
  otherUser,
  onBack,
}: ChatThreadProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior });
  }, []);

  // Auto-grow textarea
  const adjustTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const lineHeight = 20;
    const maxHeight = lineHeight * 4 + 24; // 4 lines + padding
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const msgs = await fetchMessages(conversationId);
      if (!cancelled) {
        setMessages(msgs);
        await markRead(conversationId);
        setTimeout(() => scrollToBottom('auto'), 0);
      }
    })();

    const unsub = subscribeToMessages(conversationId, (newMsg: Message) => {
      if (cancelled) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });
      markRead(conversationId);
      setTimeout(() => scrollToBottom('smooth'), 50);
    });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [conversationId, scrollToBottom]);

  // Scroll to bottom on new messages
  useEffect(() => {
    scrollToBottom('smooth');
  }, [messages.length, scrollToBottom]);

  const handleSend = useCallback(async () => {
    const body = inputValue.trim();
    if (!body || sending) return;
    setSending(true);
    setInputValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    try {
      await sendMessage(conversationId, body);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }, [inputValue, sending, conversationId]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // Build render list with date separators and grouping metadata
  type RenderItem =
    | { type: 'separator'; label: string; key: string }
    | {
        type: 'message';
        msg: Message;
        isOwn: boolean;
        isFirst: boolean;
        isLast: boolean;
      };

  const renderItems: RenderItem[] = [];
  let lastDay = '';
  let lastSender = '';

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const day = dayKey(msg.createdAt);
    if (day !== lastDay) {
      renderItems.push({
        type: 'separator',
        label: formatDateSeparator(msg.createdAt),
        key: `sep-${day}`,
      });
      lastDay = day;
      lastSender = '';
    }

    const isOwn = msg.senderId === user?.id;
    const nextMsg = messages[i + 1];
    const prevMsg = i > 0 ? messages[i - 1] : null;

    const isFirst =
      !prevMsg ||
      prevMsg.senderId !== msg.senderId ||
      dayKey(prevMsg.createdAt) !== day;
    const isLast =
      !nextMsg ||
      nextMsg.senderId !== msg.senderId ||
      dayKey(nextMsg.createdAt) !== day;

    renderItems.push({ type: 'message', msg, isOwn, isFirst, isLast });
    lastSender = msg.senderId;
  }
  void lastSender;

  const canSend = inputValue.trim().length > 0 && !sending;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--bg-base)',
        color: 'var(--text-primary)',
        fontFamily: 'inherit',
      }}
      role="main"
      aria-label={`Conversation with ${otherUser.name}`}
    >
      {/* Header */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px 16px',
          paddingTop: 'max(12px, env(safe-area-inset-top))',
          background: 'rgba(var(--bg-base-rgb, 15,15,15), 0.85)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--border-default)',
        }}
      >
        <button
          onClick={onBack}
          aria-label="Go back"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            border: 'none',
            background: 'transparent',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <ChevronLeft size={22} />
        </button>

        {/* Avatar */}
        <div
          aria-hidden="true"
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            background: otherUser.color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: '14px',
            color: '#fff',
            flexShrink: 0,
          }}
        >
          {otherUser.initials}
        </div>

        <span
          style={{
            flex: 1,
            fontWeight: 600,
            fontSize: '16px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {otherUser.name}
        </span>
      </header>

      {/* Message list */}
      <div
        role="log"
        aria-live="polite"
        aria-label="Messages"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              fontSize: '15px',
              marginTop: '80px',
            }}
          >
            Start the conversation!
          </div>
        )}

        {renderItems.map((item) => {
          if (item.type === 'separator') {
            return (
              <div
                key={item.key}
                role="separator"
                aria-label={item.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  margin: '12px 0 8px',
                  color: 'var(--text-muted)',
                  fontSize: '12px',
                }}
              >
                <div
                  style={{ flex: 1, height: '1px', background: 'var(--border-default)' }}
                />
                <span>{item.label}</span>
                <div
                  style={{ flex: 1, height: '1px', background: 'var(--border-default)' }}
                />
              </div>
            );
          }

          const { msg, isOwn, isFirst, isLast } = item;

          const bubbleRadius = '18px';
          const ownBorderRadius = isFirst && isLast
            ? bubbleRadius
            : isFirst
            ? `${bubbleRadius} ${bubbleRadius} 6px ${bubbleRadius}`
            : isLast
            ? `${bubbleRadius} 6px ${bubbleRadius} ${bubbleRadius}`
            : `${bubbleRadius} 6px 6px ${bubbleRadius}`;

          const otherBorderRadius = isFirst && isLast
            ? bubbleRadius
            : isFirst
            ? `${bubbleRadius} ${bubbleRadius} ${bubbleRadius} 6px`
            : isLast
            ? `6px ${bubbleRadius} ${bubbleRadius} ${bubbleRadius}`
            : `6px ${bubbleRadius} ${bubbleRadius} 6px`;

          return (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: isOwn ? 'flex-end' : 'flex-start',
                marginBottom: isLast ? '8px' : '2px',
              }}
            >
              <div
                style={{
                  maxWidth: '72%',
                  padding: '10px 14px',
                  borderRadius: isOwn ? ownBorderRadius : otherBorderRadius,
                  background: isOwn
                    ? 'var(--text-primary)'
                    : 'var(--bg-card)',
                  color: isOwn
                    ? 'var(--bg-base)'
                    : 'var(--text-primary)',
                  border: isOwn
                    ? 'none'
                    : '1px solid var(--border-default)',
                  fontSize: '15px',
                  lineHeight: 1.45,
                  wordBreak: 'break-word',
                }}
              >
                {msg.body}
              </div>
              {isLast && (
                <span
                  style={{
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    marginTop: '3px',
                    padding: '0 4px',
                  }}
                >
                  {formatTime(msg.createdAt)}
                </span>
              )}
            </div>
          );
        })}

        <div ref={bottomRef} style={{ height: 1 }} aria-hidden="true" />
      </div>

      {/* Input area */}
      <div
        style={{
          position: 'sticky',
          bottom: 0,
          padding: '10px 12px',
          paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
          background: 'var(--bg-base)',
          borderTop: '1px solid var(--border-default)',
          display: 'flex',
          alignItems: 'flex-end',
          gap: '8px',
        }}
      >
        <textarea
          ref={textareaRef}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            adjustTextarea();
          }}
          onKeyDown={handleKeyDown}
          placeholder="Message…"
          rows={1}
          aria-label="Message input"
          aria-multiline="true"
          style={{
            flex: 1,
            resize: 'none',
            background: 'var(--bg-inset)',
            border: '1px solid var(--border-default)',
            borderRadius: '20px',
            padding: '10px 14px',
            fontSize: '15px',
            lineHeight: '20px',
            color: 'var(--text-primary)',
            outline: 'none',
            fontFamily: 'inherit',
            overflowY: 'auto',
            minHeight: '40px',
            maxHeight: '104px', // ~4 lines
          }}
        />
        <button
          onClick={handleSend}
          disabled={!canSend}
          aria-label="Send message"
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            border: 'none',
            background: canSend ? 'var(--accent-green)' : 'var(--bg-inset)',
            color: canSend ? '#fff' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: canSend ? 'pointer' : 'not-allowed',
            flexShrink: 0,
            transition: 'background 0.15s, color 0.15s',
          }}
        >
          <ArrowUp size={18} />
        </button>
      </div>
    </div>
  );
}
