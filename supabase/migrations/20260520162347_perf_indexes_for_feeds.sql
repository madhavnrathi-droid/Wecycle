-- Migration 20260520162347 · perf_indexes_for_feeds
-- Exported from the live project's applied-migration history.
-- Speed up the hot read paths. Each index matches a real query the app runs.

-- Feed: active listings newest-first (optionally filtered by category)
CREATE INDEX IF NOT EXISTS idx_listings_active_posted
  ON public.listings (status, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_listings_community_active_posted
  ON public.listings (community_id, status, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_listings_category_active
  ON public.listings (category_id, status, posted_at DESC);

-- Inventory + storefront: my listings newest-first
CREATE INDEX IF NOT EXISTS idx_listings_user_posted
  ON public.listings (user_id, posted_at DESC);

-- Requests: open feed + my requests
CREATE INDEX IF NOT EXISTS idx_requests_open_posted
  ON public.requests (status, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_user_posted
  ON public.requests (user_id, posted_at DESC);

-- Events: published, soonest first + by organizer
CREATE INDEX IF NOT EXISTS idx_events_status_starts
  ON public.events (status, starts_at);
CREATE INDEX IF NOT EXISTS idx_events_organizer_starts
  ON public.events (organizer_id, starts_at);

-- Lost & Found: open reports newest-first
CREATE INDEX IF NOT EXISTS idx_lf_status_posted
  ON public.lost_found_reports (status, posted_at DESC);

-- Comments lookups by post (entity)
CREATE INDEX IF NOT EXISTS idx_comments_entity
  ON public.comments (entity_type, entity_id, created_at);

-- Saves lookups for a user (toggle + my-saved)
CREATE INDEX IF NOT EXISTS idx_saves_user
  ON public.saves (user_id, saved_at DESC);
