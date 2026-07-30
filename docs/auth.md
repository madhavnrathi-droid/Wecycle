# Authentication

Wecycle uses **password sign-in with a one-time emailed code only where an address must be proven** — at sign-up, and for password resets. Membership is **Manipal-only**, enforced before any email is sent and again at the database.

## The flows

### Sign up
1. User fills name, Manipal email, password (+ optional profile fields), accepts terms.
2. `signInWithOtp({ shouldCreateUser: true, data: {…} })` provisions the account and emails a code. The chosen password is held client-side (a ref, never storage) until the address is proven.
3. `verifyOtp({ type: 'email' })` confirms the address and signs the user in.
4. `updateUser({ password })` stores the password. From then on, sign-in is password-only.

An abandoned sign-up (code never entered) leaves an account with no password. A localStorage marker (set only by the browser that started the sign-up) routes a returning user back to "confirm your address" instead of a misleading "wrong password" error.

### Sign in
`signInWithPassword`. If the server answers *email not confirmed*, the modal silently sends a fresh code and moves to the confirm step — no dead ends.

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

- The field hint **reads the address back** ("We'll email your code to …") — the domain is guaranteed by the gate, so the only thing left to mistype is the local part.
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
