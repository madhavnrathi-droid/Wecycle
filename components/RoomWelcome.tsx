'use client';

import { Lock, Plus, Share2 } from 'lucide-react';
import type { Room } from '../lib/rooms';
import { haptics } from '../lib/haptics';
import { track, EVT } from '../lib/analytics';

interface RoomWelcomeProps {
  room: Room;
  onPost: () => void;
  onShare: () => void;
  onRequest: () => void;
  onLostFound: () => void;
  onInvite: () => void;
}

/* ── A new room, before anyone has posted ────────────────────────────────────
 *
 * A private room opens empty, and an empty marketplace is where people leave:
 * there is nothing to buy, so nobody sells, so there is nothing to buy. The
 * generic "feed's just sprouting" line was written for a quiet day on a busy
 * campus; this is a different situation and says so plainly — you are early,
 * this room is yours, here is what to put in it first.
 *
 * Three concrete starts rather than one "post something": naming the kinds of
 * thing that fill a campus marketplace (the textbook you're done with, the
 * thing you need for a week) is what turns "I have nothing to post" into "oh,
 * that". Each goes straight to the right form. */
export default function RoomWelcome({ room, onPost, onShare, onRequest, onLostFound, onInvite }: RoomWelcomeProps) {
  const go = (kind: string, fn: () => void) => () => {
    haptics.light();
    track(EVT.marketing_banner_tapped, { slide: `room_welcome_${kind}`, room: room.key });
    fn();
  };
  return (
    <section className="room-empty" aria-labelledby="room-empty-title">
      <span className="room-chip">
        <Lock size={11} strokeWidth={2.4} aria-hidden="true" />
        {room.name}
      </span>
      <h2 id="room-empty-title">You’re early to {room.name}</h2>
      <p>
        This room is only for {room.name} — nobody from another campus can see what’s
        posted here. It’s empty right now, so the first few things you post are what
        everyone after you will find.
      </p>
      <div className="room-empty-ideas" role="group" aria-label="Ways to start">
        <button type="button" className="room-empty-idea" onClick={go('share', onShare)}>Sell or give something away</button>
        <button type="button" className="room-empty-idea" onClick={go('request', onRequest)}>Ask for something you need</button>
        <button type="button" className="room-empty-idea" onClick={go('lostfound', onLostFound)}>Lost or found something?</button>
      </div>
      <div className="room-empty-actions">
        <button type="button" className="dm-btn" onClick={go('post', onPost)}>
          <Plus size={16} strokeWidth={2.2} /> Post something
        </button>
        <button type="button" className="dm-btn dm-btn--soft" onClick={go('invite', onInvite)}>
          <Share2 size={15} strokeWidth={2} /> Invite classmates
        </button>
      </div>
    </section>
  );
}
