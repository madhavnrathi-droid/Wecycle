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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, Send, CornerDownRight, Trash2, Flag } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { fetchComments, createComment, removeComment, timeAgo, type Comment } from '../lib/comments';
import { isServerModerationError } from '../lib/contentFilter';
import type { FeedEntityType } from '../lib/api/feed';
import { track, EVT } from '../lib/analytics';
import { USERS, type User } from '../lib/mockData';
import { getAvatar } from '../lib/photos';
import ReportSheet from './ReportSheet';
import { getBlockedUserIds, onBlocksChange } from '../lib/moderation';

interface CommentsSectionProps {
  postId: string;
  /** Which feed entity the postId refers to — keys the comments table row. */
  entityType: FeedEntityType;
  onRequireAuth: () => void;
  /** When provided, tapping a commenter's name/avatar opens their storefront. */
  onOpenStorefront?: (user: User) => void;
}

export default function CommentsSection({ postId, entityType, onRequireAuth, onOpenStorefront }: CommentsSectionProps) {
  const { user, profile, isAdmin, isDemo } = useAuth();
  const [reportTarget, setReportTarget] = useState<{ commentId: string; commentAuthorId: string; preview: string } | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  /* Blocking has to reach comments, not just the feed. A block that still lets
     the blocked person's replies show up under a post isn't a block — and
     comments are the closest thing this app has to a direct message, so it's
     the one surface where it matters most. Subscribed rather than read once so
     blocking from the report sheet takes effect without a remount. */
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  useEffect(() => {
    getBlockedUserIds().then(setBlocked);
    return onBlocksChange(() => getBlockedUserIds().then(setBlocked));
  }, []);
  const [draft, setDraft] = useState('');
  /* Why a comment was refused. The composer clears optimistically, so a refusal
     has to both explain itself AND hand the text back — losing what someone
     typed is a worse outcome than the post they were trying to make. */
  const [postError, setPostError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  /* Load + reload comments for this post. Demo reads the in-memory store; live
     mode reads the `comments` table (author resolved via the profiles join).
     Re-runs when the post / entity / mode changes. */
  const reload = useCallback(() => {
    let alive = true;
    fetchComments(postId, entityType, isDemo).then(rows => { if (alive) setComments(rows); });
    return () => { alive = false; };
  }, [postId, entityType, isDemo]);
  useEffect(() => reload(), [reload]);

  const handleDelete = async (c: Comment) => {
    if (typeof window !== 'undefined' && !window.confirm('Admin: delete this comment?')) return;
    await removeComment(postId, c.id, entityType, isDemo);
    reload();
  };

  /* Group: top-level → replies map. We don't expect deep recursion, so a single
     pass is enough. */
  const { tops, repliesByParent } = useMemo(() => {
    const tops: Comment[] = [];
    const repliesByParent = new Map<string, Comment[]>();
    /* Filtering here rather than at render means a blocked author's top-level
       comment takes its whole reply thread with it: replies keyed to a parent
       that no longer exists are never looked up. That is the behaviour we want
       — you should not have to read a conversation rooted in someone you
       blocked. */
    for (const c of comments.filter(c => !blocked.has(c.author.id))) {
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
  }, [comments, blocked]);

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

  const submit = async () => {
    const body = draft.trim();
    if (!body) return;
    if (!user || !me) { onRequireAuth(); return; }
    const wasReplyingTo = replyTo;
    const mentions = wasReplyingTo
      ? [{ userId: wasReplyingTo.author.id, name: wasReplyingTo.author.name }]
      : undefined;
    /* Clear the composer optimistically — the reload repaints with the
       persisted row (real id + createdAt, live author from the DB join). */
    setDraft('');
    setReplyTo(null);
    setPostError(null);
    let created: Awaited<ReturnType<typeof createComment>> = null;
    try {
      created = await createComment(
        { postId, entityType, author: me, body, parentId: wasReplyingTo?.id, mentions },
        isDemo,
      );
    } catch (e) {
      /* Blocked by the filter — client-side, or by the database if this client
         is out of date. Either way the person needs the sentence and their
         words back. */
      setPostError(
        isServerModerationError(e)
          ? 'That wording isn’t allowed on Wecycle. Please reword and try again.'
          : ((e as Error).message || 'Could not post that comment.'),
      );
      setDraft(body);
      setReplyTo(wasReplyingTo);
      return;
    }
    if (!created) {
      /* Write failed (network / not signed in) — restore the draft + reply
         target so the user doesn't lose what they typed. */
      setDraft(body);
      setReplyTo(wasReplyingTo);
      return;
    }
    track(EVT.comment_posted, {
      post_id: postId,
      is_reply: !!wasReplyingTo,
      body_length: body.length,
      has_mention: !!mentions?.length,
    });
    reload();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    /* Enter to send, Shift+Enter for newline (mirrors IG / WhatsApp web) */
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
    if (e.key === 'Escape' && replyTo) cancelReply();
  };

  /* Count what's actually shown — a "12 comments" header over 9 visible ones
     silently tells the user their block didn't work. */
  const total = tops.length + [...repliesByParent.values()].reduce((n, a) => n + a.length, 0);

  return (
    <section aria-label="Comments" style={{
      marginTop: 24,
      paddingTop: 18,
      borderTop: '1px solid var(--border-subtle)',
    }}>
      <h2 style={{
        margin: '0 0 14px',
        fontSize: 'calc(14px * var(--text-scale))', fontWeight: 600,
        color: 'var(--text-primary)',
        letterSpacing: '-0.01em',
        display: 'inline-flex', alignItems: 'center', gap: 8,
      }}>
        <MessageCircle size={14} strokeWidth={2} />
        Comments {total > 0 && <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>· {total}</span>}
      </h2>

      {tops.length === 0 ? (
        <p style={{ margin: '0 0 14px', fontSize: 'calc(13px * var(--text-scale))', color: 'var(--text-muted)' }}>
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
            fontSize: 'calc(11px * var(--text-scale))', color: 'var(--text-secondary)',
          }}>
            <CornerDownRight size={11} strokeWidth={2} />
            Replying to <strong style={{ color: 'var(--text-primary)' }}>{replyTo.author.name}</strong>
            <button
              type="button"
              onClick={cancelReply}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', padding: 0, marginLeft: 4,
                fontSize: 'calc(11px * var(--text-scale))', fontWeight: 600,
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
                color: '#fff', fontSize: 'calc(12px * var(--text-scale))', fontWeight: 700,
              }}>?</div>
            )}
          </div>

          <textarea
            ref={inputRef}
            value={draft}
            onChange={e => { setDraft(e.target.value); if (postError) setPostError(null); }}
            onKeyDown={onKeyDown}
            onFocus={() => { if (!user) { onRequireAuth(); inputRef.current?.blur(); } }}
            placeholder={user ? 'Add a comment…' : 'Sign in to comment'}
            rows={1}
            style={{
              all: 'unset', boxSizing: 'border-box', flex: 1, minWidth: 0,
              fontSize: 'calc(14px * var(--text-scale))', lineHeight: 1.45,
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
              all: 'unset', boxSizing: 'border-box', cursor: draft.trim() ? 'pointer' : 'not-allowed',
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
        {postError && (
          <p role="alert" style={{
            margin: '8px 4px 0',
            fontSize: 'calc(12.5px * var(--text-scale))',
            lineHeight: 1.45,
            color: 'var(--accent-rose)',
          }}>
            {postError}
          </p>
        )}

        <p style={{
          margin: '8px 4px 0', fontSize: 'calc(11px * var(--text-scale))', color: 'var(--text-muted)', lineHeight: 1.45,
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
          all: 'unset', boxSizing: 'border-box', cursor: av ? 'pointer' : 'default',
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
              all: 'unset', boxSizing: 'border-box', cursor: av ? 'pointer' : 'default',
              fontSize: `calc(${compact ? 12 : 13}px * var(--text-scale))`, fontWeight: 600,
              color: 'var(--text-primary)',
              letterSpacing: '-0.01em',
            }}
          >
            {comment.author.name}
          </button>
          <span style={{ fontSize: 'calc(11px * var(--text-scale))', color: 'var(--text-muted)' }}>
            {comment.author.role}
          </span>
          <span style={{ fontSize: 'calc(11px * var(--text-scale))', color: 'var(--text-muted)' }}>
            · {timeAgo(comment.createdAt)}
          </span>
        </div>
        <p style={{
          margin: '2px 0 0',
          fontSize: `calc(${compact ? 13 : 14}px * var(--text-scale))`, lineHeight: 1.45,
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
              all: 'unset', boxSizing: 'border-box', cursor: 'pointer',
              fontSize: 'calc(11px * var(--text-scale))', fontWeight: 600,
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
                all: 'unset', boxSizing: 'border-box', cursor: 'pointer',
                fontSize: 'calc(11px * var(--text-scale))', fontWeight: 600,
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
                all: 'unset', boxSizing: 'border-box', cursor: 'pointer',
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
