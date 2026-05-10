/* ═══════════════════════════════════════════════
   WECYCLE — Rich Mock Data
   Community Operating System
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
    eventType: 'swap' | 'repair' | 'cleanup' | 'workshop' | 'drive' | 'challenge';
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
  listingType: 'free' | 'swap' | 'borrow' | 'sell';
  price?: number;
  condition: 'like_new' | 'good' | 'fair';
  photoColor: string;
  photoIcon: string;
  location: string;
  user: User;
  saved: boolean;
  responses: number;
  postedDaysAgo: number;
  tags: string[];
}

export interface CommunityEvent {
  id: string;
  title: string;
  description: string;
  eventType: 'swap' | 'repair' | 'cleanup' | 'workshop' | 'drive' | 'challenge';
  date: string;
  time: string;
  location: string;
  attendees: number;
  maxAttendees?: number;
  colorAccent: string;
  organizer: User;
  tags: string[];
  rsvpd: boolean;
}

export interface LostItem {
  id: string;
  title: string;
  description: string;
  status: 'lost' | 'found' | 'claimed';
  lastSeen: string;
  photoColor: string;
  photoIcon: string;
  user: User;
  timeAgo: string;
  reward?: string;
  verified: boolean;
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
    name: 'BITS Pilani Goa',
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
    role: 'Design Student', community: 'BITS Goa', joinedDaysAgo: 142,
    itemsShared: 23, itemsReceived: 18, impactScore: 847,
    badges: ['Pioneer', 'Top Sharer', 'Green Star'], isOnline: true,
  },
  {
    id: 'u2', name: 'Rahul Mehta', initials: 'RM', color: '#FF6B80',
    role: 'CS Senior', community: 'BITS Goa', joinedDaysAgo: 89,
    itemsShared: 14, itemsReceived: 11, impactScore: 521,
    badges: ['Repair Hero', 'Connector'], isOnline: true,
  },
  {
    id: 'u3', name: 'Priya Nair', initials: 'PN', color: '#3DD6F5',
    role: 'EEE Junior', community: 'BITS Goa', joinedDaysAgo: 203,
    itemsShared: 31, itemsReceived: 27, impactScore: 1124,
    badges: ['Pioneer', 'Impact Leader', 'Community Hero', 'Top Sharer'], isOnline: false,
  },
  {
    id: 'u4', name: 'Karan Singh', initials: 'KS', color: '#C8FF4D',
    role: 'Mech Engineer', community: 'BITS Goa', joinedDaysAgo: 67,
    itemsShared: 8, itemsReceived: 12, impactScore: 342,
    badges: ['Fixer'], isOnline: true,
  },
  {
    id: 'u5', name: 'Meera Iyer', initials: 'MI', color: '#FF9A40',
    role: 'BioTech Research', community: 'BITS Goa', joinedDaysAgo: 178,
    itemsShared: 19, itemsReceived: 15, impactScore: 712,
    badges: ['Lab Connector', 'Green Star'], isOnline: false,
  },
  {
    id: 'u6', name: 'Aditya Kumar', initials: 'AK', color: '#A855F7',
    role: 'Physics PhD', community: 'BITS Goa', joinedDaysAgo: 310,
    itemsShared: 42, itemsReceived: 38, impactScore: 1876,
    badges: ['Pioneer', 'Top Sharer', 'Community Hero', 'Impact Leader', 'Fixer'], isOnline: true,
  },
  {
    id: 'u7', name: 'Sneha Patel', initials: 'SP', color: '#22C55E',
    role: 'Management Student', community: 'BITS Goa', joinedDaysAgo: 55,
    itemsShared: 6, itemsReceived: 9, impactScore: 218,
    badges: ['Newcomer'], isOnline: false,
  },
  {
    id: 'u8', name: 'Dev Malhotra', initials: 'DM', color: '#F472B6',
    role: 'Architecture', community: 'BITS Goa', joinedDaysAgo: 125,
    itemsShared: 17, itemsReceived: 14, impactScore: 589,
    badges: ['Space Maker', 'Green Star'], isOnline: true,
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
      description: 'BITS Goa has circulated 3,240 items this semester — preventing 8.4 tonnes of waste.',
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

/* ─── EVENTS ────────────────────────────────────── */

export const EVENTS: CommunityEvent[] = [
  {
    id: 'e1',
    title: 'Semester-End Mega Swap Drive',
    description: 'The biggest circular event of the semester. Bring what you don\'t need, take what you do. No money, just exchange.',
    eventType: 'swap',
    date: 'Sat, 17 May 2025',
    time: '10:00 AM – 4:00 PM',
    location: 'SAC Lawn, BITS Goa',
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
    organizer: USERS[2],
    tags: ['cleanup', 'environment', 'team'],
    rsvpd: false,
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
    organizer: USERS[1],
    tags: ['e-waste', 'electronics', 'recycling'],
    rsvpd: false,
  },
];

/* ─── LOST & FOUND ─────────────────────────────── */

export const LOST_FOUND_ITEMS: LostItem[] = [
  {
    id: 'lf1',
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

export const CATEGORIES = [
  { id: 'all', label: 'All', icon: '⚡' },
  { id: 'electronics', label: 'Electronics', icon: '💻' },
  { id: 'furniture', label: 'Furniture', icon: '🪑' },
  { id: 'books', label: 'Books', icon: '📚' },
  { id: 'sports', label: 'Sports', icon: '⚽' },
  { id: 'lab', label: 'Lab', icon: '🧪' },
  { id: 'tools', label: 'Tools', icon: '🔧' },
  { id: 'kitchen', label: 'Kitchen', icon: '☕' },
  { id: 'clothing', label: 'Clothing', icon: '👕' },
];

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
