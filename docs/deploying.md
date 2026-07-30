# Deploying & operations

## Web (Vercel)

Production deploys are pushed from the repo root with the Vercel CLI:

```bash
vercel --prod --yes
```

Then confirm the deployment shows **● Ready**:

```bash
vercel inspect <deployment-url>
```

Environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`, `REMOVE_BG_API_KEY`) are configured in the Vercel project, not committed.

## Domain

`wecycle.page` is registered at Name.com; DNS points at Vercel:

| Record | Host | Value |
|---|---|---|
| `A` | `@` | `76.76.21.21` |
| `CNAME` | `www` | `cname.vercel-dns.com` |

`lib/siteUrl.ts` centralizes the canonical origin (`NEXT_PUBLIC_SITE_URL`, defaulting to `https://wecycle.page`) — used for OG metadata and share links.

After a domain change, also update **Supabase → Authentication → URL Configuration** (Site URL + redirect allow-list).

## Auth email (the part that pages you at 2am)

Confirmation codes and password resets are real emails, and deliverability is an operational concern:

- **Built-in Supabase sender** — works out of the box and demonstrably delivers to `learner.manipal.edu`, but it's a shared pool with a low rate limit (a burst of sign-ups will hit HTTP 429 "email rate limit exceeded"), and heavy bounces on the shared pool can get sending restricted. Never send test codes to invented addresses — a fake mailbox at a real domain bounces and counts against the project.
- **Custom SMTP** (Authentication → Emails → SMTP Settings) — raises the rate limit (configurable per hour) and isolates your sending reputation. Personal Gmail as SMTP authenticates fine (app password, 16 chars, **no spaces**, username = the exact same account) but is flagged by Supabase as a personal-mail provider and may deliver poorly to Microsoft-hosted campus domains. For launch volume, a transactional provider (e.g. Resend/Brevo) sending as `@wecycle.page` with SPF + DKIM is the durable answer.
- The auth log (Supabase → Logs → Auth) shows the *actual* SMTP error when a send fails — e.g. `535 BadCredentials` — and is the first place to look.

Client-side, everything that can be rejected before sending an email is (see [auth.md](auth.md)) — that's deliberate cost control, not just UX.

## Database changes

Schema changes go through migrations (Supabase dashboard → SQL, or `supabase db push`). The repo's [`supabase/migrations/`](../supabase/migrations/) is the complete applied history, exported from the live project — keep it current when adding migrations so a fresh environment can always be rebuilt.

After schema changes, regenerate types:

```bash
npx supabase gen types typescript --project-id <ref> > lib/database.types.ts
```

## Native releases

See [android.md](android.md). Remember native resource changes (styles, icons, splash) only ship with a new AAB — the web deploy cadence doesn't carry them.
