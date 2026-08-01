/* ── Sign-up email confirmation — one switch ───────────────────────────────
 *
 * REQUIRE_EMAIL_CONFIRMATION = false  (today)
 *   Sign-up is one step: Manipal email + password → account created, signed in.
 *   No email is sent. The address is taken on trust, and a required checkbox
 *   asks the user to read it back and confirm it's spelled right.
 *
 * REQUIRE_EMAIL_CONFIRMATION = true
 *   Sign-up emails an 8-digit code, verifyOtp() proves the address, and the
 *   chosen password is stored afterwards. That whole path is still in
 *   components/AuthModal.tsx, intact and unchanged — nothing was deleted.
 *
 * WHY IT'S OFF
 *   Supabase's built-in email sender allows 2 messages an hour, and it cannot
 *   be raised without a verified sending domain. Since sign-up spent one of
 *   those, the third person to join in any hour could not create an account at
 *   all — the code never arrived, so the password was never stored, so there
 *   was nothing to come back to. Trading proof-of-address for "everyone can
 *   actually join" is the right call while the community is small enough that
 *   a bad address just means nobody can reach that person.
 *
 * ── MUST BE KEPT IN STEP WITH SUPABASE ────────────────────────────────────
 * This flag is the INVERSE of the project's `mailer_autoconfirm` setting:
 *
 *     REQUIRE_EMAIL_CONFIRMATION = false  ⇔  mailer_autoconfirm = true
 *     REQUIRE_EMAIL_CONFIRMATION = true   ⇔  mailer_autoconfirm = false
 *
 * Flip both or neither. Getting them out of step breaks sign-up in a way that
 * is nearly invisible:
 *
 *   flag false + autoconfirm false → signUp() emails a confirmation link and
 *     returns no session, so the form appears to do nothing. Worse, GoTrue
 *     answers a repeat sign-up with a decoy user instead of an error, so an
 *     existing member gets silence too. (AuthModal detects the decoy and says
 *     something sane, but the flow is still wrong.)
 *   flag true + autoconfirm true → the emailed code still verifies, so this
 *     one merely wastes an email per sign-up.
 *
 * `mailer_autoconfirm` is not in the Supabase dashboard's usual place — it's
 * the "Confirm email" toggle under Authentication → Sign In / Providers →
 * Email. Or via the Management API (use curl; Cloudflare blocks other clients
 * with a misleading 403):
 *
 *   curl -X PATCH \
 *     "https://api.supabase.com/v1/projects/oxqnwqaumrqdiwrlvfel/config/auth" \
 *     -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
 *     -H "Content-Type: application/json" \
 *     -d '{"mailer_autoconfirm": true}'
 *
 * Turning confirmation back ON is safe at any time: existing accounts are
 * already confirmed, so only new sign-ups take the code route.
 *
 * ── THE ONE REAL HAZARD: NEVER LEAVE AN UNCONFIRMED ROW ───────────────────
 * While mailer_autoconfirm is on, an UNCONFIRMED row in auth.users can be
 * claimed by anyone who knows the email address, with no password.
 *
 * GoTrue's /signup handler only raises `user_already_exists` when the existing
 * user IS confirmed. For an unconfirmed one it falls straight through, confirms
 * the row, and issues a session — while deliberately NOT writing the submitted
 * password ("we can't be sure of their claimed identity"). So the attacker gets
 * in, and the real owner is left with a password that still doesn't work.
 *
 * Verified against this project on 2026-08-01: POST /signup for an unconfirmed
 * address with an invented password returned 200 and a live access_token for
 * the pre-existing account. After setting email_confirmed_at, the same request
 * returned 422 user_already_exists.
 *
 * Consequences, both already handled — keep them that way:
 *   1. The two unconfirmed rows left over from the emailed-code era were
 *      confirmed on 2026-08-01. auth.users must stay free of unconfirmed rows
 *      for as long as this flag is false. To check:
 *        select email from auth.users where email_confirmed_at is null;
 *   2. Nothing in the app may create a row any other way. AuthModal's sendCode
 *      passes shouldCreateUser only when this flag is true, precisely so
 *      signInWithOtp can't mint an unconfirmed row behind our backs. Don't
 *      "simplify" that back to `purpose === 'signup'`.
 *
 * Re-enabling confirmation removes the hazard (unconfirmed rows become normal
 * and /signup goes back to its anti-enumeration decoy response).
 *
 * ── ACCEPTED TRADE-OFF ────────────────────────────────────────────────────
 * With confirmation off, /signup answers a repeat sign-up with a plain 422
 * instead of the decoy user, so the sign-up form now reveals whether an address
 * already has an account. That's how most sign-up forms behave and the audience
 * is one campus, so it's accepted. Password reset stays deliberately
 * non-committal — see sendCode's 'reset' branch, which must not change.
 * ─────────────────────────────────────────────────────────────────────────── */
export const REQUIRE_EMAIL_CONFIRMATION = false;

/** Password reset always proves the address by emailed code, in both modes —
 *  it has to, or "forgot password" would be a way to take over any account.
 *  Stated as a constant so the distinction is legible at the call sites. */
export const RESET_REQUIRES_EMAIL_CODE = true;
