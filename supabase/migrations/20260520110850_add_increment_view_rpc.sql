-- Migration 20260520110850 · add_increment_view_rpc
-- Exported from the live project's applied-migration history.
-- Viewers can't UPDATE someone else's listing (RLS restricts UPDATE to the
-- owner), so view-count bumps go through a SECURITY DEFINER function that
-- runs with elevated rights. Safe because it only ever does +1 on view_count.
CREATE OR REPLACE FUNCTION public.rpc_increment_listing_view(_listing_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.listings
     SET view_count = view_count + 1
   WHERE id = _listing_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_increment_listing_view(uuid) TO anon, authenticated;
