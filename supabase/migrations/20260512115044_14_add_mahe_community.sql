-- Migration 20260512115044 · 14_add_mahe_community
-- Exported from the live project's applied-migration history.

insert into communities (slug, name, type, location, description, active_since, is_public)
values
  ('mahe-manipal', 'MAHE Manipal', 'campus', 'Manipal, India',
   'Manipal Academy of Higher Education — students, faculty and staff.',
   current_date, true)
on conflict (slug) do update
  set name = excluded.name,
      description = excluded.description,
      location = excluded.location,
      is_public = true;
