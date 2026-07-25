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
  if (local.length >= 4 && lower.includes(local)) {
    return 'Don’t use your email address in the password';
  }
  const firstName = (ctx.name ?? '').trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  if (firstName.length >= 4 && lower.includes(firstName)) {
    return 'Don’t use your name in the password';
  }
  return null;
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
    return mode === 'signin'
      ? 'That email and password don’t match. If you joined before passwords existed, use “Set / reset password”.'
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
  if (m.includes('token has expired') || m.includes('expired')) {
    return 'That code has expired — request a fresh one.';
  }
  if (m.includes('invalid') && (m.includes('token') || m.includes('otp'))) {
    return 'That code didn’t match. Check the latest email and try again.';
  }
  if (m.includes('new password should be different')) {
    return 'That’s already your current password — choose a new one.';
  }
  if (m.includes('failed to fetch') || m.includes('network')) {
    return 'Can’t reach the server — check your connection and try again.';
  }
  return raw ?? 'Something went wrong — please try again.';
}
