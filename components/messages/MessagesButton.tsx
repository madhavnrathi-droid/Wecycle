'use client';

import { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { useMessaging } from '../../lib/messaging/useMessaging';
import { messagingAvailable, unreadConversations } from '../../lib/messaging/store';

/** Top-right on every tab, where Instagram put it and where people now look.
 *  The badge counts conversations with something unread, not messages — one
 *  chatty person is one thing to deal with, not seven. */
export default function MessagesButton({ onClick }: { onClick: () => void }) {
  const s = useMessaging();
  /* messagingAvailable() reads the demo flag from localStorage, which the
     server render cannot see — decide after mount so hydration matches. */
  const [available, setAvailable] = useState(false);
  useEffect(() => { setAvailable(messagingAvailable()); }, []);
  if (!available) return null;

  const n = unreadConversations(s);
  const label = n > 0 ? `Messages, ${n} unread conversation${n === 1 ? '' : 's'}` : 'Messages';
  return (
    <button type="button" onClick={onClick} aria-label={label} className="theme-toggle dm-topbtn">
      <MessageCircle size={22} strokeWidth={1.8} aria-hidden="true" />
      {n > 0 && <span className="dm-badge" aria-hidden="true">{n > 9 ? '9+' : n}</span>}
    </button>
  );
}
