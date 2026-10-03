'use client';

import { Lock, ChevronDown } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { isPrivateRoom } from '../lib/rooms';
import { haptics } from '../lib/haptics';
import { track, EVT } from '../lib/analytics';

/* ── Which room you're in ────────────────────────────────────────────────────
 *
 * Members of a private room see a quiet chip — "NMIMS Mumbai · only your
 * campus" — because the promise made at sign-up (nobody else sees your posts)
 * is worth restating where they post. Manipal members see nothing: theirs is
 * the room the app has always been, and a label would be noise.
 *
 * Admins, who can look into every room to moderate it, get the same chip as a
 * switcher. A native select, not a custom menu: it is keyboard- and screen-
 * reader-correct for free, and on a phone it opens the platform picker. */
export default function RoomChip() {
  const { room, rooms, switchRoom } = useAuth();

  if (rooms.length > 1) {
    return (
      <label className="room-chip" style={{ position: 'relative', paddingRight: 8 }}>
        {isPrivateRoom(room) && <Lock size={11} strokeWidth={2.4} aria-hidden="true" />}
        <span aria-hidden="true">Viewing {room.name}</span>
        <ChevronDown size={13} strokeWidth={2.2} aria-hidden="true" />
        <select
          aria-label="Room to view"
          value={room.id}
          onChange={e => {
            haptics.selection();
            track(EVT.settings_changed, { group: 'admin', setting_key: 'room_view', value: e.target.value });
            switchRoom(e.target.value);
          }}
          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%' }}
        >
          {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </label>
    );
  }

  if (!isPrivateRoom(room)) return null;
  return (
    <span className="room-chip">
      <Lock size={11} strokeWidth={2.4} aria-hidden="true" />
      {room.name} · only your campus
    </span>
  );
}
