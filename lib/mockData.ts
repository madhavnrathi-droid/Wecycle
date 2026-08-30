import { CATEGORIES as CATEGORY_LIST, ALL_CATEGORY } from './categories';
/* ═══════════════════════════════════════════════
   WECYCLE — Rich Mock Data
   Wecycle — by students, for students
   ═══════════════════════════════════════════════ */

export type CommunityMode = 'campus' | 'apartment' | 'office' | 'neighborhood';

export interface Community {
  id: string;
  name: string;
  type: CommunityMode;
  location: string;
  memberCount: number;
  itemsCirculated: number;
  co2Saved: number; // kg
  activeSince: string;
}

export interface User {
  /** Poster's college code, when known. Drives the "from your college" rail. */
  college?: string;
  id: string;
  name: string;
  initials: string;
  color: string; // avatar bg color
  role: string;
  community: string;
  joinedDaysAgo: number;
  itemsShared: number;
  itemsReceived: number;
  impactScore: number;
  badges: string[];
  isOnline: boolean;
  /* Contact channels — drives the "Request to borrow / I'll take it / Contact"
     buttons on a user's posts. We always have an email on file (it's how they
     signed up); phone is optional and enables WhatsApp. The booleans below
     mirror what the user picked in Settings → Notifications → channels. */
  email?: string;
  phone?: string;           /* E.164 ideally, but we accept any string */
  contact?: {
    email: boolean;          /* opt-in to receive item-related email */
    whatsapp: boolean;       /* opt-in to receive WhatsApp messages (requires phone) */
  };
}

export interface FeedItem {
  id: string;
  type: 'item_shared' | 'request' | 'event' | 'milestone' | 'repair' | 'lost_found' | 'announcement';
  user: User;
  timestamp: string;
  timeAgo: string;
  // Item shared / marketplace
  item?: {
    title: string;
    description: string;
    category: string;
    listingType: 'free' | 'swap' | 'borrow' | 'sell';
    price?: number;
    condition: 'like_new' | 'good' | 'fair';
    photoColor: string; // placeholder color
    photoIcon: string; // emoji
    location: string;
    saved: boolean;
    responses: number;
  };
  // Request
  request?: {
    title: string;
    description: string;
    urgency: 'normal' | 'urgent';
    offers: number;
  };
  // Event
  event?: {
    title: string;
    /* A value of the event_type enum. Deliberately `string` rather than a union:
     the vocabulary is 16 entries and grows, lib/eventTypes.ts is the one place
     that knows them, and a union duplicated here is a second place to forget. */
  eventType: string;
    date: string;
    time: string;
    location: string;
    attendees: number;
    maxAttendees?: number;
    colorAccent: string;
  };
  // Milestone
  milestone?: {
    title: string;
    metric: string;
    value: string;
    description: string;
  };
  // Repair
  repair?: {
    title: string;
    itemType: string;
    status: 'open' | 'in_progress' | 'fixed';
    beforeColor: string;
    afterColor?: string;
  };
  // Lost & Found
  lostFound?: {
    title: string;
    status: 'lost' | 'found';
    lastSeen: string;
    photoColor: string;
    photoIcon: string;
  };
}

export interface MarketplaceItem {
  id: string;
  title: string;
  description: string;
  category: string;
  /** DB category id (UUID). Optional because mock fixtures only have labels;
   *  used by the related-items shelf to find listings in the same category. */
  categoryId?: string;
  listingType: 'free' | 'swap' | 'borrow' | 'sell';
  price?: number;
  /** Rent only: refundable security deposit, in rupees. */
  deposit?: number;
  /** Swap only: what the poster wants in exchange. */
  swapFor?: string;
  condition: 'like_new' | 'good' | 'fair';
  photoColor: string;
  photoIcon: string;
  location: string;
  user: User;
  saved: boolean;
  responses: number;
  postedDaysAgo: number;
  /** Raw ISO posted_at, when the row came from the database.
   *
   *  postedDaysAgo cannot express the first day — everything posted in the last
   *  24 hours is 0 — and the first day is exactly where a new listing's
   *  discovery boost lives. Optional because mock fixtures carry only the day
   *  count; the ranker falls back to it. */
  postedAt?: string;
  tags: string[];
  /* Real media from Supabase (absent on mock items, which fall back to the
     hardcoded Unsplash sets keyed by id in lib/photos.ts). */
  photoUrls?: string[];
  videoUrls?: string[];
  /* Optional outbound link, already normalised to http/https. `linkOnPhoto`
     makes the photo itself follow it — see components/PostLink.tsx. */
  linkUrl?: string;
  linkOnPhoto?: boolean;
  /* Real metric counts from the DB (absent on mock items → deterministic
     pseudo-random fallback via lib/metrics.ts). */
  viewCount?: number;
  saveCount?: number;
  /* Classification of the post. 'item' (default/undefined) = a physical thing
     someone shares/sells. 'opportunity' = a *service* someone offers (a skill,
     gig, tutoring, repair, help) — a first-class post type that sits alongside
     Requests / Shared / Events. Opportunities reuse the whole listing subsystem
     (same detail screen, comments, saves, edit/delete) — they're just listings
     rows carrying kind='opportunity', so condition is irrelevant and pricing
     reads as a rate rather than a sale price. */
  kind?: 'item' | 'opportunity';
  /* Compensation for an opportunity (kind='opportunity'): 'volunteer' (unpaid,
     cause-oriented), 'free' (free help), or 'paid'. Absent for items. */
  comp?: 'volunteer' | 'free' | 'paid';
  /* Direction of an opportunity: 'hiring' (I need someone) vs 'offering'
     (I'll do it). Absent = unknown/legacy; the UI stays neutral. */
  oppRole?: 'offering' | 'hiring';
  /* Optional price band for a PAID opportunity when no exact rate is given. */
  priceBand?: 'under_200' | '200_500' | '500_1000' | 'over_1000';
  /* What a paid opportunity's rate is charged against — ₹300 an hour vs ₹300
     a month. Always optional: NULL/absent means the poster didn't say, which
     is a legitimate answer and never blocks posting. */
  ratePeriod?: 'hour' | 'session' | 'day' | 'week' | 'month' | 'year' | 'project';
  /* Upper end of a rate range; `price` is the lower end. Either end alone is
     valid ("₹300", "Up to ₹500"), as is neither ("Rate on ask"). */
  priceMax?: number;
  /* True when this card is a community *request* (someone wanting something)
     rather than a listing (someone offering). Drives the "Wanted" chip +
     "Respond / I can help" action instead of a price + listing-type verb. */
  isRequest?: boolean;
  urgent?: boolean;
  /* Optional "need by" date string for requests. */
  needBy?: string;
  /* Terminal state: a sell/free/borrow/swap listing that's been completed
     (sold / given away / returned / swapped) or a request that's been
     fulfilled. We keep these in the feed — dimmed with a status ribbon — so
     it reads as an active, trustworthy community rather than one where posts
     silently vanish. */
  isClosed?: boolean;
}

/** Past-tense ribbon label for a closed listing/request, by type. */
export function closedLabelFor(item: Pick<MarketplaceItem, 'isRequest' | 'listingType' | 'kind' | 'comp'>): string {
  if (item.isRequest) return 'Fulfilled';
  /* An opportunity (service) isn't "sold" or "claimed" — a volunteering call
     gets "Filled", any other service "Completed". */
  if (item.kind === 'opportunity') return item.comp === 'volunteer' ? 'Filled' : 'Completed';
  switch (item.listingType) {
    case 'sell':   return 'Sold';
    case 'free':   return 'Claimed';
    case 'borrow': return 'Returned';
    case 'swap':   return 'Swapped';
    default:       return 'Closed';
  }
}

export interface CommunityEvent {
  id: string;
  title: string;
  description: string;
  eventType: 'swap' | 'repair' | 'cleanup' | 'workshop' | 'drive' | 'challenge';
  /** Human-formatted for display, e.g. "Sat, Aug 15, 2026". Never parse these
   *  back — use `startsAt`. Re-parsing the formatted strings is what silently
   *  blanked the organizer's edit form and rescheduled events to 1970. */
  date: string;
  time: string;
  /** Raw ISO timestamp from the DB, when this event came from Supabase.
   *  Absent on mock/demo fixtures. The edit form seeds its date + time inputs
   *  from this, so it round-trips exactly instead of via `toLocaleString`. */
  startsAt?: string;
  /** Raw ISO end timestamp, when the organiser gave one. The column existed
   *  from the start but nothing read or wrote it until the schedule was
   *  rebuilt, so every event before that has none. */
  endsAt?: string | null;
  /** No specific clock time — rendered as "All day" rather than as midnight. */
  allDay?: boolean;
  /** Optional: an event may have no fixed venue (online, campus-wide, or a
   *  room not booked yet). Empty string when unset, so display sites can stay
   *  falsy-checked rather than null-checked. */
  location: string;
  attendees: number;
  maxAttendees?: number;
  colorAccent: string;
  organizer: User;
  tags: string[];
  rsvpd: boolean;
  /* True when the organizer attached a registration form — RSVPing routes
     through the form-fill screen before confirming. */
  hasForm?: boolean;
  /* Real metric counts from the DB (absent on mock events → metric fallbacks). */
  viewCount?: number;
  saveCount?: number;
}

export interface LostItem {
  id: string;
  title: string;
  description: string;
  /* Lowercased category id (e.g. 'electronics', 'sports', 'other') so the
   * home-feed category filter can place a lost/found post correctly. Optional
   * because legacy reports + some demo rows may not carry one. */
  category?: string;
  status: 'lost' | 'found' | 'claimed';
  lastSeen: string;
  photoColor: string;
  photoIcon: string;
  user: User;
  timeAgo: string;
  reward?: string;
  verified: boolean;
  /* Real uploaded photos (absent on mock items). */
  photoUrls?: string[];
}

export interface InventoryItem {
  id: string;
  title: string;
  category: string;
  photoIcon: string;
  photoColor: string;
  owner: string; // department/room
  status: 'available' | 'borrowed' | 'maintenance';
  borrowedBy?: string;
  dueDate?: string;
  totalBorrows: number;
  condition: 'like_new' | 'good' | 'fair';
}

export interface ImpactMetric {
  label: string;
  value: number;
  unit: string;
  change: number; // % change
  icon: string;
}

/* ─── COMMUNITIES ──────────────────────────────── */

export const COMMUNITIES: Community[] = [
  {
    id: 'bits-goa',
    name: 'Manipal Academy of Higher Education',
    type: 'campus',
    location: 'Goa, India',
    memberCount: 1847,
    itemsCirculated: 3240,
    co2Saved: 8420,
    activeSince: '2023',
  },
  {
    id: 'prestige-lake',
    name: 'Prestige Lake Ridge',
    type: 'apartment',
    location: 'Bengaluru, India',
    memberCount: 412,
    itemsCirculated: 876,
    co2Saved: 1820,
    activeSince: '2024',
  },
  {
    id: 'dlf-cyber',
    name: 'DLF Cyber City',
    type: 'office',
    location: 'Gurugram, India',
    memberCount: 2340,
    itemsCirculated: 1560,
    co2Saved: 4200,
    activeSince: '2024',
  },
];

/* ─── USERS ────────────────────────────────────── */

export const USERS: User[] = [
  {
    id: 'u1', name: 'Ananya Sharma', initials: 'AS', color: '#6C63FF',
    role: 'Design Student', community: 'MAHE', joinedDaysAgo: 142,
    itemsShared: 23, itemsReceived: 18, impactScore: 847,
    badges: ['Pioneer', 'Top Sharer', 'Green Star'], isOnline: true,
    email: 'ananya.sharma@learner.manipal.edu', phone: '+919812340001',
    contact: { email: true, whatsapp: true },
  },
  {
    id: 'u2', name: 'Rahul Mehta', initials: 'RM', color: '#FF6B80',
    role: 'CS Senior', community: 'MAHE', joinedDaysAgo: 89,
    itemsShared: 14, itemsReceived: 11, impactScore: 521,
    badges: ['Repair Hero', 'Connector'], isOnline: true,
    email: 'rahul.mehta@learner.manipal.edu', phone: '+919812340002',
    contact: { email: true, whatsapp: true },
  },
  {
    id: 'u3', name: 'Priya Nair', initials: 'PN', color: '#3DD6F5',
    role: 'EEE Junior', community: 'MAHE', joinedDaysAgo: 203,
    itemsShared: 31, itemsReceived: 27, impactScore: 1124,
    badges: ['Pioneer', 'Impact Leader', 'Community Hero', 'Top Sharer'], isOnline: false,
    email: 'priya.nair@learner.manipal.edu',
    /* Priya only accepts email — privacy preference */
    contact: { email: true, whatsapp: false },
  },
  {
    id: 'u4', name: 'Karan Singh', initials: 'KS', color: '#C8FF4D',
    role: 'Mech Engineer', community: 'MAHE', joinedDaysAgo: 67,
    itemsShared: 8, itemsReceived: 12, impactScore: 342,
    badges: ['Fixer'], isOnline: true,
    email: 'karan.singh@learner.manipal.edu', phone: '+919812340004',
    contact: { email: true, whatsapp: true },
  },
  {
    id: 'u5', name: 'Meera Iyer', initials: 'MI', color: '#FF9A40',
    role: 'BioTech Research', community: 'MAHE', joinedDaysAgo: 178,
    itemsShared: 19, itemsReceived: 15, impactScore: 712,
    badges: ['Lab Connector', 'Green Star'], isOnline: false,
    email: 'meera.iyer@learner.manipal.edu', phone: '+919812340005',
    /* Meera prefers WhatsApp only */
    contact: { email: false, whatsapp: true },
  },
  {
    id: 'u6', name: 'Aditya Kumar', initials: 'AK', color: '#A855F7',
    role: 'Physics PhD', community: 'MAHE', joinedDaysAgo: 310,
    itemsShared: 42, itemsReceived: 38, impactScore: 1876,
    badges: ['Pioneer', 'Top Sharer', 'Community Hero', 'Impact Leader', 'Fixer'], isOnline: true,
    email: 'aditya.kumar@learner.manipal.edu', phone: '+919812340006',
    contact: { email: true, whatsapp: true },
  },
  {
    id: 'u7', name: 'Sneha Patel', initials: 'SP', color: '#22C55E',
    role: 'Management Student', community: 'MAHE', joinedDaysAgo: 55,
    itemsShared: 6, itemsReceived: 9, impactScore: 218,
    badges: ['Newcomer'], isOnline: false,
    email: 'sneha.patel@learner.manipal.edu', phone: '+919812340007',
    contact: { email: true, whatsapp: true },
  },
  {
    id: 'u8', name: 'Dev Malhotra', initials: 'DM', color: '#F472B6',
    role: 'Architecture', community: 'MAHE', joinedDaysAgo: 125,
    itemsShared: 17, itemsReceived: 14, impactScore: 589,
    badges: ['Space Maker', 'Green Star'], isOnline: true,
    email: 'dev.malhotra@learner.manipal.edu', phone: '+919812340008',
    contact: { email: true, whatsapp: true },
  },
];

export const CURRENT_USER = USERS[0];

/* ─── FEED ─────────────────────────────────────── */

export const FEED_ITEMS: FeedItem[] = [
  {
    id: 'f1',
    type: 'milestone',
    user: USERS[2],
    timestamp: '2025-05-10T09:00:00',
    timeAgo: 'Just now',
    milestone: {
      title: '3,000 Items Circulated!',
      metric: 'Community Milestone',
      value: '3,240',
      description: 'MAHE has circulated 3,240 items this semester — preventing 8.4 tonnes of waste.',
    },
  },
  {
    id: 'f2',
    type: 'item_shared',
    user: USERS[1],
    timestamp: '2025-05-10T08:45:00',
    timeAgo: '15m ago',
    item: {
      title: 'Sony WH-1000XM4 Headphones',
      description: 'Lending for 2 weeks. Used only 3 times. Includes carry case and cables.',
      category: 'Electronics',
      listingType: 'borrow',
      condition: 'like_new',
      photoColor: '#1C1C1A',
      photoIcon: '🎧',
      location: 'Meera Bhawan',
      saved: false,
      responses: 4,
    },
  },
  {
    id: 'f3',
    type: 'event',
    user: USERS[5],
    timestamp: '2025-05-10T08:30:00',
    timeAgo: '30m ago',
    event: {
      title: 'Semester-End Swap Drive',
      eventType: 'swap',
      date: 'Sat, 17 May',
      time: '10:00 AM – 4:00 PM',
      location: 'SAC Lawn',
      attendees: 87,
      maxAttendees: 200,
      colorAccent: '#C8FF4D',
    },
  },
  {
    id: 'f4',
    type: 'request',
    user: USERS[6],
    timestamp: '2025-05-10T08:15:00',
    timeAgo: '45m ago',
    request: {
      title: 'Need a Scientific Calculator (Casio fx-991)',
      description: 'Finals next week. Will return in 10 days. Can swap for my Drawing Set.',
      urgency: 'urgent',
      offers: 2,
    },
  },
  {
    id: 'f5',
    type: 'item_shared',
    user: USERS[4],
    timestamp: '2025-05-10T07:50:00',
    timeAgo: '1h ago',
    item: {
      title: 'IKEA Fira Side Table',
      description: 'Moving out. Free to take. Very good condition. Self-pickup from D-203.',
      category: 'Furniture',
      listingType: 'free',
      condition: 'good',
      photoColor: '#8B7355',
      photoIcon: '🪑',
      location: 'Dhruva Bhawan',
      saved: true,
      responses: 11,
    },
  },
  {
    id: 'f6',
    type: 'repair',
    user: USERS[3],
    timestamp: '2025-05-10T07:30:00',
    timeAgo: '1.5h ago',
    repair: {
      title: 'Fixed Riya\'s broken fan — good as new!',
      itemType: 'Table Fan',
      status: 'fixed',
      beforeColor: '#4A3728',
      afterColor: '#1C3A30',
    },
  },
  {
    id: 'f7',
    type: 'item_shared',
    user: USERS[7],
    timestamp: '2025-05-10T07:00:00',
    timeAgo: '2h ago',
    item: {
      title: 'Architecture Books — 4th yr bundle',
      description: 'Frampton, Ching, Zumthor. All 6 books. Great condition. Free, just pass them on.',
      category: 'Books',
      listingType: 'free',
      condition: 'good',
      photoColor: '#2D4A3E',
      photoIcon: '📐',
      location: 'Malviya Bhawan',
      saved: false,
      responses: 7,
    },
  },
  {
    id: 'f8',
    type: 'lost_found',
    user: USERS[0],
    timestamp: '2025-05-10T06:45:00',
    timeAgo: '2.5h ago',
    lostFound: {
      title: 'Lost: MacBook Air M2 Charger',
      status: 'lost',
      lastSeen: 'F-101 Classroom, yesterday 6pm',
      photoColor: '#1A1A2E',
      photoIcon: '🔌',
    },
  },
  {
    id: 'f9',
    type: 'announcement',
    user: USERS[5],
    timestamp: '2025-05-10T06:00:00',
    timeAgo: '3h ago',
    milestone: {
      title: 'Repair Café — Every Thursday',
      metric: 'New Recurring Event',
      value: '6–9 PM',
      description: 'Bring your broken stuff. Karan and team will fix it for free. Location: Workshop C.',
    },
  },
  {
    id: 'f10',
    type: 'item_shared',
    user: USERS[2],
    timestamp: '2025-05-09T22:00:00',
    timeAgo: 'Yesterday',
    item: {
      title: 'Canon EOS 200D + 18-55mm Lens',
      description: 'Available for borrow over the weekend. For film projects or shoots. DM for booking.',
      category: 'Electronics',
      listingType: 'borrow',
      condition: 'like_new',
      photoColor: '#2A1810',
      photoIcon: '📷',
      location: 'Vyas Bhawan',
      saved: false,
      responses: 9,
    },
  },
];

/* ─── MARKETPLACE ──────────────────────────────── */

export const MARKETPLACE_ITEMS: MarketplaceItem[] = [
  {
    id: 'm1', title: 'Sony WH-1000XM4', description: 'Premium NC headphones, great for exams season. Lending 2 weeks.',
    category: 'Electronics', listingType: 'borrow', condition: 'like_new',
    photoColor: '#141414', photoIcon: '🎧', location: 'Meera Bhawan',
    user: USERS[1], saved: false, responses: 4, postedDaysAgo: 0, tags: ['audio', 'study'],
  },
  {
    id: 'm2', title: 'IKEA Fira Side Table', description: 'Clean white top, black legs. Moving out, free to take.',
    category: 'Furniture', listingType: 'free', condition: 'good',
    photoColor: '#F5F0E8', photoIcon: '🪑', location: 'Dhruva Bhawan',
    user: USERS[4], saved: true, responses: 11, postedDaysAgo: 0, tags: ['furniture', 'moving-out'],
  },
  {
    id: 'm3', title: 'Casio fx-991ES Plus', description: 'Scientific calculator. Swap for art supplies or drawing set.',
    category: 'Stationery', listingType: 'swap', condition: 'good',
    photoColor: '#1A3A2A', photoIcon: '🖩', location: 'Ashok Bhawan',
    user: USERS[3], saved: false, responses: 6, postedDaysAgo: 1, tags: ['calculator', 'finals'],
  },
  {
    id: 'm4', title: 'Architecture Books Bundle', description: 'Frampton, Ching, Zumthor — all 6. Free, just pass on.',
    category: 'Books', listingType: 'free', condition: 'good',
    photoColor: '#2D4A3E', photoIcon: '📐', location: 'Malviya Bhawan',
    user: USERS[7], saved: false, responses: 7, postedDaysAgo: 0, tags: ['architecture', 'textbook'],
  },
  {
    id: 'm5', title: 'Portable Monitor 15.6"', description: 'For sale. USB-C & HDMI. Selling before I graduate.',
    category: 'Electronics', listingType: 'sell', price: 4500, condition: 'like_new',
    photoColor: '#1A1A2E', photoIcon: '🖥️', location: 'Ram Bhawan',
    user: USERS[5], saved: false, responses: 3, postedDaysAgo: 2, tags: ['monitor', 'setup'],
    isClosed: true,
  },
  {
    id: 'm6', title: 'Yoga Mat + Blocks Set', description: 'Barely used. Perfect condition. Moving hostels.',
    category: 'Sports', listingType: 'free', condition: 'like_new',
    photoColor: '#3A1A4A', photoIcon: '🧘', location: 'Krishna Bhawan',
    user: USERS[2], saved: false, responses: 5, postedDaysAgo: 1, tags: ['fitness', 'wellness'],
  },
  {
    id: 'm7', title: 'Bosch Cordless Drill', description: 'Community tool. Borrow for your projects. 3-day max.',
    category: 'Tools', listingType: 'borrow', condition: 'good',
    photoColor: '#3A2A10', photoIcon: '🔧', location: 'Workshop A',
    user: USERS[5], saved: false, responses: 2, postedDaysAgo: 3, tags: ['tools', 'diy'],
  },
  {
    id: 'm8', title: 'Noise-Cancelling Desk Fan', description: 'Super quiet. ₹800. Negotiable.',
    category: 'Electronics', listingType: 'sell', price: 800, condition: 'good',
    photoColor: '#102A3A', photoIcon: '💨', location: 'Vyas Bhawan',
    user: USERS[0], saved: false, responses: 1, postedDaysAgo: 2, tags: ['cooling', 'study'],
  },
  {
    id: 'm9', title: 'Lab Coat (Size M)', description: 'Chem lab coat, worn 4 times, fully clean.',
    category: 'Lab', listingType: 'free', condition: 'like_new',
    photoColor: '#E8E8E8', photoIcon: '🥼', location: 'Lab Block',
    user: USERS[4], saved: false, responses: 3, postedDaysAgo: 0, tags: ['lab', 'science'],
  },
  {
    id: 'm10', title: 'Electric Kettle 1.5L', description: 'Double-walled, stays hot 4 hrs. Swap for anything useful.',
    category: 'Kitchen', listingType: 'swap', condition: 'good',
    photoColor: '#2A1010', photoIcon: '☕', location: 'Patel Bhawan',
    user: USERS[6], saved: false, responses: 4, postedDaysAgo: 1, tags: ['kitchen', 'hostel'],
  },
  {
    id: 'm11', title: 'Canon EOS 200D + Lens', description: 'Available weekends. Perfect for shoots. Book in advance.',
    category: 'Electronics', listingType: 'borrow', condition: 'like_new',
    photoColor: '#2A1810', photoIcon: '📷', location: 'Vyas Bhawan',
    user: USERS[2], saved: false, responses: 9, postedDaysAgo: 1, tags: ['camera', 'film'],
  },
  {
    id: 'm12', title: 'Sports Kit — Cricket', description: 'Pads, gloves, bat. Good condition. Swap or free.',
    category: 'Sports', listingType: 'free', condition: 'fair',
    photoColor: '#1A2A10', photoIcon: '🏏', location: 'Gandhi Bhawan',
    user: USERS[3], saved: false, responses: 6, postedDaysAgo: 4, tags: ['cricket', 'sports'],
  },
];

/* ── SERVICES & OPPORTUNITIES ───────────────────────────
   A peer post type to shared items — anything you offer to *do* for the
   community. Each is a listing row with kind='opportunity' spanning a
   compensation spectrum: comp='volunteer' (unpaid, cause), 'free' (free help),
   or 'paid' (an exact rate OR a price band). condition is irrelevant (hidden).
   These seed the demo-mode Services & Opportunities tab. */
export const OPPORTUNITIES: MarketplaceItem[] = [
  {
    id: 'o1', title: 'Physics & Maths Tutoring', description: 'JEE/NEET prep, 3 yrs experience. First session free. Evenings + weekends.',
    kind: 'opportunity', comp: 'paid', category: 'Services', listingType: 'sell', price: 300, condition: 'good',
    photoColor: '#10243A', photoIcon: '📚', location: 'Online or Meera Bhawan',
    user: USERS[1], saved: false, responses: 8, postedDaysAgo: 0, tags: ['tutoring', 'academics'],
  },
  {
    id: 'o2', title: 'Bicycle Repair & Servicing', description: 'Punctures, brakes, gears, full tune-ups. Bring it to Workshop A any evening.',
    kind: 'opportunity', comp: 'paid', priceBand: 'under_200', category: 'Services', listingType: 'sell', condition: 'good',
    photoColor: '#2A1A10', photoIcon: '🔧', location: 'Workshop A',
    user: USERS[5], saved: false, responses: 5, postedDaysAgo: 1, tags: ['repair', 'cycles'],
  },
  {
    id: 'o3', title: 'Guitar Lessons for Beginners', description: 'Learn your first 10 songs. Bring your own guitar. Happy to teach for free.',
    kind: 'opportunity', comp: 'free', category: 'Services', listingType: 'free', condition: 'good',
    photoColor: '#2D1A3A', photoIcon: '🎸', location: 'Krishna Bhawan common room',
    user: USERS[2], saved: false, responses: 12, postedDaysAgo: 0, tags: ['music', 'lessons'],
  },
  {
    id: 'o4', title: 'Beach Cleanup Volunteers Needed', description: 'Sunday 7am, Malpe beach. Gloves + bags provided. Come make a dent in the plastic — all welcome.',
    kind: 'opportunity', comp: 'volunteer', category: 'Services', listingType: 'free', condition: 'good',
    photoColor: '#0E3A2E', photoIcon: '🌱', location: 'Malpe Beach',
    user: USERS[7], saved: false, responses: 21, postedDaysAgo: 1, tags: ['volunteering', 'environment'],
  },
  {
    id: 'o5', title: 'Event Photography', description: 'Fests, farewells, shoots. Canon 200D + edits included. Book a weekend slot.',
    kind: 'opportunity', comp: 'paid', priceBand: 'over_1000', category: 'Services', listingType: 'sell', condition: 'good',
    photoColor: '#1A1810', photoIcon: '📷', location: 'Campus-wide',
    user: USERS[3], saved: false, responses: 6, postedDaysAgo: 3, tags: ['photography', 'events'],
  },
];

/* ─── EVENTS ────────────────────────────────────── */

export const EVENTS: CommunityEvent[] = [
  {
    id: 'e1',
    title: 'Semester-End Mega Swap Drive',
    description: 'The biggest circular event of the semester. Bring what you don\'t need, take what you do. No money, just exchange.',
    eventType: 'swap',
    date: 'Sat, 17 May 2025',
    time: '10:00 AM – 4:00 PM',
    location: 'SAC Lawn, MIT Manipal',
    attendees: 87,
    maxAttendees: 200,
    colorAccent: '#C8FF4D',
    organizer: USERS[5],
    tags: ['swap', 'semester-end', 'community'],
    rsvpd: true,
  },
  {
    id: 'e2',
    title: 'Repair Café — Week 3',
    description: 'Bring your broken gadgets, clothes, furniture. Volunteer fixers on hand. Free of charge.',
    eventType: 'repair',
    date: 'Thu, 15 May 2025',
    time: '6:00 PM – 9:00 PM',
    location: 'Workshop C, F-Wing',
    attendees: 24,
    colorAccent: '#A855F7',
    organizer: USERS[3],
    tags: ['repair', 'weekly', 'skills'],
    rsvpd: false,
    hasForm: true,   /* demo registration form — see lib/eventForms DEMO_FORMS */
  },
  {
    id: 'e3',
    title: 'Green Campus Cleanup Drive',
    description: 'Let\'s make the campus litter-free. Gloves and bags provided. Earn community points.',
    eventType: 'cleanup',
    date: 'Sun, 18 May 2025',
    time: '7:00 AM – 9:00 AM',
    location: 'Meets at Gate 2',
    attendees: 41,
    maxAttendees: 80,
    colorAccent: '#3DD6F5',
    organizer: USERS[0],
    tags: ['cleanup', 'environment', 'team'],
    rsvpd: false,
    hasForm: true,   /* demo form + seeded responses power the insights demo */
  },
  {
    id: 'e4',
    title: 'Zero-Waste Workshop',
    description: 'Learn composting, upcycling, and how to reduce your hostel waste footprint.',
    eventType: 'workshop',
    date: 'Fri, 16 May 2025',
    time: '3:00 PM – 5:00 PM',
    location: 'Room LTC-4, LHC',
    attendees: 18,
    maxAttendees: 40,
    colorAccent: '#FF9A40',
    organizer: USERS[4],
    tags: ['workshop', 'learning', 'zero-waste'],
    rsvpd: true,
  },
  {
    id: 'e5',
    title: '7-Day Circular Challenge',
    description: 'Go a week sharing instead of buying. Log your swaps and track your impact.',
    eventType: 'challenge',
    date: 'Mon, 12 – Sun, 18 May',
    time: 'All week',
    location: 'Campus-wide',
    attendees: 134,
    colorAccent: '#FF6B80',
    organizer: USERS[5],
    tags: ['challenge', 'circular', 'gamified'],
    rsvpd: true,
  },
  {
    id: 'e6',
    title: 'E-Waste Collection Drive',
    description: 'Old phones, chargers, laptops, cables. We\'ll responsibly recycle all of it.',
    eventType: 'drive',
    date: 'Wed, 21 May 2025',
    time: '2:00 PM – 6:00 PM',
    location: 'Main Gate Foyer',
    attendees: 56,
    colorAccent: '#3DD6F5',
    organizer: USERS[0],
    tags: ['e-waste', 'electronics', 'recycling'],
    rsvpd: false,
  },
];

/* IDs of events organized by the current viewer — drives the
   "Uploads" and "Activity" surfaces. */
export const MY_EVENT_IDS = ['e3', 'e6'];

/* ─── LOST & FOUND ─────────────────────────────── */

export const LOST_FOUND_ITEMS: LostItem[] = [
  {
    id: 'lf1',
    category: 'electronics',
    title: 'MacBook Air M2 Charger (USB-C, 30W)',
    description: 'White Apple charger, has a small scratch on the cable. Last seen in F-101 during afternoon lecture.',
    status: 'lost',
    lastSeen: 'F-101 Classroom, Thu 6pm',
    photoColor: '#1A1A2E',
    photoIcon: '🔌',
    user: USERS[0],
    timeAgo: '2.5h ago',
    reward: '',
    verified: false,
  },
  {
    id: 'lf2',
    category: 'other',
    title: 'Found: Blue Casio Watch',
    description: 'Found near the SAC exit. Has initials "P.S." on the back. Come claim it.',
    status: 'found',
    lastSeen: 'SAC Exit Area',
    photoColor: '#102A3A',
    photoIcon: '⌚',
    user: USERS[3],
    timeAgo: '4h ago',
    verified: true,
  },
  {
    id: 'lf3',
    category: 'electronics',
    title: 'Lost: Noise Buds (White TWS Earphones)',
    description: 'Lost at the gym. Left earbud has a tiny sticker. Reward: will swap for my bluetooth speaker.',
    status: 'lost',
    lastSeen: 'Gymnasium, yesterday evening',
    photoColor: '#ECECEC',
    photoIcon: '🎵',
    user: USERS[6],
    timeAgo: '18h ago',
    reward: 'Bluetooth speaker',
    verified: false,
  },
  {
    id: 'lf4',
    category: 'other',
    title: 'Found: Black Wallet (No cash inside)',
    description: 'Has student ID of Anil Sharma (3rd yr EEE). IDs and cards intact. Reach me ASAP.',
    status: 'found',
    lastSeen: 'Found in Library reading room',
    photoColor: '#1A1010',
    photoIcon: '👜',
    user: USERS[2],
    timeAgo: '1d ago',
    verified: true,
  },
  {
    id: 'lf5',
    category: 'lab',
    title: 'Lost: Engineering Drawing Kit',
    description: 'Staedtler box with all instruments. Blue case. Had my name written on it but faded.',
    status: 'lost',
    lastSeen: 'Drawing Hall, 3 days ago',
    photoColor: '#1A3A2A',
    photoIcon: '📐',
    user: USERS[7],
    timeAgo: '3d ago',
    verified: false,
  },
  {
    id: 'lf6',
    category: 'electronics',
    title: 'Found: Canon Lens Cap (52mm)',
    description: 'Found on the SAC stairs. If yours, tell me the lens it belongs to.',
    status: 'found',
    lastSeen: 'SAC Stairs',
    photoColor: '#2A1810',
    photoIcon: '📷',
    user: USERS[1],
    timeAgo: '5h ago',
    verified: false,
  },
];

/* ─── SHARED INVENTORY ─────────────────────────── */

export const INVENTORY_ITEMS: InventoryItem[] = [
  { id: 'i1', title: 'Canon EOS 200D DSLR', category: 'Camera', photoIcon: '📷', photoColor: '#2A1810', owner: 'MediaCell', status: 'available', totalBorrows: 34, condition: 'good' },
  { id: 'i2', title: 'Epson Projector HD', category: 'AV', photoIcon: '📽️', photoColor: '#1A1A2E', owner: 'SAC', status: 'borrowed', borrowedBy: 'Ananya S.', dueDate: 'May 12', totalBorrows: 89, condition: 'good' },
  { id: 'i3', title: 'Extension Cord 10m', category: 'Electrical', photoIcon: '🔌', photoColor: '#1A2A10', owner: 'Workshop A', status: 'available', totalBorrows: 112, condition: 'fair' },
  { id: 'i4', title: 'Bosch Drill Set', category: 'Tools', photoIcon: '🔧', photoColor: '#3A2A10', owner: 'Workshop A', status: 'available', totalBorrows: 28, condition: 'good' },
  { id: 'i5', title: 'Standing Whiteboard', category: 'Stationery', photoIcon: '📋', photoColor: '#ECECEC', owner: 'Department', status: 'borrowed', borrowedBy: 'Rahul M.', dueDate: 'May 11', totalBorrows: 56, condition: 'good' },
  { id: 'i6', title: 'DJI Mini Drone', category: 'Camera', photoIcon: '🚁', photoColor: '#141414', owner: 'MediaCell', status: 'maintenance', totalBorrows: 19, condition: 'fair' },
  { id: 'i7', title: 'Soldering Station', category: 'Tools', photoIcon: '⚙️', photoColor: '#2A1A10', owner: 'Electronics Lab', status: 'available', totalBorrows: 67, condition: 'good' },
  { id: 'i8', title: 'Guitar (Acoustic)', category: 'Music', photoIcon: '🎸', photoColor: '#3A2A10', owner: 'Music Room', status: 'available', totalBorrows: 43, condition: 'good' },
];

/* ─── IMPACT METRICS ────────────────────────────── */

export const IMPACT_METRICS: ImpactMetric[] = [
  { label: 'CO₂ Prevented', value: 8420, unit: 'kg', change: 18, icon: '🌿' },
  { label: 'Items Circulated', value: 3240, unit: 'items', change: 24, icon: '♻️' },
  { label: 'Money Saved', value: 486000, unit: '₹', change: 31, icon: '💰' },
  { label: 'Landfill Diverted', value: 1240, unit: 'kg', change: 15, icon: '🗑️' },
  { label: 'Repairs Completed', value: 284, unit: 'fixes', change: 42, icon: '🔧' },
  { label: 'Active Members', value: 1847, unit: 'members', change: 8, icon: '👥' },
];

export const PERSONAL_IMPACT = {
  co2Saved: 124,
  itemsCirculated: 41,
  moneySaved: 8200,
  repairsHelped: 3,
  rank: 12,
  totalMembers: 1847,
  percentile: 99,
};

/* ─── CATEGORIES ────────────────────────────────── */

/* Re-exported from lib/categories, which is the one taxonomy the chips, the
   storefront rails and every post form now share. Kept here so the many
   existing importers of CATEGORIES do not all have to change at once. */
export const CATEGORIES = [ALL_CATEGORY, ...CATEGORY_LIST];

export const LISTING_TYPES = [
  { id: 'all', label: 'All' },
  { id: 'free', label: 'Free' },
  { id: 'borrow', label: 'Borrow' },
  { id: 'swap', label: 'Swap' },
  { id: 'sell', label: 'Sell' },
];

/* ─── LEADERBOARD ───────────────────────────────── */

export const LEADERBOARD = USERS
  .sort((a, b) => b.impactScore - a.impactScore)
  .map((u, i) => ({ ...u, rank: i + 1 }));
