'use client';

/*
 * Wecycle analytics — one tiny module that all components push events through.
 *
 *   Why a wrapper at all? Three reasons:
 *     1. Typed event names → grep-able, refactor-safe, no string typos
 *        polluting GA4 (which would show up as separate funnels forever).
 *     2. Single SSR / not-yet-loaded guard, so component code doesn't have
 *        to remember `if (typeof window !== 'undefined')` every time.
 *     3. We fan out to multiple destinations from one call: the same event
 *        reaches GA4 (via gtag), GTM (via dataLayer.push), and Microsoft
 *        Clarity custom tags (via clarity('set', …)). Tomorrow's pixel
 *        plumbing slots in here too, not in 40 components.
 *
 *   Event taxonomy — there are 4 named groups. ALL events are snake_case
 *   (GA4 convention) and the param keys are also snake_case for parity
 *   with GA4 recommended_events spec.
 *
 *     • Acquisition / activation  — signup funnel, onboarding
 *     • Supply side               — posting, editing, deleting
 *     • Demand side               — browse, search, save, contact
 *     • Navigation / settings     — screen changes, settings toggles
 *
 *   When in doubt: add an event, add a param. GA4 keeps unused dimensions
 *   for 14 months; the cost of NOT having a data point is way higher than
 *   the cost of a stray one.
 */

/* ──────────────────────────────────────────────────────────────
   GLOBAL SHIMS
   ────────────────────────────────────────────────────────────── */

type GtagFn = (...args: unknown[]) => void;
type ClarityFn = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
    gtag?: GtagFn;
    clarity?: ClarityFn;
  }
}

/** True only in the browser AND after the page has rendered enough that
 *  window.gtag (or window.dataLayer) is defined. We don't *block* on that
 *  — events queue into dataLayer regardless because GTM creates it on
 *  load — but we use this for the gtag direct path. */
const isClient = () => typeof window !== 'undefined';

/* ──────────────────────────────────────────────────────────────
   EVENT NAME REGISTRY
   Centralising every event name we emit. Adding a new event = add a key
   here; everything else type-checks. If you find yourself adding a new
   event from a component, add it here first.
   ────────────────────────────────────────────────────────────── */

export const EVT = {
  /* ── Acquisition / activation ─── */
  app_open:                 'app_open',
  screen_view:              'screen_view',
  onboarding_started:       'onboarding_started',
  onboarding_step_viewed:   'onboarding_step_viewed',
  onboarding_completed:     'onboarding_completed',
  onboarding_skipped:       'onboarding_skipped',

  sign_up_started:          'sign_up_started',
  sign_up_email_submitted:  'sign_up_email_submitted',
  sign_up_otp_sent:         'sign_up_otp_sent',
  password_set:             'password_set',
  password_reset_requested: 'password_reset_requested',
  /** GA4 reserved event — fires once per signed-in user, ever. */
  sign_up:                  'sign_up',
  /** GA4 reserved event — fires every successful OTP verify. */
  login:                    'login',
  sign_in_failed:           'sign_in_failed',
  sign_out:                 'sign_out',

  /* ── Supply side (posting) ─── */
  post_picker_opened:       'post_picker_opened',
  post_kind_selected:       'post_kind_selected',
  post_form_started:        'post_form_started',
  post_form_submitted:      'post_form_submitted',
  post_form_failed:         'post_form_failed',
  post_edit_started:        'post_edit_started',
  post_edit_saved:          'post_edit_saved',
  post_deleted:             'post_deleted',
  post_marked_complete:     'post_marked_complete',
  post_reposted:            'post_reposted',
  media_upload_failed:      'media_upload_failed',

  /* ── Demand side (discovery + engagement) ─── */
  feed_tab_changed:         'feed_tab_changed',
  category_filter_changed:  'category_filter_changed',
  search_submitted:         'search_submitted',
  user_search_submitted:    'user_search_submitted',
  saved_search_added:       'saved_search_added',
  saved_search_matched:     'saved_search_matched',
  marketing_banner_tapped:  'marketing_banner_tapped',
  listing_opened:           'listing_opened',
  event_opened:             'event_opened',
  lostfound_opened:         'lostfound_opened',
  user_card_opened:         'user_card_opened',

  /* ── Conversions (the events you'll optimise for) ─── */
  contact_clicked:          'contact_clicked',
  save_toggled:             'save_toggled',
  share_clicked:            'share_clicked',
  comment_posted:           'comment_posted',
  rsvp_toggled:             'rsvp_toggled',

  /* ── Event registration forms + organizer insights ─── */
  event_form_saved:         'event_form_saved',
  event_form_removed:       'event_form_removed',
  registration_opened:      'registration_opened',
  registration_submitted:   'registration_submitted',
  registration_withdrawn:   'registration_withdrawn',
  insights_opened:          'insights_opened',
  insights_tab_changed:     'insights_tab_changed',
  insights_exported:        'insights_exported',

  /* ── Profile + settings ─── */
  storefront_opened:        'storefront_opened',
  account_edited:           'account_edited',
  settings_changed:         'settings_changed',

  /* ── Navigation ─── */
  nav_switched:             'nav_switched',
  drawer_opened:            'drawer_opened',
  drawer_item_tapped:       'drawer_item_tapped',
} as const;

export type EventName = typeof EVT[keyof typeof EVT];

/* ──────────────────────────────────────────────────────────────
   LOW-LEVEL DISPATCH
   ────────────────────────────────────────────────────────────── */

/** Pushes a single event to every destination we ship with.
 *
 *  - gtag (GA4):    direct call, fastest delivery to GA4 Realtime.
 *  - dataLayer:     also captures for GTM-side tag firing.
 *  - clarity:       tagged on the current Clarity session for filtering. */
export function track(event: EventName, params: Record<string, unknown> = {}): void {
  if (!isClient()) return;
  try {
    /* GA4 direct */
    if (typeof window.gtag === 'function') {
      window.gtag('event', event, params);
    }
    /* GTM mirror — also useful for users who route everything through GTM */
    if (Array.isArray(window.dataLayer)) {
      window.dataLayer.push({ event, ...params });
    }
    /* Clarity — `set` adds a custom tag visible on the session replay sidebar.
       We only pass *primitive*-typed params (no nested objects) so the tag
       label renders cleanly. Stringify the rest so debugging stays possible. */
    if (typeof window.clarity === 'function') {
      const flatVal = Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(' | ') || '1';
      window.clarity('set', event, flatVal);
    }
  } catch {
    /* Analytics must never crash the app — if any of the destinations
       blow up (extension blocking gtag, CSP rejecting Clarity, etc.) we
       silently swallow so user-facing logic is unaffected. */
  }
}

/* ──────────────────────────────────────────────────────────────
   IDENTITY
   Stitches sessions across devices once a user signs in. We forward
   the SAME id to GA4, GTM, and Clarity so a single user shows up as
   one identity in all three dashboards.
   ────────────────────────────────────────────────────────────── */

export interface IdentifyArgs {
  userId: string;
  displayName?: string;
  email?: string;
  /* free-form tags Clarity can filter on. */
  isAdmin?: boolean;
  isDemo?: boolean;
}

export function identify(args: IdentifyArgs): void {
  if (!isClient() || !args.userId) return;
  try {
    /* GA4 — sets the user_id on every subsequent event in this session
       and pins user_properties for cross-device joins. */
    if (typeof window.gtag === 'function') {
      window.gtag('set', { user_id: args.userId });
      window.gtag('set', 'user_properties', {
        is_admin: args.isAdmin ? 'true' : 'false',
        is_demo: args.isDemo ? 'true' : 'false',
        /* DON'T put email here — GA4 treats email as PII and may reject
           the property. Use Clarity's identify for that channel. */
      });
    }
    /* GTM dataLayer */
    if (Array.isArray(window.dataLayer)) {
      window.dataLayer.push({
        event: 'identify',
        user_id: args.userId,
        is_admin: args.isAdmin ?? false,
        is_demo: args.isDemo ?? false,
      });
    }
    /* Clarity — its `identify` signature accepts custom-id, session-id,
       page-id, friendly-name. We pass the userId as both custom-id and
       friendly-name so the dashboard surfaces a readable label. */
    if (typeof window.clarity === 'function') {
      window.clarity(
        'identify',
        args.userId,
        undefined,
        undefined,
        args.displayName ?? args.email ?? args.userId,
      );
    }
  } catch { /* swallow — see comment in track() */ }
}

/** Forget the current identity on sign-out. GA4 + Clarity each have their
 *  own "reset" semantics; we just unset what we can. */
export function resetIdentity(): void {
  if (!isClient()) return;
  try {
    if (typeof window.gtag === 'function') {
      window.gtag('set', { user_id: undefined });
    }
    /* Clarity doesn't expose a documented "logout" — the session itself
       cycles when the cookie expires. Best we can do is push a final
       tag noting the sign-out so dashboards can filter logged-out replays. */
    if (typeof window.clarity === 'function') {
      window.clarity('set', 'signed_in', 'false');
    }
  } catch { /* swallow */ }
}

/* ──────────────────────────────────────────────────────────────
   CONVENIENCE HELPERS
   Common patterns — saves callers from passing 5 params every time.
   ────────────────────────────────────────────────────────────── */

/** Fire when the active screen changes (BottomNav switch, sub-screen push).
 *  GA4 will treat this as both a screen_view AND increment session-level
 *  page metrics. */
export function trackScreenView(screen: string, extra: Record<string, unknown> = {}): void {
  track(EVT.screen_view, {
    screen_name: screen,
    screen_class: screen,
    ...extra,
  });
}

/** Fire when a user opens a post-detail surface (item, event, or L&F).
 *  Centralised so we never forget to also stamp the post kind. */
export function trackPostOpened(
  kind: 'item' | 'event' | 'lostfound',
  postId: string,
  extra: Record<string, unknown> = {},
): void {
  const event = kind === 'item' ? EVT.listing_opened
              : kind === 'event' ? EVT.event_opened
              :                    EVT.lostfound_opened;
  track(event, { post_id: postId, post_kind: kind, ...extra });
}

/** Fire when a viewer taps Email / WhatsApp. THE single most important
 *  conversion event in Wecycle today — it's the closest signal we have
 *  that a real connection happened. */
export function trackContactClicked(
  channel: 'email' | 'whatsapp',
  postKind: 'item' | 'event' | 'lostfound' | 'request',
  postId: string,
  extra: Record<string, unknown> = {},
): void {
  track(EVT.contact_clicked, {
    contact_channel: channel,
    post_kind: postKind,
    post_id: postId,
    ...extra,
  });
}
