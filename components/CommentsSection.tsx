'use client';

/* Comments thread for an item or event detail page.
 *
 * Rules:
 *   - Anonymous posting is forbidden — you must be signed in to comment.
 *     When a logged-out viewer taps "Add a comment", we bounce them to the
 *     auth modal via `onRequireAuth`.
 *   - Threading is one level deep (top-level + replies). Deeper nesting would
 *     mislead users on a small screen; if it's needed later we'll collapse
 *     into "View N more replies" the way IG does.
 *   - @Mentions are highlighted inline. They aren't clickable yet — that's a
 *     storefront link we'll add when the routing for arbitrary users is wired.
 *   - Reply targets the parent comment author by default and prefills "@Name ".
 *
 * Persistence is the in-memory store in lib/comments.ts. Replace with Supabase
 * later — the Comment shape already matches what the table will look like. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, Send, CornerDownRight, Trash2, Flag } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { addComment, deleteComment, getComments, timeAgo, type Comment } from '../lib/comments';
import { track, EVT } from '../lib/analytics';
import { USERS, type User } from '../lib/mockData';
import { getAvatar } from '../lib/photos';
import ReportSheet from './ReportSheet';

interface CommentsSectionProps {
  postId: string;
  onRequireAuth: () => void;
  /** When provided, tapping a commenter's name/avatar opens their storefront. */
  onOpenStorefront?: (user: User) => void;
}

export default function CommentsSection({ postId, onRequireAuth, onOpenStorefront }: CommentsSectionProps) {
  const { user, profile, isAdmin } = useAuth();
  const [reportTarget, setReportTarget] = useState<{ commentId: string; commentAuthorId: string; preview: string } | null>(null);
  const handleDelete = (c: Comment) => {
    if (typeof window !== 'undefined' && !window.confirm('Admin: delete this comment?')) return;
    deleteComment(postId, c.id);
    setComments(getComments(postId));
  };
  const [comments, setComments] = useState<Comment[]>(() => getComments(postId));
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  /* Re-fetch when the post changes (component is re-used between detail pages). */
  useEffect(() => { setComments(getComments(postId)); }, [postId]);

  /* Group: top-level → replies map. We don't expect deep recursion, so a single
     pass is enough. */
  const { tops, repliesByParent } = useMemo(() => {
    const tops: Comment[] = [];
    const repliesByParent = new Map<string, Comment[]>();
    for (const c of comments) {
      if (c.parentId) {
        const arr = repliesByParent.get(c.parentId) ?? [];
        arr.push(c);
        repliesByParent.set(c.parentId, arr);
      } else {
        tops.push(c);
      }
    }
    /* Newest top-level last so the conversation reads top-to-bottom like IG */
    tops.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    repliesByParent.forEach(arr => arr.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
    return { tops, repliesByParent };
  }, [comments]);

  /* The author object we attach to new comments. For demo sessions we forge a
     User-shaped record from the demo profile so the row renders properly. */
  const me = useMemo(() => {
    if (!user) return null;
    /* Prefer the real USERS entry when ids match (demo session uses 'u0' or
       similar — we fall back to a synthetic record). */
    const known = USERS.find(u => u.id === user.id);
    if (known) return known;
    return {
      id: user.id,
      name: profile?.full_name ?? (user as { email?: string } | null)?.email ?? 'You',
      initials: (profile?.initials ?? '?').slice(0, 2),
      color: profile?.avatar_color ?? '#6C63FF',
      role: profile?.role ?? 'Member',
      community: 'Your community',
      joinedDaysAgo: 0,
      itemsShared: 0, itemsReceived: 0, impactScore: 0,
      badges: [], isOnline: true,
    };
  }, [user, profile]);

  const focusInput = () => {
    /* Defer focus until React paints the new placeholder text */
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const beginReply = (c: Comment) => {
    if (!user) { onRequireAuth(); return; }
    setReplyTo(c);
    setDraft(prev => prev.startsWith(`@${c.author.name}`) ? prev : `@${c.author.name} `);
    focusInput();
  };

  const cancelReply = () => {
    setReplyTo(null);
    setDraft('');
  };

  const submit = () => {
    const body = draft.trim();
    if (!body) return;
    if (!user || !me) { onRequireAuth(); return; }
    const mentions = replyTo
      ? [{ userId: replyTo.author.id, name: replyTo.author.name }]
      : undefined;
    addComment({
      postId,
      author: me,
      body,
      parentId: replyTo?.id,
      mentions,
    });
    track(EVT.comment_posted, {
      post_id: postId,
      is_reply: !!replyTo,
      body_length: body.length,
      has_mention: !!mentions?.length,
    });
    /* Refresh from the store so we pick up the auto-generated id + createdAt */
    setComments(getComments(postId));
    setDraft('');
    setReplyTo(null);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    /* Enter to send, Shift+Enter for newline (mirrors IG / WhatsApp web) */
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
    if (e.key === 'Escape' && replyTo) cancelReply();
  };

  const total = comments.length;

  return (
    <section aria-label="Comments" style={{
      marginTop: 24,
      paddingTop: 18,
      borderTop: '1px solid var(--border-subtle)',
    }}>
      <h2 style={{
        margin: '0 0 14px',
        fontSize: 14, fontWeight: 600,
        color: 'var(--text-primary)',
        letterSpacing: '-0.01em',
        display: 'inline-flex', alignItems: 'center', gap: 8,
      }}>
        <MessageCircle size={14} strokeWidth={2} />
        Comments {total > 0 && <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>· {total}</span>}
      </h2>

      {tops.length === 0 ? (
        <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text-muted)' }}>
          No comments yet — be the first to start the conversation.
        </p>
      ) : (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {tops.map(top => (
            <li key={top.id}>
              <CommentRow
                comment={top}
                onReply={beginReply}
                onAvatarClick={onOpenStorefront}
                onDelete={isAdmin ? () => handleDelete(top) : undefined}
                onReport={user && top.author.id !== user.id ? () => setReportTarget({ commentId: top.id, commentAuthorId: top.author.id, preview: top.body.slice(0, 80) }) : undefined}
              />
              {(repliesByParent.get(top.id) ?? []).length > 0 && (
                <ol style={{
                  listStyle: 'none', margin: '10px 0 0 36px', padding: 0,
                  display: 'flex', flexDirection: 'column', gap: 10,
                  borderLeft: '1px solid var(--border-subtle)',
                  paddingLeft: 14,
                }}>
                  {(repliesByParent.get(top.id) ?? []).map(r => (
                    <li key={r.id}>
                      <CommentRow
                        comment={r}
                        compact
                        onReply={beginReply}
                        onAvatarClick={onOpenStorefront}
                        onDelete={isAdmin ? () => handleDelete(r) : undefined}
                        onReport={user && r.author.id !== user.id ? () => setReportTarget({ commentId: r.id, commentAuthorId: r.author.id, preview: r.body.slice(0, 80) }) : undefined}
                      />
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ol>
      )}

      {/* ── Composer ───────────────────────────── */}
      <div style={{ marginTop: 16 }}>
        {replyTo && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '4px 10px', marginBottom: 8,
            background: 'var(--bg-inset)',
            borderRadius: 999,
            fontSize: 11, color: 'var(--text-secondary)',
          }}>
            <CornerDownRight size={11} strokeWidth={2} />
            Replying to <strong style={{ color: 'var(--text-primary)' }}>{replyTo.author.name}</strong>
            <button
              type="button"
              onClick={cancelReply}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', padding: 0, marginLeft: 4,
                fontSize: 11, fontWeight: 600,
              }}
            >
              Cancel
            </button>
          </div>
        )}

        <div style={{
          display: 'flex', alignItems: 'flex-end', gap: 10,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-default)',
          borderRadius: 16,
          padding: 10,
        }}>
          {/* Your avatar so it's clear who's posting (not anonymous) */}
          <div style={{
            width: 30, height: 30, borderRadius: '50%',
            overflow: 'hidden', flexShrink: 0,
            background: profile?.avatar_color ?? '#6C63FF',
          }}>
            {user ? (
              <img
                src={getAvatar(user.id)}
                alt=""
                width={30} height={30}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div style={{
                width: '100%', height: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 12, fontWeight: 700,
              }}>?</div>
            )}
          </div>

          <textarea
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => { if (!user) { onRequireAuth(); inputRef.current?.blur(); } }}
            placeholder={user ? 'Add a comment…' : 'Sign in to comment'}
            rows={1}
            style={{
              all: 'unset', flex: 1, minWidth: 0,
              fontSize: 14, lineHeight: 1.45,
              color: 'var(--text-primary)',
              fontFamily: 'inherit',
              resize: 'none',
              maxHeight: 120,
              overflowY: 'auto',
            }}
            aria-label="Comment text"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!draft.trim()}
            aria-label="Post comment"
            style={{
              all: 'unset', cursor: draft.trim() ? 'pointer' : 'not-allowed',
              width: 34, height: 34, borderRadius: '50%',
              background: draft.trim() ? 'var(--text-primary)' : 'var(--bg-inset)',
              color: draft.trim() ? 'var(--bg-base)' : 'var(--text-muted)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Send size={14} strokeWidth={2} />
          </button>
        </div>

        <p style={{
          margin: '8px 4px 0', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.45,
        }}>
          Your name + photo show next to every comment — anonymous posts aren't allowed for safety.
        </p>
      </div>
      <ReportSheet
        open={!!reportTarget}
        onClose={() => setReportTarget(null)}
        targetType="comment"
        targetId={reportTarget?.commentId ?? ''}
        targetUserId={reportTarget?.commentAuthorId}
        targetLabel={reportTarget ? `"${reportTarget.preview}"` : undefined}
      />
    </section>
  );
}

/* ── Comment row ──────────────────────────────── */

function CommentRow({
  comment, compact, onReply, onAvatarClick, onDelete, onReport,
}: {
  comment: Comment;
  compact?: boolean;
  onReply: (c: Comment) => void;
  onAvatarClick?: (user: User) => void;
  /** Admin moderation: when present, shows a red trash button on the row. */
  onDelete?: () => void;
  /** Present for non-own comments — opens the report sheet. */
  onReport?: () => void;
}) {
  const av = onAvatarClick
    ? () => onAvatarClick(comment.author)
    : undefined;

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
    }}>
      <button
        type="button"
        onClick={av}
        aria-label={`View ${comment.author.name}'s profile`}
        style={{
          all: 'unset', cursor: av ? 'pointer' : 'default',
          width: compact ? 26 : 30, height: compact ? 26 : 30,
          borderRadius: '50%', overflow: 'hidden',
          background: comment.author.color,
          flexShrink: 0,
        }}
      >
        <img
          src={getAvatar(comment.author.id)}
          alt=""
          width={compact ? 26 : 30}
          height={compact ? 26 : 30}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap',
        }}>
          <button
            type="button"
            onClick={av}
            style={{
              all: 'unset', cursor: av ? 'pointer' : 'default',
              fontSize: compact ? 12 : 13, fontWeight: 600,
              color: 'var(--text-primary)',
              letterSpacing: '-0.01em',
            }}
          >
            {comment.author.name}
          </button>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {comment.author.role}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            · {timeAgo(comment.createdAt)}
          </span>
        </div>
        <p style={{
          margin: '2px 0 0',
          fontSize: compact ? 13 : 14, lineHeight: 1.45,
          color: 'var(--text-secondary)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          <Body text={comment.body} />
        </p>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
          <button
            type="button"
            onClick={() => onReply(comment)}
            style={{
              all: 'unset', cursor: 'pointer',
              fontSize: 11, fontWeight: 600,
              color: 'var(--text-muted)',
              letterSpacing: '0.01em',
            }}
          >
            Reply
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              aria-label="Admin: delete comment"
              style={{
                all: 'unset', cursor: 'pointer',
                fontSize: 11, fontWeight: 600,
                color: '#ED2E50',
                display: 'inline-flex', alignItems: 'center', gap: 3,
              }}
            >
              <Trash2 size={11} strokeWidth={2} /> Delete
            </button>
          )}
          {onReport && (
            <button
              type="button"
              onClick={onReport}
              aria-label="Report comment"
              style={{
                all: 'unset', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center',
                color: 'var(--text-muted)',
                padding: '4px',
              }}
            >
              <Flag size={16} strokeWidth={1.8} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* Render @mentions as inline chips, preserving the rest of the text. */
function Body({ text }: { text: string }) {
  const parts = text.split(/(@[\w'-]+(?:\s[\w'-]+)?)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('@')
          ? <span
              key={i}
              style={{
                color: 'var(--accent-amber)',
                fontWeight: 600,
              }}
            >{p}</span>
          : <span key={i}>{p}</span>
      )}
    </>
  );
}
