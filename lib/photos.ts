/**
 * Real Unsplash photos for mock items.
 *
 * Source URLs follow the format:
 *   https://images.unsplash.com/photo-{id}?w={w}&auto=format&fit=crop&q={q}
 *
 * To swap in a different photo, change the entry below — components read
 * via `getItemPhoto(id)` which returns a URL or undefined.
 */

const u = (id: string, w = 800, q = 80) =>
  `https://images.unsplash.com/photo-${id}?w=${w}&h=${w}&auto=format&fit=crop&q=${q}`;

/* Each key matches a mock item id (m1, f2, lf1, e1, …) */
export const ITEM_PHOTOS: Record<string, string> = {
  /* Marketplace */
  m1:  u('1505740420928-5e560c06d30e'),                    // sony headphones
  m2:  u('1567538096630-e0c55bd6374c'),                    // wooden side table
  m3:  u('1635070041078-e363dbe005cb'),                    // calculator
  m4:  u('1481627834876-b7833e8f5570'),                    // stack of books
  m5:  u('1547119957-637f8679db1e'),                       // monitor on desk
  m6:  u('1545205597-3d9d02c29597'),                       // yoga mat
  m7:  u('1581244277943-fe4a9c777189'),                    // cordless drill
  m8:  u('1565374395542-0ce18882c857'),                    // desk fan
  m9:  u('1551601651-bc60f254d532'),                       // lab coat / clean shirt
  m10: u('1544787219-7f47ccb76574'),                       // electric kettle (verified)
  m11: u('1502920917128-1aa500764cbd'),                    // canon camera
  m12: u('1531415074968-036ba1b575da'),                    // cricket bat / sport

  /* Feed item shares (reuse marketplace photos) */
  f2:  u('1505740420928-5e560c06d30e'),                    // sony headphones
  f5:  u('1567538096630-e0c55bd6374c'),                    // side table
  f7:  u('1568667256549-094345857637'),                    // architecture books
  f10: u('1502920917128-1aa500764cbd'),                    // canon camera

  /* Lost & Found */
  lf1: u('1583394838336-acd977736f90'),                    // usb-c charger
  lf2: u('1542496658-e33a6d0d50f6'),                       // wrist watch
  lf3: u('1606220945770-b5b6c2c55bf1'),                    // earphones
  lf4: u('1627123424574-724758594e93'),                    // wallet
  lf5: u('1581605405669-fcdf81165afa'),                    // backpack
  lf6: u('1572021335469-31706a17aaef'),                    // keys

  /* Repair before/after */
  f6_before: u('1565374395542-0ce18882c857'),
  f6_after:  u('1517336714731-489689fd1ca8'),
};

/* Multi-photo sets — items that have a small gallery (max 3). */
export const ITEM_PHOTO_SETS: Record<string, string[]> = {
  /* Sony headphones — front, side, with case */
  m1: [
    u('1505740420928-5e560c06d30e'),
    u('1583394838336-acd977736f90'),
    u('1606220945770-b5b6c2c55bf1'),
  ],
  /* IKEA side table — full + detail */
  m2: [
    u('1567538096630-e0c55bd6374c'),
    u('1493663284031-b7e3aefcae8e'),
  ],
  /* Architecture books — cover, spread */
  m4: [
    u('1481627834876-b7833e8f5570'),
    u('1568667256549-094345857637'),
  ],
  /* Portable monitor — workspace + detail */
  m5: [
    u('1547119957-637f8679db1e'),
    u('1527443195645-1133f7f28990'),
  ],
  /* Yoga mat — rolled, in use, blocks */
  m6: [
    u('1545205597-3d9d02c29597'),
    u('1517649763962-0c623066013b'),
    u('1592432678016-e910b452f9a2'),
  ],
  /* Camera — body + lens */
  m11: [
    u('1502920917128-1aa500764cbd'),
    u('1500146169501-d3ea08e6e10b'),
  ],
};

/* Looks up a single photo URL (for compact thumbnails). */
export function getItemPhoto(id: string): string | undefined {
  return ITEM_PHOTO_SETS[id]?.[0] ?? ITEM_PHOTOS[id];
}

/* Returns 1+ photo URLs for an item.
   Falls back to a single URL → wrapped in an array → category photo. */
export function getItemPhotos(id: string, category?: string): string[] {
  if (ITEM_PHOTO_SETS[id]) return ITEM_PHOTO_SETS[id];
  if (ITEM_PHOTOS[id])     return [ITEM_PHOTOS[id]];
  return [getCategoryPhoto(category)];
}

/* Generic, themed Unsplash fallback by category. */
export function getCategoryPhoto(category?: string): string {
  switch ((category || '').toLowerCase()) {
    case 'electronics': return u('1498049794561-7780e7231661');
    case 'furniture':   return u('1567538096630-e0c55bd6374c');
    case 'books':       return u('1481627834876-b7833e8f5570');
    case 'stationery':  return u('1632571401005-458572a59d7c');
    case 'sports':      return u('1517649763962-0c623066013b');
    case 'tools':       return u('1530124566582-a618bc2615dc');
    case 'kitchen':     return u('1556910103-1c02745aae4d');
    case 'lab':         return u('1581094794329-c8112a89af12');
    case 'art':         return u('1513475382585-d06e58bcb0e0');
    case 'clothing':    return u('1521572163474-6864f9cf17ab');
    default:            return u('1607082348824-0a96f2a4b9da');
  }
}

/* Cover photos per event type — verified Unsplash IDs */
export const EVENT_COVERS: Record<string, string> = {
  swap:      u('1591085686350-798c0f9faa7f', 1200),  // marketplace / clothing rack
  repair:    u('1530124566582-a618bc2615dc', 1200),  // tools laid out
  cleanup:   u('1532996122724-e3c354a0b15b', 1200),  // outdoor cleanup
  workshop:  u('1556761175-5973dc0f32e7', 1200),     // workshop talk
  drive:     u('1607619056574-7b8d3ee536b2', 1200),  // boxes / collection
  challenge: u('1517649763962-0c623066013b', 1200),  // group activity
};

/* Specific event id → cover override */
export const EVENT_PHOTOS: Record<string, string> = {
  e1: u('1591085686350-798c0f9faa7f', 1200),
  e2: u('1530124566582-a618bc2615dc', 1200),
  e3: u('1532996122724-e3c354a0b15b', 1200),
  e4: u('1556761175-5973dc0f32e7', 1200),
  e5: u('1517649763962-0c623066013b', 1200),
  e6: u('1607619056574-7b8d3ee536b2', 1200),
};

/* Multi-photo sets per event — max 3 */
export const EVENT_PHOTO_SETS: Record<string, string[]> = {
  e1: [
    u('1591085686350-798c0f9faa7f', 1200),
    u('1567538096630-e0c55bd6374c', 1200),
    u('1604754742629-3e5728249d73', 1200),
  ],
  e3: [
    u('1532996122724-e3c354a0b15b', 1200),
    u('1542601906990-b4d3fb778b09', 1200),
  ],
  e4: [
    u('1556761175-5973dc0f32e7', 1200),
    u('1531971589569-0d9370cbe1e5', 1200),
  ],
  e6: [
    u('1607619056574-7b8d3ee536b2', 1200),
    u('1605600659908-0ef719419d41', 1200),
    u('1583847268964-b28dc8f51f92', 1200),
  ],
};

export function getEventPhoto(id: string, type?: string): string {
  return EVENT_PHOTO_SETS[id]?.[0] ?? EVENT_PHOTOS[id] ?? EVENT_COVERS[type ?? ''] ?? EVENT_COVERS.workshop;
}

export function getEventPhotos(id: string, type?: string): string[] {
  if (EVENT_PHOTO_SETS[id]) return EVENT_PHOTO_SETS[id];
  if (EVENT_PHOTOS[id])     return [EVENT_PHOTOS[id]];
  return [EVENT_COVERS[type ?? ''] ?? EVENT_COVERS.workshop];
}

/* Stable avatar URLs (DiceBear) — deterministic from a seed */
export function getAvatar(seed: string, size = 96): string {
  return `https://api.dicebear.com/9.x/notionists-neutral/png?seed=${encodeURIComponent(seed)}&size=${size}&backgroundColor=eaedf1,d1d4f9,c0aede,b6e3f4,ffd5dc&radius=50`;
}
