/* ── Password rules ─────────────────────────────────────────────────────────
 *
 * Supabase's server minimum is 6 characters ("Password should be at least 6
 * characters." — verified against the live project). We hold a stricter line
 * client-side so nobody ends up with a 6-character password on a marketplace
 * account that carries their real name, campus and contact details.
 *
 * Deliberately NOT a complexity-class ruleset (one upper, one digit, one
 * symbol…). Those push people toward "Passw0rd!" and are worse in practice
 * than length. We require length, then reject the handful of things that are
 * actually guessable: repeated characters, well-known passwords, and the
 * user's own name/email.
 */

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 72; /* bcrypt truncates beyond 72 bytes */

/* Lowercased. Kept short on purpose — this catches the lazy cases, it isn't a
   breach corpus. Real breach checking is Supabase's "leaked password
   protection" setting (HaveIBeenPwned), which belongs on the server. */
const COMMON = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890',
  'qwerty123', 'qwertyuiop', 'iloveyou', 'letmein', 'welcome1', 'admin123',
  'abc12345', 'football', 'princess', 'sunshine', 'monkey123', 'trustno1',
  'wecycle', 'wecycle123', 'manipal', 'manipal123',
]);

export interface PasswordCheckContext {
  email?: string;
  name?: string;
}

/** Returns a human error string, or null when the password is acceptable. */
export function validatePassword(pw: string, ctx: PasswordCheckContext = {}): string | null {
  if (!pw) return 'Choose a password';
  if (pw.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (pw.length > MAX_PASSWORD_LENGTH) {
    return `Keep it under ${MAX_PASSWORD_LENGTH} characters`;
  }
  if (pw.trim() !== pw) return 'Remove the spaces at the start or end';
  if (/^(.)\1+$/.test(pw)) return 'That’s the same character repeated — try something else';
  if (/^(?:0123456789|1234567890|abcdefgh|qwertyui)/i.test(pw)) {
    return 'That’s a keyboard pattern — try something less predictable';
  }

  const lower = pw.toLowerCase();
  if (COMMON.has(lower)) return 'That password is too common — pick something else';

  /* Don't let the password be (or contain) the identity it protects. */
  const local = (ctx.email ?? '').split('@')[0].toLowerCase();
  if (identityHit(lower, local)) {
    return 'Don’t use your email address in the password';
  }
  const name = (ctx.name ?? '').trim().toLowerCase();
  const firstName = name.split(/\s+/)[0] ?? '';
  /* The whole name run together ("mirasharma") is as common as the first name
     alone, and wouldn't be caught by the first-name test on its own. */
  if (identityHit(lower, firstName) || identityHit(lower, name.replace(/\s+/g, ''))) {
    return 'Don’t use your name in the password';
  }
  return null;
}

/* Is `token` (a first name or email local part) really being used AS the
 * password, rather than just happening to appear inside a longer word?
 *
 * A bare `includes` reads as equivalent and rejects perfectly good passphrases:
 * "mira" ⊂ "adMIRAble", "riya" ⊂ "pRIYAnkasongs", "amar" ⊂ "tAMARindchutney".
 * Being told "don't use your name" about a password that doesn't contain your
 * name is the kind of thing that makes people give up and pick something worse.
 * So flag it only in the shapes a name-based password actually takes: the token
 * standing on its own (mira1988, riya.2026), or the password being built off the
 * front or back of it (mirasharma, miraabcd, 2026mira). A plain length ratio
 * looked like a reasonable stand-in for that and isn't — at 50% it flags
 * "bananas1" for anyone named Anna. */
function identityHit(lowerPw: string, token: string): boolean {
  if (token.length < 4) return false;
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`(?:^|[^a-z])${escaped}(?:[^a-z]|$)`).test(lowerPw)) return true;
  return lowerPw.startsWith(token) || lowerPw.endsWith(token);
}

export type PasswordStrength = 0 | 1 | 2 | 3;

/** Coarse strength for the meter. Length-dominant, with a small bonus for
 *  character variety — enough to nudge without lecturing. */
export function passwordStrength(pw: string): { score: PasswordStrength; label: string } {
  if (!pw) return { score: 0, label: '' };
  let score = 0;
  if (pw.length >= MIN_PASSWORD_LENGTH) score += 1;
  if (pw.length >= 12) score += 1;
  const classes =
    (/[a-z]/.test(pw) ? 1 : 0) +
    (/[A-Z]/.test(pw) ? 1 : 0) +
    (/[0-9]/.test(pw) ? 1 : 0) +
    (/[^A-Za-z0-9]/.test(pw) ? 1 : 0);
  if (classes >= 3 && pw.length >= 10) score += 1;
  const clamped = Math.min(3, score) as PasswordStrength;
  return { score: clamped, label: ['Too short', 'Okay', 'Good', 'Strong'][clamped] };
}

/* ── Supabase error → human copy ──────────────────────────────────────────
 * Verified strings from the live project (see the auth tests):
 *   wrong password        → "Invalid login credentials"  (invalid_credentials)
 *   short password        → "Password should be at least 6 characters."
 *   unverified email      → "Email not confirmed"
 *   repeat OTP too soon   → "For security purposes, you can only request this after N seconds"
 */
export function humanAuthError(raw: string | undefined | null, mode: 'signin' | 'signup' | 'reset'): string {
  const m = (raw ?? '').toLowerCase();
  if (!m) return 'Something went wrong — please try again.';

  if (m.includes('invalid login credentials')) {
    /* Quote the control by the words actually printed on it (AuthModal's
       "Forgot password? Set a new one") — naming a button that isn't there
       sends people hunting for it. */
    return mode === 'signin'
      ? 'That email and password don’t match. If you joined before passwords existed, use “Forgot password? Set a new one” below.'
      : 'Those details didn’t match — please try again.';
  }
  if (m.includes('email not confirmed')) {
    return 'Confirm your email first — we sent you a code when you signed up.';
  }
  if (m.includes('user already registered') || m.includes('already been registered')) {
    return 'That email already has an account — sign in instead, or reset the password.';
  }
  if (m.includes('password should be at least')) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (m.includes('weak') && m.includes('password')) {
    return 'That password is too easy to guess — try a longer one.';
  }
  if (m.includes('for security purposes') || m.includes('rate limit') || m.includes('too many')) {
    return 'We’ve sent too many emails just now — wait a minute and try again.';
  }
  /* GoTrue returns ONE error for a mistyped code and an expired one:
     "Token has expired or is invalid" (otp_expired). Saying "expired" sends
     people straight to Resend — which invalidates the code still sitting in
     their inbox and then trips the per-address email rate limit, so a single
     typo turns into a dead end. Don't claim to know which case it is; retyping
     is free and is the more likely fix. */
  if (m.includes('expired') || (m.includes('invalid') && (m.includes('token') || m.includes('otp')))) {
    return 'That code didn’t match, or it has expired. Retype the latest code — or request a fresh one.';
  }
  /* signInWithOtp({shouldCreateUser:false}) on an address with no account →
     422 otp_disabled, "Signups not allowed for otp". Showing that raw is both
     gibberish and an account-existence oracle: a green "we emailed a code"
     versus this error tells an attacker exactly who has an account. Answer
     identically either way. */
  if (m.includes('signups not allowed') || m.includes('otp_disabled')) {
    return 'If that address has a Wecycle account, a code is on its way. Check your inbox.';
  }
  if (m.includes('new password should be different')) {
    return 'That’s already your current password — choose a new one.';
  }
  if (m.includes('failed to fetch') || m.includes('network')) {
    return 'Can’t reach the server — check your connection and try again.';
  }
  return raw ?? 'Something went wrong — please try again.';
}
