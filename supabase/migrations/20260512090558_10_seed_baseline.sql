-- Migration 20260512090558 · 10_seed_baseline
-- Exported from the live project's applied-migration history.

-- ═══════════════════════════════════════════════════════
-- WECYCLE · 10 · seed baseline communities + categories
-- ═══════════════════════════════════════════════════════

insert into categories (id, label, icon, sort_order) values
  ('all',         'All',         '⚡', 0),
  ('electronics', 'Electronics', '💻', 10),
  ('furniture',   'Furniture',   '🪑', 20),
  ('books',       'Books',       '📚', 30),
  ('stationery',  'Stationery',  '✏️', 40),
  ('sports',      'Sports',      '⚽', 50),
  ('tools',       'Tools',       '🔧', 60),
  ('kitchen',     'Kitchen',     '🍳', 70),
  ('lab',         'Lab',         '🧪', 80),
  ('art',         'Art',         '🎨', 90),
  ('clothing',    'Clothing',    '👕', 100),
  ('other',       'Other',       '📦', 999)
on conflict (id) do update
  set label = excluded.label,
      icon = excluded.icon,
      sort_order = excluded.sort_order;

insert into communities (slug, name, type, location, description, active_since)
values
  ('bits-goa',  'BITS Pilani Goa', 'campus',  'Goa, India',         'Birla Institute of Technology — Goa campus', '2023-08-15'),
  ('iisc-bangalore', 'IISc Bangalore', 'campus', 'Bengaluru, India', 'Indian Institute of Science campus',         '2024-01-10'),
  ('cyber-hub-gurgaon', 'Cyber Hub', 'office', 'Gurugram, India',    'DLF Cyber Hub work community',                '2024-03-22')
on conflict (slug) do update
  set name = excluded.name,
      type = excluded.type,
      location = excluded.location,
      description = excluded.description;
