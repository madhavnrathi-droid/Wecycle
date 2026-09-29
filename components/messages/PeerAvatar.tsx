'use client';

import { getAvatar } from '../../lib/photos';
import type { Peer } from '../../lib/messaging/store';

/** A member's picture: their upload if they have one, else the same generated
 *  avatar the rest of the app shows for them — so the face in a chat is the
 *  face on their posts. Decorative: the name always sits beside it. */
export default function PeerAvatar({ id, peer, size }: { id: string; peer?: Peer | null; size: number }) {
  const src = peer?.avatarUrl || getAvatar(id, size > 48 ? 160 : 96);
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className="dm-avatar"
      style={{ width: size, height: size }}
      draggable={false}
    />
  );
}
