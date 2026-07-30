-- Migration 20260517132801 · 16_alerts_push_queue
-- Exported from the live project's applied-migration history.

-- ═══════════════════════════════════════════════════════
-- WECYCLE · 16 · alerts + push queue
-- ═══════════════════════════════════════════════════════

-- ── Enum extensions ──────────────────────────────────
alter type notification_type add value if not exists 'alert_match';
alter type notification_type add value if not exists 'alert_expired';
alter type feed_entity_type  add value if not exists 'alert';
