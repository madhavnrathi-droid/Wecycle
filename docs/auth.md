# Authentication

Wecycle uses **password sign-in**. An emailed one-time code is used only for **password resets**. Membership is **Manipal-only**, enforced client-side and again at the database.

Sign-up email confirmation is controlled by a single switch, **`REQUIRE_EMAIL_CONFIRMATION` in `lib/authConfig.ts`**, currently **off**. Both sign-up paths are implemented in `components/AuthModal.tsx`; the flag picks one. Read `lib/authConfig.ts` before changing anything here — the flag must stay the inverse of Supabase's `mailer_autoconfirm`, and it carries a security constraint (below).

### Why it's off

Supabase's built-in sender allows **2 emails an hour** and can't be raised without a verified sending domain. Sign-up spent one of those, so the third person to join in any hour couldn't create an account at all: the code never arrived, so the password was never stored, so there was nothing to come back to.

## The flows

### Sign up — confirmation OFF (current)
1. User fills name, Manipal email, password (+ optional profile fields), accepts terms, **and ticks a checkbox that reads their address back to them**.
2. `signUp({ email, password, options: { data: {…} } })` — one request. Supabase's `mailer_autoconfirm` confirms the address inline and returns a session, so the user is signed in immediately. **No email is sent.**

Nothing can be left half-finished: the account and the password are written together. Because nothing verifies the address, the read-back checkbox is the only typo check there is, so it's required rather than advisory, and it retracts itself if the address is edited afterwards.

A repeat sign-up returns `422 user_already_exists` → "That email already has an account — sign in instead, or reset the password."

### Sign up — confirmation ON
1. As above, minus the read-back checkbox (verifying the code *is* the check).
2. `signInWithOtp({ shouldCreateUser: true, data: {…} })` provisions the account and emails a code. The chosen password is held client-side (a ref, never storage) until the address is proven.
3. `verifyOtp({ type: 'email' })` confirms the address and signs the user in.
4. `updateUser({ password })` stores the password.

An abandoned sign-up (code never entered) leaves an account with no password. A localStorage marker (set only by the browser that started the sign-up) routes a returning user back to "confirm your address" instead of a misleading "wrong password" error. That recovery only runs while the flag is on — see below.

### ⚠️ The constraint: no unconfirmed rows while confirmation is off

While `mailer_autoconfirm` is on, an **unconfirmed** row in `auth.users` can be claimed by anyone who knows the address, **with no password**. GoTrue's `/signup` only raises `user_already_exists` for *confirmed* users; for an unconfirmed one it confirms the row and issues a session while deliberately discarding the submitted password. Verified against this project on 2026-08-01, and re-verified closed after the fix.

Two things keep this shut, and both must stay:

- The two leftover unconfirmed rows from the emailed-code era were confirmed on 2026-08-01. Check with `select email from auth.users where email_confirmed_at is null;` — it must return nothing.
- `sendCode` passes `shouldCreateUser` **only when the flag is on**, so `signInWithOtp` can't mint an unconfirmed row. Don't simplify that back to `purpose === 'signup'`. For the same reason the abandoned-sign-up recovery in the sign-in error path is gated on the flag.

### Sign in
`signInWithPassword`, in both modes. The password grant rejects unconfirmed users unconditionally (it doesn't consult `mailer_autoconfirm`), which is another reason no unconfirmed row may be left lying around. While the flag is on, an *email not confirmed* answer makes the modal send a fresh code and move to the confirm step; while it's off that can't arise, and the reset flow is the recovery route.

### Forgot password
`signInWithOtp({ shouldCreateUser: false })` → code → `verifyOtp` → choose a new password. Two properties worth knowing:

- **No enumeration.** A reset for an address with *no* account behaves identically to one with an account — same screen, same copy ("If … has a Wecycle account, a code is on its way"). The 422 the server returns for unknown addresses is deliberately swallowed; answering differently would let anyone probe who has an account, one address at a time.
- **Signed-in "I don't know my current password"** (Settings → Password) hands off into this same flow with the email pre-filled.

### Changing a password while signed in
`ChangePasswordScreen` requires the **current** password (verified via `signInWithPassword`) before rotating — a session alone shouldn't be enough on a borrowed device.

## The Manipal gate

Accounts require a Manipal address. The rule lives in **two places that must stay in step**:

1. **Client — `lib/emailDomain.ts`.** Runs before any network call, so a rejected address never costs an email (Supabase emails are metered; this was a hard requirement). The rule is an **exact-suffix match** on real Manipal mail domains — `manipal.edu`, `manipal.com`, or any subdomain of them — *not* a "contains manipal" substring test, which would accept `manipal.com.attacker.net` (any $2 domain). The domain must also be a syntactically valid hostname: `.manipal.edu` ends with the right suffix but has an empty label, can't exist in DNS, and would waste a code on an address that provably can't answer.
2. **Database — `public.enforce_manipal_signup_email()`**, a trigger on `auth.users` firing **BEFORE INSERT and BEFORE UPDATE OF email**. The update half matters: without it, a member could join with a Manipal address and then swap to a personal one through the API. The two rules were verified to agree on a 34-case differential matrix.

Beyond the domain check, the UI catches the human failure modes *before* an email is spent:

- The address is **read back** to the user — the domain is guaranteed by the gate, so the only thing left to mistype is the local part. With confirmation off this is the required checkbox ("I've checked that *you@learner.manipal.edu* is spelled correctly…"); with it on, a field hint ("We'll email your code to …").
- Typo'd domains get a correction ("Did you mean @learner.manipal.edu?").
- If a code doesn't arrive within 45 s, a panel explains the likely causes — spam folder, a mailbox closed after graduation, a slightly-wrong address — each with an action. The reset variant leads with "you may not have an account yet — sign up instead", because that's the likeliest cause there and the anti-enumeration design means the UI can't say so directly.

### Exemptions

| List | Who | Why |
|---|---|---|
| `DOMAIN_EXEMPT_EMAILS` | Play reviewer (`playreview@wecycle.page`) + the admin accounts | The reviewer signs into a demo-only session; admins predate the rule and are public in `ADMIN_EMAILS` |
| `LEGACY_MEMBER_EMAILS` | Members who joined before the rule | Grandfathered for **sign-in and reset only** — the exemption is never consulted for sign-up, so it cannot create an account. The list can only shrink. |

The DB trigger mirrors the exemptions. To fully remove a grandfathered member, delete their row in Supabase — removing them from the list alone just locks them out of their own data.

## Password rules — `lib/password.ts`

Length-first, not complexity-classes ("one uppercase, one symbol" pushes people to `Passw0rd!`):

- 8–72 chars (bcrypt truncates beyond 72 bytes), no leading/trailing spaces
- Rejects repeats, keyboard walks, a small common-password set
- Rejects the user's own name/email — but only when it *stands alone* or anchors the password (`mira1988`, `mirasharma`), **not** when it merely hides inside a word (`adMIRAlofthefleet` is fine). Substring matching produced absurd false rejections.

`humanAuthError()` maps every GoTrue error string (verified against the live project) to copy a human can act on. Notably: a mistyped code and an expired one are the *same* server error, so the message suggests retyping first — "expired" alone sent people to Resend, which invalidated the code in their inbox and then hit the email rate limit.

## Sessions

Sessions persist across visits (no re-OTP), in the browser and in the Capacitor shell. Sign-out is explicit.

## Reviewer access

`playreview@wecycle.page` + the documented review password signs into a **demo session** — fixture data only, no real member data, nothing persisted server-side. This is what Google's reviewers use; the credential being visible in the client bundle is deliberate and harmless by construction.
