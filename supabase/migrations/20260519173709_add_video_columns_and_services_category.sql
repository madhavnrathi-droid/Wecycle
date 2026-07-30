-- Migration 20260519173709 · add_video_columns_and_services_category
-- Exported from the live project's applied-migration history.
-- Add video_urls to listings, events, lost_found_reports so multi-media posts can
-- carry the 5MB videos surfaced in the PhotoPicker. We default to '{}' so existing
-- writers don't break and to keep the column NOT NULL (matches photo_urls pattern).
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS video_urls text[] NOT NULL DEFAULT ARRAY[]::text[];

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS video_urls text[] NOT NULL DEFAULT ARRAY[]::text[];

ALTER TABLE public.lost_found_reports
  ADD COLUMN IF NOT EXISTS video_urls text[] NOT NULL DEFAULT ARRAY[]::text[];

-- Add the "Services" category (sort_order between sports and others)
INSERT INTO public.categories (id, label, icon, sort_order, is_active)
VALUES ('services', 'Services', '🤝', 110, true)
ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, icon = EXCLUDED.icon, sort_order = EXCLUDED.sort_order, is_active = true;

-- Extend profiles with contact prefs (email/WhatsApp) that the front-end already
-- expects. Both default true so users opt out, not in.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS contact_email_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS contact_whatsapp_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_online_status boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_dms boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_phone_on_profile boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hide_listings_from_search boolean NOT NULL DEFAULT false;

-- User-level notification preferences. Stored as a single JSONB so we can add
-- categories later without another migration. Defaults match the in-app defaults
-- in lib/settings.ts so a profile created today behaves identically to a fresh
-- localStorage device.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL DEFAULT jsonb_build_object(
    'channels', jsonb_build_object('inApp', true, 'sound', true, 'email', true, 'sms', false),
    'categories', jsonb_build_object(
      'messages', true, 'matches', true, 'events', true,
      'marketplace', true, 'lostFound', true, 'community', true, 'digest', true
    ),
    'emailFrequency', 'realtime',
    'quietHours', jsonb_build_object('enabled', false, 'from', '22:00', 'to', '07:00')
  );

-- App-level appearance + marketplace prefs.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'system' CHECK (theme IN ('light','dark','system')),
  ADD COLUMN IF NOT EXISTS larger_text boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hide_prices_on_feed boolean NOT NULL DEFAULT false;
