-- Migration 20260520050923 · add_media_to_requests_and_events
-- Exported from the live project's applied-migration history.
-- Requests can carry reference photos/videos (the PostRequestModal allows them).
ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS photo_urls text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS video_urls text[] NOT NULL DEFAULT ARRAY[]::text[];

-- Events already have video_urls + cover_url; add a photo_urls gallery (up to 3)
-- so SubmitEventModal's multi-photo picker round-trips. cover_url stays as the
-- first photo for backward-compatible cards.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS photo_urls text[] NOT NULL DEFAULT ARRAY[]::text[];
