# Analytics — what ships in code, and what you must click

Written after auditing what GA4 was actually receiving. Two halves: the code is
done and deployed, the GA4 UI steps are yours because this session has no
Google Analytics or Tag Manager access.

---

## What was wrong

**The app sent one `page_view` per session, ever.** Every screen lives in a
single route, so after the initial load GA4 saw nothing — no matter how many
screens someone visited.

`lib/analytics.ts` had a `trackScreenView()` written for this, and
`app/layout.tsx` carried a comment saying it was used. **Nothing called it.** The
only reference to the function anywhere in the codebase was that comment.

It would not have worked regardless: it fired an event named `screen_view`,
which is the Firebase / app-stream name. A **web** stream counts `page_view`.

This matters for the bounce rate directly. GA4 treats a session as *engaged* if
it lasts 10s or more, **or** contains a key event, **or** contains 2+ page_views.
The third route was unreachable, and with no key events marked the second was
too — so every session was judged on the 10-second rule alone. Someone who opens
a shared listing, reads it and leaves satisfied was indistinguishable from a
bounce.

## What is now in code

- `trackScreenView()` sends a real **`page_view`** with a synthesised
  `page_path` per screen (`/feed`, `/events`, `/listing-detail`, …). Without the
  synthetic path every row in the Pages report would read `/`.
- `app/page.tsx` fires it whenever the visible surface changes, with the topmost
  surface winning — an open post outranks the tab behind it.
- gtag's automatic page_view is switched **off** (`send_page_view: false`) so the
  app owns all of them. Left on, the landing screen double-counts and a deep link
  reports `/` before the post that was actually opened.

Already firing and untouched: `listing_opened`, `event_opened`,
`lostfound_opened`, `contact_clicked`, `post_form_submitted`, `nav_switched`,
`rsvp_toggled`, `sign_up_*`.

Still defined but never fired (dead taxonomy, worth deleting or wiring):
`onboarding_started`, `onboarding_step_viewed`, `onboarding_completed`,
`onboarding_skipped`, `post_form_started`, `post_edit_started`,
`post_edit_saved`, `post_reposted`, `media_upload_failed`,
`saved_search_matched`.

---

## What you must do in the GA4 UI

### 1. Mark key events — do this first
**Admin → Events → mark as key event.** Nothing else here matters as much: a key
event makes its session *engaged*, which is the honest way the bounce rate moves.

| event | why |
| --- | --- |
| `contact_clicked` | the closest thing to a transaction — no money moves in-app |
| `post_form_submitted` | supply created |
| `sign_up_completed` | activation |

### 2. Register custom dimensions
**Admin → Custom definitions → Create custom dimension** (event-scoped). GA4
discards event parameters you have not registered, so until this is done the
parameters are being sent and thrown away.

| parameter | dimension name |
| --- | --- |
| `post_kind` | Post kind |
| `contact_channel` | Contact channel |
| `screen_name` | Screen |
| `listing_type` | Listing type |
| `college` | College |

### 3. Build the funnel
**Explore → Funnel exploration**, steps:
`page_view` → `listing_opened` → `contact_clicked`

That is the whole marketplace in one chart, and the drop-off between steps 2 and
3 is the number to optimise.

### 4. Fix the bounce-rate reading
Report on **Engagement rate**, not bounce rate, and segment by landing page.
Traffic arriving on `/s/<id>` share links is mostly single-purpose — a satisfied
read of one post — and should be judged separately from traffic landing on the
feed.

---

## Supply-side numbers (not in GA4)

GA4 cannot answer "what share of members post?" — that is a join, not a
pageview. The `public.founder_metrics` view holds those. Run in the Supabase SQL
editor:

```sql
select * from public.founder_metrics;
```

It is deliberately not granted to `anon` or `authenticated`; these are founder
numbers, and exposing them in the app would publish who has posted what.

## Reading these honestly in a deck

At the time of writing: 32 members, 14 listings, 6 people posting (18.8%), 549
listing views.

That is pre-launch scale, and a deck that leads with totals this size invites the
wrong question. The defensible story at this stage is **ratios and engagement**,
not volume — 2.3 listings per poster and 39 views per listing say the format
works; 32 members says it has not been distributed yet. Those are two different
claims and only the first is evidence. Wait for the numbers before writing the
slide that needs them.
