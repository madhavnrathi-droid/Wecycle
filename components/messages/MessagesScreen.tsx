'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { useBreakpoint } from '../../lib/useBreakpoint';
import { track, EVT } from '../../lib/analytics';
import { haptics } from '../../lib/haptics';
import { lockBodyScroll } from '../../lib/bodyLock';
import type { DeepLinkPost } from '../../lib/liveData';
import Inbox from './Inbox';
import ChatThread from './ChatThread';

export interface MessagesScreenProps {
  /** Open straight into this conversation (from a post or a profile). */
  initialConversationId?: string | null;
  /** 'thread' when opened from a post or profile: Back then leaves Messages
   *  rather than showing an inbox the member never asked for. 'inbox' when
   *  opened from the top bar — including on the way back from a profile that
   *  was opened from inside the inbox. */
  entry: 'inbox' | 'thread';
  onClose: () => void;
  onOpenProfile: (peerId: string) => void;
  /** With the conversation it was opened from, so Back can return to it. */
  onOpenPost: (post: DeepLinkPost, conversationId: string) => void;
  onBrowse: () => void;
}

/* ── The Messages screen ─────────────────────────────────────────────────────
 *
 * Phones: a stack, the way every messenger works — inbox, tap, thread, back.
 * Opened from a post, it goes straight to the thread, and Back returns to the
 * post rather than to an inbox the member never asked to see.
 *
 * From 1024px: two panes in one panel, inbox left and thread right, so moving
 * between conversations is one click and never loses the list.
 *
 * The screen tracks the VISUAL viewport, not the layout viewport. When a
 * phone keyboard opens, iOS shrinks the visual viewport and scrolls the page
 * under it; a chat sized to 100vh then has its composer hidden behind the
 * keyboard. Sizing to visualViewport keeps the composer sitting on top of the
 * keyboard, which is the only place a composer is useful. */
export default function MessagesScreen({
  initialConversationId, entry, onClose, onOpenProfile, onOpenPost, onBrowse,
}: MessagesScreenProps) {
  const { isDesktop } = useBreakpoint();
  const [selected, setSelected] = useState<string | null>(initialConversationId ?? null);
  /* Opened straight into a thread? Then Back leaves Messages entirely. */
  const enteredOnThread = useRef(entry === 'thread');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialConversationId) setSelected(initialConversationId);
  }, [initialConversationId]);

  useEffect(() => {
    track(EVT.messages_opened, { entry });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Keyboard-aware sizing. */
  useEffect(() => {
    const root = rootRef.current;
    const vv = window.visualViewport;
    if (!root || !vv) return;
    const apply = () => {
      root.style.setProperty('--dm-vh', `${vv.height}px`);
      root.style.setProperty('--dm-vv-top', `${vv.offsetTop}px`);
      root.dataset.kb = window.innerHeight - vv.height > 120 ? 'open' : 'closed';
    };
    apply();
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    return () => { vv.removeEventListener('resize', apply); vv.removeEventListener('scroll', apply); };
  }, []);

  /* The page underneath must not scroll while this is up. The shared lock,
     because the desktop post theatre this can open over holds one too. */
  useEffect(() => lockBodyScroll(), []);

  /* Escape closes the desktop panel. Anything layered above (the report sheet,
     the thread's menu) claims Escape first with preventDefault. */
  useEffect(() => {
    if (!isDesktop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isDesktop, onClose]);

  const openPost = (post: DeepLinkPost) => { if (selected) onOpenPost(post, selected); };

  const select = (id: string) => {
    haptics.light();
    setSelected(id);
  };

  const backFromThread = () => {
    if (enteredOnThread.current) { onClose(); return; }
    setSelected(null);
  };

  return (
    /* data-fbs marks a full-page surface: the desktop post theatre and the
       shared Modal stand down on Escape while it is up, so one Escape closes
       Messages and not the post it was opened from as well. */
    <div ref={rootRef} className="dm-root" data-fbs="">
      <div className="dm-shell">
        {isDesktop ? (
          <>
            <div className="dm-pane dm-pane--list">
              <Inbox selectedId={selected} onSelect={select} onClose={onClose} closeStyle="close" onBrowse={onBrowse} />
            </div>
            {selected ? (
              <ChatThread
                key={selected}
                conversationId={selected}
                onOpenProfile={onOpenProfile}
                onOpenPost={openPost}
              />
            ) : (
              <div className="dm-pane">
                <div className="dm-empty">
                  <span className="dm-empty-mark" aria-hidden="true"><MessageCircle size={28} strokeWidth={1.8} /></span>
                  <h2>Your messages</h2>
                  <p>Pick a conversation, or message someone from any post or profile.</p>
                </div>
              </div>
            )}
          </>
        ) : selected ? (
          <ChatThread
            key={selected}
            conversationId={selected}
            onBack={backFromThread}
            onOpenProfile={onOpenProfile}
            onOpenPost={openPost}
          />
        ) : (
          <div className="dm-pane">
            <Inbox selectedId={null} onSelect={select} onClose={onClose} closeStyle="back" onBrowse={onBrowse} />
          </div>
        )}
      </div>
    </div>
  );
}
