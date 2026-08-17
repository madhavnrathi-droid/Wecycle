'use client';

/* Email + PASSWORD authentication.
 *
 *   Sign in    — email + password → signInWithPassword(). No email sent.
 *   Sign up    — depends on REQUIRE_EMAIL_CONFIRMATION (lib/authConfig.ts):
 *                  off (today) — details + password → signUp() creates the
 *                    account, confirms it inline and returns a session. No
 *                    email at all. A required checkbox makes the user read
 *                    their address back instead, since nothing else will
 *                    catch a typo.
 *                  on          — details + password → we email a code →
 *                    verifyOtp() confirms the address and opens a session →
 *                    updateUser() stores the password they chose.
 *   Set/reset  — email → code → choose a new password, ALWAYS. Reset has to
 *                prove the address or it would be a way into any account.
 *                This is also how the pre-password accounts get in.
 *
 * Both sign-up paths live here; the flag picks one. Read lib/authConfig.ts
 * before touching either — the flag has to stay in step with Supabase's
 * `mailer_autoconfirm` or sign-up fails quietly.
 *
 * Why the reset code is a *sign-in* OTP rather than Supabase's recovery link:
 * the magic-link template on this project already emits a numeric code, so
 * this path needs no dashboard template edits and sends exactly one email.
 * verifyOtp(type:'email') confirms email_confirmed_at just the same.
 *
 * Code length is deliberately NOT pinned to a constant — Supabase's Email OTP
 * Length setting can be 6–10, so we accept anything in that range and let the
 * server judge. A hard-coded length is how you brick sign-in from a dashboard
 * toggle.
 *
 * Demo fallback: with no Supabase env we drop into the localStorage demo
 * session so the screens stay navigable.
 *
 * App-review test account (Apple AND Google): playreview@wecycle.page + REVIEW_PASSWORD below —
 * signs into DEMO mode (never real data). Mirrored in docs/play-console-launch.md.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Mail, User, ArrowLeft, KeyRound, Loader2, Phone, Lock, Eye, EyeOff,
  GraduationCap, LifeBuoy, MailWarning,
} from 'lucide-react';
import Modal from './Modal';
import { createDemoSession, initialsOf } from '../lib/demoAuth';
import { setDemoMode } from '../lib/demoMode';
import { supabase, hasSupabaseEnv } from '../lib/supabase';
import { track, EVT } from '../lib/analytics';
import { Logomark } from './Brand';
import {
  validatePassword, passwordStrength, humanAuthError, MIN_PASSWORD_LENGTH,
} from '../lib/password';
import { emailGateProblem, isManipalEmail } from '../lib/emailDomain';
import { REQUIRE_EMAIL_CONFIRMATION } from '../lib/authConfig';
import { tenDigits, isAcceptable, toE164 } from '../lib/phone';
import { COLLEGES } from '../lib/colleges';

type Step = 'credentials' | 'confirm' | 'newpassword';
type AuthMode = 'signin' | 'signup';
/** What the emailed code is currently proving. */
type Pending = 'signup' | 'reset' | null;

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  /** Open straight into the emailed-code reset. Used by the "I don't know my
   *  current password" hand-off, where landing on the sign-in form would ask
   *  for the very password the user just said they don't have. */
  startInReset?: boolean;
  /** Pre-fill the email — saves retyping it after that hand-off. */
  initialEmail?: string;
}

const EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/* Phone: optional leading +, then digits/spaces/dashes/parens, 7–20 chars */
const PHONE_LIKE = /^\+?[0-9\s\-()]{7,20}$/;
/* Supabase's Email OTP Length is configurable 6–10; accept the whole range so
   a dashboard change can never block sign-in. */
const MIN_OTP_LENGTH = 6;
const MAX_OTP_LENGTH = 10;
const RESEND_SECONDS = 30;
const AUTH_MODE_KEY = 'wecycle.lastAuthMode';
const PENDING_SIGNUP_KEY = 'wecycle.incompleteSignup';

const REVIEW_EMAIL = 'playreview@wecycle.page';
const REVIEW_PASSWORD = 'WecycleReview2026';
const HELP_EMAIL = 'wecycle.page@gmail.com';

function readStoredMode(): AuthMode {
  if (typeof window === 'undefined') return 'signin';
  try {
    return localStorage.getItem(AUTH_MODE_KEY) === 'signup' ? 'signup' : 'signin';
  } catch {
    return 'signin';
  }
}

/* ── Abandoned sign-ups ───────────────────────────────────────────────────
 * Sign-up creates the account row at the "email me a code" step, but the
 * password is only stored after the code is verified. Walk away in between and
 * the account exists with no password — so coming back and signing in with the
 * password you *chose* fails as "Invalid login credentials", not "Email not
 * confirmed", and the resend-the-code branch never fires. You'd be told your
 * password is wrong when it's the one you picked.
 *
 * GoTrue returns the same invalid_credentials for a genuinely wrong password,
 * so this can't be told apart server-side. Instead we remember locally that
 * THIS browser started a sign-up for THIS address. That keeps the recovery
 * self-limiting: it can only ever fire for someone finishing their own
 * interrupted sign-up, so it's not a way to make us email a stranger.
 */
/** How long after an unconfirmed sign-up we start saying the address looks
 *  unreachable. Long enough that a slow-but-working mailbox isn't maligned. */
const STALE_SIGNUP_MS = 10 * 60 * 1000;
/** How long to wait on the code screen before offering the "it isn't coming"
 *  explanation. Campus mail via Outlook is routinely 20–30s. */
const CODE_OVERDUE_MS = 45 * 1000;

function rememberIncompleteSignup(email: string) {
  try {
    localStorage.setItem(PENDING_SIGNUP_KEY, JSON.stringify({
      email: email.trim().toLowerCase(),
      at: Date.now(),
    }));
  } catch { /* private mode */ }
}

/** The stored marker, tolerating the bare-string format written by the first
 *  release of this (treated as "no timestamp", so never counted as stale). */
function readIncompleteSignup(): { email: string; at: number } | null {
  try {
    const raw = localStorage.getItem(PENDING_SIGNUP_KEY);
    if (!raw) return null;
    if (!raw.startsWith('{')) return { email: raw, at: 0 };
    const parsed = JSON.parse(raw) as { email?: unknown; at?: unknown };
    if (typeof parsed.email !== 'string') return null;
    return { email: parsed.email, at: typeof parsed.at === 'number' ? parsed.at : 0 };
  } catch {
    return null;
  }
}

function isIncompleteSignup(email: string): boolean {
  return readIncompleteSignup()?.email === email.trim().toLowerCase();
}

/** Started a sign-up for this address long enough ago that the code should
 *  have landed by now, and never finished it. */
function isStaleIncompleteSignup(email: string): boolean {
  const marker = readIncompleteSignup();
  if (!marker || marker.email !== email.trim().toLowerCase()) return false;
  return marker.at > 0 && Date.now() - marker.at > STALE_SIGNUP_MS;
}

function clearIncompleteSignup() {
  try { localStorage.removeItem(PENDING_SIGNUP_KEY); } catch { /* private mode */ }
}

export default function AuthModal({ open, onClose, startInReset, initialEmail }: AuthModalProps) {
  const [step, setStep] = useState<Step>('credentials');
  const [mode, setMode] = useState<AuthMode>('signin');
  /* Forgot / set-a-password flow — collects email only, ends at 'newpassword'. */
  const [resetting, setResetting] = useState(false);
  const [pending, setPending] = useState<Pending>(null);

  const [name, setName] = useState('');
  const [college, setCollege] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const [termsAgreed, setTermsAgreed] = useState(false);
  /* Only asked when sign-up sends no code (REQUIRE_EMAIL_CONFIRMATION off).
     Cleared whenever the address changes — a tick against the old spelling
     confirms nothing. */
  const [emailChecked, setEmailChecked] = useState(false);
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState('');

  /* The password chosen at sign-up, applied once the code proves the email. */
  const pendingPassword = useRef('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [resendSecs, setResendSecs] = useState(0);
  const resendTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const codeInputRef = useRef<HTMLInputElement | null>(null);

  /* When the current code was sent, and whether enough time has passed that it
     really should have arrived. Supabase's built-in sender gives us no bounce
     feed, so "no code came back" is the only unreachable-address signal we
     have — and it's the same signal for a closed mailbox and a wrong address. */
  const [sentAt, setSentAt] = useState(0);
  const [codeOverdue, setCodeOverdue] = useState(false);

  useEffect(() => {
    if (!open) return;
    /* Force 'signin' alongside the reset so "Back to sign in" has somewhere
       sensible to land. */
    setMode(startInReset ? 'signin' : readStoredMode());
    setResetting(!!startInReset);
    if (initialEmail) setEmail(initialEmail);
  }, [open, startInReset, initialEmail]);

  useEffect(() => {
    if (step === 'confirm') {
      const t = setTimeout(() => codeInputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [step]);

  /* Restarts on every send (sentAt changes), so a resend gives the new code a
     fresh grace period instead of scolding immediately. */
  useEffect(() => {
    setCodeOverdue(false);
    if (step !== 'confirm' || !sentAt) return;
    const t = setTimeout(() => setCodeOverdue(true), CODE_OVERDUE_MS);
    return () => clearTimeout(t);
  }, [step, sentAt]);

  useEffect(() => () => {
    if (resendTimer.current) clearInterval(resendTimer.current);
  }, []);

  const startResendCooldown = () => {
    setResendSecs(RESEND_SECONDS);
    if (resendTimer.current) clearInterval(resendTimer.current);
    resendTimer.current = setInterval(() => {
      setResendSecs(s => {
        if (s <= 1) {
          if (resendTimer.current) clearInterval(resendTimer.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const resetAll = () => {
    setStep('credentials');
    setResetting(false);
    setPending(null);
    setName(''); setCollege(''); setEmail('');
    setPhone(''); setTermsAgreed(false); setEmailChecked(false);
    setPassword(''); setPassword2(''); setShowPassword(false); setCode('');
    pendingPassword.current = '';
    setSubmitting(false); setError(null); setInfo(null); setResendSecs(0);
    setSentAt(0); setCodeOverdue(false);
    if (resendTimer.current) clearInterval(resendTimer.current);
  };
  const handleClose = () => { resetAll(); onClose(); };

  const switchMode = (m: AuthMode) => {
    setMode(m);
    try { localStorage.setItem(AUTH_MODE_KEY, m); } catch { /* private mode */ }
    setResetting(false);
    setError(null); setInfo(null);
    setPassword(''); setPassword2('');
  };

  /* ── Validation ─────────────────────────────────────── */
  const emailOk = EMAIL_LIKE.test(email.trim());
  /* Manipal-only. Checked here, client-side, so a rejected address never costs
     us an OTP email — and enforced again by a trigger on auth.users so the API
     can't be called around it. Only surfaced once the address is well-formed,
     so it doesn't nag mid-typing. */
  const domainProblem = emailOk
    ? emailGateProblem(email, resetting ? 'reset' : mode)
    : null;
  const domainOk = !domainProblem;
  /* Returning to a sign-up whose code never got entered — see
     isStaleIncompleteSignup. Only worth saying on the sign-up form. */
  const staleSignup =
    emailOk && domainOk && mode === 'signup' && !resetting && isStaleIncompleteSignup(email);
  const phoneOk = isAcceptable(phone);   /* `phone` holds 10 local digits only */
  /* Only surfaced once they've typed enough to be worth judging. */
  const passwordProblem = password ? validatePassword(password, { email, name }) : null;
  const passwordsMatch = password.length > 0 && password === password2;
  const strength = passwordStrength(password);

  /* With no code to prove the address, reading it back is the only typo check
     there is — so it's required, not advisory. Nothing to ask when a code is
     coming: verifying it IS the check. */
  const emailCheckSatisfied = REQUIRE_EMAIL_CONFIRMATION || emailChecked;

  const credentialsReady =
    resetting ? emailOk && domainOk
    : mode === 'signup'
      ? name.trim().length > 0 && emailOk && domainOk && termsAgreed && phoneOk && !!college
        && emailCheckSatisfied && !passwordProblem && passwordsMatch
      /* Sign-in: don't judge the password, just require something typed —
         the server is the authority on whether it's right. */
      : emailOk && domainOk && password.length > 0;

  const cleanCode = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const codeOk = cleanCode.length >= MIN_OTP_LENGTH && cleanCode.length <= MAX_OTP_LENGTH;
  const newPasswordReady = !!password && !passwordProblem && passwordsMatch;

  const fail = (phase: string, err: unknown, mode2: 'signin' | 'signup' | 'reset') => {
    const msg = (err as Error)?.message;
    track(EVT.sign_in_failed, { phase, reason: msg?.slice(0, 80) });
    setError(humanAuthError(msg, mode2));
  };

  /* The sign-up details, in the shape the auth.users → profiles trigger reads
     (handle_new_auth_user picks these out of raw_user_meta_data). Shared by
     both sign-up paths so they can never drift apart and start creating
     differently-populated profiles. */
  const signupMetadata = () => ({
    full_name: name.trim() || undefined,
    initials: name.trim() ? initialsOf(name) : undefined,
    college: college || undefined,
    ...(toE164(phone) ? { phone: toE164(phone) as string } : {}),

  });

  /* ── Create the account outright, no email ──────────────
   * The REQUIRE_EMAIL_CONFIRMATION=off path. signUp() writes the account and
   * the password in one request, and — because Supabase's mailer_autoconfirm
   * is on to match the flag — confirms the address inline and hands back a
   * session. One request, no email, nothing to come back and finish.
   */
  const createAccountWithPassword = async () => {
    const addr = email.trim();
    const { data, error: err } = await supabase.auth.signUp({
      email: addr,
      password,
      options: { data: signupMetadata() },
    });
    if (err) throw err;

    /* Anti-enumeration decoy: when confirmation is ON, GoTrue answers a repeat
       sign-up with a user carrying an empty `identities` array — no error, no
       session — so an existing member can't be told apart from a new one. Only
       reachable if mailer_autoconfirm has drifted out of step with the flag,
       but a form that silently does nothing is the worst outcome available, so
       name it. The message matches what humanAuthError already knows. */
    if (!data.session && (data.user?.identities?.length ?? 0) === 0) {
      throw new Error('User already registered');
    }

    /* A session should always come back. If confirmation got switched on at
       the project without the flag following, it won't — but the account and
       password now exist, so sign in with them rather than stranding someone
       on a form that looks like it failed. */
    if (!data.session) {
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email: addr, password });
      if (signInErr) throw signInErr;
    }

    /* No half-finished state exists on this path, so clear any marker left by
       an earlier attempt under the emailed-code flow. */
    clearIncompleteSignup();
    track(EVT.password_set, { context: 'signup' });
    track(EVT.login, { method: 'signup' });
    handleClose();
  };

  /* ── Email a code (sign-up confirmation, or set/reset password) ── */
  const sendCode = async (purpose: Exclude<Pending, null>) => {
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        /* Sign-up provisions the account; reset must never create one (that
           would silently turn a typo into a new account).

           The REQUIRE_EMAIL_CONFIRMATION half is a security guard, not a
           tidiness one. shouldCreateUser:true mints an UNCONFIRMED auth.users
           row, and while Supabase's mailer_autoconfirm is on, an unconfirmed
           row is claimable by anyone who knows the address: POST /signup skips
           its "user already exists" check for unconfirmed users, confirms the
           row, and returns a live session — without ever checking a password.
           So while confirmation is off, nothing here may create a row; only
           signUp() may, and signUp confirms as it goes. */
        shouldCreateUser: purpose === 'signup' && REQUIRE_EMAIL_CONFIRMATION,
        ...(purpose === 'signup' ? { data: signupMetadata() } : {}),
      },
    });
    if (err) {
      /* A reset for an address with no account returns 422 otp_disabled
         ("Signups not allowed for otp") because shouldCreateUser is false.
         Surfacing that would say out loud which addresses have accounts — ask
         for a real member's address and you get a code, ask for anyone else's
         and you get an error, one probe at a time. Carry on to the code step
         instead, so both cases look and behave the same; an address with no
         account simply has no code that will ever verify. */
      const noSuchAccount =
        purpose === 'reset' && /signups not allowed|otp_disabled/i.test(err.message);
      if (!noSuchAccount) throw err;
    }
    /* The account row now exists but is unconfirmed and has no password yet —
       see recoverIncompleteSignup for why that needs remembering. */
    if (purpose === 'signup') rememberIncompleteSignup(email);
    setSentAt(Date.now());
    setPending(purpose);
    setStep('confirm');
    setCode('');
    /* Codes are deliberately long-lived (mailer_otp_exp = 7 days). The built-in
       sender only allows 2 emails an hour, so a short window would strand anyone
       who didn't happen to be watching their inbox — and a code this long can't
       be brute-forced anyway: 8 digits against a 30/hour verify limit covers
       0.005% of the space in a week. Say so, so nobody rushes or re-requests. */
    setInfo(
      purpose === 'reset'
        /* Deliberately non-committal — see above. */
        ? `If ${email.trim()} has a Wecycle account, a code is on its way. It stays valid for 7 days.`
        : `We emailed a code to ${email.trim()}. It stays valid for 7 days — no rush.`,
    );
    startResendCooldown();
  };

  /* ── Step 1 submit ──────────────────────────────────── */
  const submitCredentials = async () => {
    if (!credentialsReady || submitting) return;
    /* Hard stop before ANY network call — the disabled button is a courtesy,
       this is the thing that guarantees we never pay for an email to an
       address that can't hold an account. */
    const gate = emailGateProblem(email, resetting ? 'reset' : mode);
    if (gate) { setInfo(null); setError(gate); return; }
    setError(null); setInfo(null); setSubmitting(true);
    try {
      /* Reviewer bypass — demo session only, never touches real data. */
      if (email.trim().toLowerCase() === REVIEW_EMAIL && !resetting) {
        await new Promise(r => setTimeout(r, 200));
        if (password === REVIEW_PASSWORD) {
          setDemoMode(true);
          createDemoSession({ name: 'App Reviewer', email: REVIEW_EMAIL, collegeId: '' });
          track(EVT.login, { method: 'reviewer' });
          handleClose();
        } else {
          setError('That password doesn’t match the reviewer credentials.');
        }
        return;
      }

      /* No backend configured → demo session so the app stays explorable. */
      if (!hasSupabaseEnv) {
        await new Promise(r => setTimeout(r, 250));
        createDemoSession({
          name: name.trim() || email.split('@')[0],
          email: email.trim(),
          collegeId: '',
        });
        track(EVT.login, { method: 'demo' });
        handleClose();
        return;
      }

      if (resetting) {
        track(EVT.password_reset_requested);
        await sendCode('reset');
        return;
      }

      if (mode === 'signup') {
        track(EVT.sign_up_email_submitted, {
          mode,
          has_name: !!name.trim(),
          college,
          has_phone: !!toE164(phone),
        });
        if (!REQUIRE_EMAIL_CONFIRMATION) {
          await createAccountWithPassword();
          return;
        }
        /* Hold the chosen password until the code proves the address. */
        pendingPassword.current = password;
        await sendCode('signup');
        track(EVT.sign_up_otp_sent);
        return;
      }

      /* ── Sign in with password ── */
      const { error: err } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (err) throw err;
      clearIncompleteSignup();
      track(EVT.login, { method: 'password' });
      handleClose();
    } catch (err) {
      const msg = (err as Error)?.message ?? '';
      /* Signed up but never confirmed → the password is fine, the address
         isn't proven yet. Send a fresh code and put them on the code step
         instead of showing a dead end.

         The invalid-credentials half covers the abandoned sign-up: the account
         has no password at all, so the right answer is still "confirm the
         address", not "your password is wrong". Guarded by the local marker so
         it only fires for a sign-up this browser started.

         All of which only applies while sign-up goes through an emailed code.
         With confirmation off, sign-up is atomic — there is no half-finished
         account to rescue and every row is confirmed as it's created — and this
         branch must not run: it would ask for a code that proves nothing and,
         for an address with no account, couldn't create one anyway (sendCode
         withholds shouldCreateUser in that mode, deliberately). The reset flow
         is the recovery route there. */
      if (
        REQUIRE_EMAIL_CONFIRMATION && mode === 'signin' && !resetting && (
          /email not confirmed/i.test(msg) ||
          (/invalid login credentials/i.test(msg) && isIncompleteSignup(email))
        )
      ) {
        try {
          pendingPassword.current = password;
          await sendCode('signup');
          setInfo(`Almost there — confirm ${email.trim()} with the code we just emailed.`);
          return;
        } catch (inner) {
          fail('resend_after_unconfirmed', inner, 'signin');
          return;
        }
      }
      fail(
        resetting ? 'send_reset_code'
        : mode === 'signup'
          ? (REQUIRE_EMAIL_CONFIRMATION ? 'send_signup_code' : 'signup_with_password')
          : 'password_signin',
        err,
        resetting ? 'reset' : mode,
      );
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Step 2 submit — verify the emailed code ────────── */
  const submitCode = async () => {
    if (!codeOk || submitting) return;
    setError(null); setSubmitting(true);
    try {
      const { error: err } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: cleanCode,
        type: 'email',
      });
      if (err) throw err;

      /* Signed in now. Sign-up: store the password they picked. Reset: let
         them choose a new one. */
      if (pending === 'signup') {
        const chosen = pendingPassword.current;
        if (chosen) {
          const { error: pwErr } = await supabase.auth.updateUser({ password: chosen });
          if (pwErr) {
            /* Email IS confirmed and they're signed in — don't strand them.
               Let them set the password from the next step. */
            pendingPassword.current = '';
            setPassword(''); setPassword2('');
            setStep('newpassword');
            setError(humanAuthError(pwErr.message, 'signup'));
            return;
          }
          track(EVT.password_set, { context: 'signup' });
        }
        pendingPassword.current = '';
        clearIncompleteSignup();
        track(EVT.login, { method: 'signup' });
        handleClose();
        return;
      }

      /* Reset flow → choose the new password. */
      setPassword(''); setPassword2('');
      setStep('newpassword');
      setInfo('Email confirmed — choose a new password.');
    } catch (err) {
      fail('verify_code', err, pending === 'reset' ? 'reset' : 'signup');
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Step 3 submit — store the new password ─────────── */
  const submitNewPassword = async () => {
    if (!newPasswordReady || submitting) return;
    setError(null); setSubmitting(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      clearIncompleteSignup();
      track(EVT.password_set, { context: resetting || pending === 'reset' ? 'reset' : 'signup' });
      track(EVT.login, { method: 'password_set' });
      handleClose();
    } catch (err) {
      fail('set_password', err, 'reset');
    } finally {
      setSubmitting(false);
    }
  };

  const resendCode = async () => {
    if (resendSecs > 0 || submitting || !pending) return;
    setSubmitting(true);
    setError(null);
    try {
      await sendCode(pending);
    } catch (err) {
      fail('resend_code', err, pending === 'reset' ? 'reset' : 'signup');
    } finally {
      setSubmitting(false);
    }
  };

  const onFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 'credentials')      void submitCredentials();
    else if (step === 'confirm')     void submitCode();
    else                             void submitNewPassword();
  };

  /* ── Chrome ─────────────────────────────────────────── */
  const title =
    step === 'confirm' ? 'Confirm your email'
    : step === 'newpassword' ? 'Choose a password'
    : resetting ? 'Set a password'
    : 'Welcome to Wecycle';

  const primaryLabel =
    step === 'confirm' ? (submitting ? 'Verifying…' : 'Verify email')
    : step === 'newpassword' ? (submitting ? 'Saving…' : 'Save password')
    : resetting ? (submitting ? 'Sending…' : 'Email me a code')
    : mode === 'signup'
      ? (submitting ? (REQUIRE_EMAIL_CONFIRMATION ? 'Sending…' : 'Creating account…') : 'Create account')
    : (submitting ? 'Signing in…' : 'Sign in');

  const primaryDisabled = submitting || (
    step === 'confirm' ? !codeOk
    : step === 'newpassword' ? !newPasswordReady
    : !credentialsReady
  );

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={title}
      footer={
        <button
          type="submit"
          form="auth-form"
          disabled={primaryDisabled}
          className="btn btn-primary"
          style={{ flex: 1 }}
        >
          {submitting && (
            <Loader2 size={15} style={{ animation: 'spin 0.9s linear infinite', marginRight: 6, verticalAlign: '-2px' }} />
          )}
          {primaryLabel}
        </button>
      }
    >
      <form id="auth-form" onSubmit={onFormSubmit} noValidate
        style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        {/* ── Brand logomark — centered above the form ── */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: -4, marginBottom: 2 }}>
          <Logomark size={56} alt="" />
        </div>

        {step === 'credentials' && (
          <>
            {/* Segmented control — hidden during the reset flow */}
            {!resetting && (
              <div style={{
                display: 'flex',
                background: 'var(--bg-inset)',
                borderRadius: 10,
                padding: 3,
                gap: 2,
              }}>
                {(['signin', 'signup'] as AuthMode[]).map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => switchMode(m)}
                    style={{
                      flex: 1,
                      padding: '7px 0',
                      borderRadius: 8,
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: 600,
                      transition: 'background 0.18s, color 0.18s, box-shadow 0.18s',
                      background: mode === m ? 'var(--bg-surface)' : 'transparent',
                      color: mode === m ? 'var(--text-primary)' : 'var(--text-secondary)',
                      boxShadow: mode === m ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
                    }}
                  >
                    {m === 'signin' ? 'Sign in' : 'Sign up'}
                  </button>
                ))}
              </div>
            )}

            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              {resetting
                ? 'Enter your Manipal email and we’ll send a code. Once it’s confirmed you can pick a new password.'
                : mode === 'signin'
                  ? 'Sign in with your Manipal email and password.'
                  : REQUIRE_EMAIL_CONFIRMATION
                    ? 'Create your account. We’ll email one code to confirm your address — after that it’s just your password.'
                    : 'Create your account with your Manipal email and a password. No code to wait for — you’re in straight away.'}
            </p>

            {/* Manipal-only notice — stated up front on sign-up so nobody
                fills the whole form before finding out. */}
            {mode === 'signup' && !resetting && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '11px 13px',
                background: 'var(--bg-inset)',
                borderRadius: 14,
              }}>
                <span aria-hidden="true" style={{
                  color: 'var(--text-primary)', flexShrink: 0,
                  display: 'inline-flex', marginTop: 1,
                }}>
                  <GraduationCap size={16} strokeWidth={1.9} />
                </span>
                <span style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                  <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Manipal students &amp; staff only.</strong>{' '}
                  Sign up with your Manipal address — <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>…@learner.manipal.edu</span>{' '}
                  or <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>…@manipal.edu</span>. Personal
                  addresses like Gmail won’t work.
                </span>
              </div>
            )}

            {/* Sign-up only: full name (required) */}
            {mode === 'signup' && !resetting && (
              <div className="field">
                <label htmlFor="auth-name" className="field-label">
                  <User size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
                  Full name <span className="required" aria-hidden="true">*</span>
                </label>
                <input
                  id="auth-name"
                  className="form-input"
                  placeholder="What should we call you?"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  autoComplete="name"
                  maxLength={60}
                  required
                />
              </div>
            )}

            {/* Email — always shown */}
            <div className="field">
              <label htmlFor="auth-email" className="field-label">
                <Mail size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
                Email <span className="required" aria-hidden="true">*</span>
              </label>
              <input
                id="auth-email"
                type="email"
                inputMode="email"
                className="form-input"
                placeholder="you@learner.manipal.edu"
                value={email}
                maxLength={80}
                /* Editing the address retracts the "I've checked it" tick —
                   it was a promise about the old spelling. */
                onChange={e => { setEmail(e.target.value); setEmailChecked(false); }}
                autoComplete="email"
                aria-invalid={!!domainProblem}
                aria-describedby={domainProblem ? 'auth-email-problem' : undefined}
                required
                autoFocus
              />
              {/* Rejected domain (or a near-miss typo) — shown the moment the
                  address is well-formed, long before any send. */}
              {domainProblem ? (
                <span id="auth-email-problem" className="field-hint" style={{ color: 'var(--accent-rose)' }}>
                  {domainProblem}
                </span>
              ) : emailOk && isManipalEmail(email) && mode === 'signup' && !resetting
                  && REQUIRE_EMAIL_CONFIRMATION ? (
                /* Echo the address back rather than just saying "recognised".
                   The domain is already proven; what's left to get wrong is the
                   name or roll number, and reading it back is the only chance to
                   catch that before we spend a code on a mailbox that will
                   never answer.

                   Only when a code is actually coming — with confirmation off
                   the read-back moved into the checkbox below, and printing the
                   same address twice a few lines apart reads as a glitch. */
                <span className="field-hint" style={{ color: '#16A34A' }}>
                  We’ll email your code to {email.trim().toLowerCase()}
                </span>
              ) : null}
              {/* Came back to a sign-up they never finished — the likeliest
                  reason the code never arrived is that the mailbox is closed
                  (which happens after graduating) or the address was mistyped. */}
              {staleSignup && (
                <span className="field-hint" style={{ color: '#B45309', lineHeight: 1.5 }}>
                  You started signing up with this address but never entered the code.
                  If it never arrived, that mailbox may be closed or the address
                  slightly wrong — check it, or use the help link below.
                </span>
              )}
            </div>

            {/* Password — sign in + sign up, not during reset */}
            {!resetting && (
              <div className="field">
                <label htmlFor="auth-password" className="field-label">
                  <Lock size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
                  Password <span className="required" aria-hidden="true">*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    className="form-input"
                    style={{ paddingRight: 44 }}
                    placeholder={mode === 'signup' ? `At least ${MIN_PASSWORD_LENGTH} characters` : 'Your password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    aria-invalid={mode === 'signup' && !!passwordProblem}
                    aria-describedby={mode === 'signup' ? 'auth-password-hint' : undefined}
                    required
                  />
                  <RevealButton shown={showPassword} onToggle={() => setShowPassword(s => !s)} />
                </div>
                {mode === 'signup' && (
                  <StrengthHint id="auth-password-hint" password={password} problem={passwordProblem} strength={strength} />
                )}
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => {
                      setResetting(true); setPassword(''); setPassword2('');
                      setError(null); setInfo(null);
                    }}
                    style={{
                      alignSelf: 'flex-start', marginTop: 6,
                      background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                      fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
                      textDecoration: 'underline', textDecorationStyle: 'dotted',
                      fontFamily: 'inherit',
                    }}
                  >
                    Forgot password? Set a new one
                  </button>
                )}
              </div>
            )}

            {/* Sign-up only: confirm password */}
            {mode === 'signup' && !resetting && (
              <ConfirmPasswordField
                value={password2}
                onChange={setPassword2}
                reveal={showPassword}
                mismatch={password2.length > 0 && !passwordsMatch}
              />
            )}

            {/* Sign-up only: college (required).
                Replaces the old "College ID" (a roll number) and free-text
                "Department / course". Neither answered the question that
                actually matters here — which MAHE school you're at — and both
                were optional, so most profiles carried nothing usable. A fixed
                list can be filtered and grouped; free text can't. */}
            {mode === 'signup' && !resetting && (
              <div className="field">
                <label htmlFor="auth-college" className="field-label">
                  <GraduationCap size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
                  College <span className="required" aria-hidden="true">*</span>
                </label>
                <select
                  id="auth-college"
                  className="form-input"
                  value={college}
                  onChange={e => setCollege(e.target.value)}
                  aria-invalid={!college}
                  required
                >
                  <option value="">Choose your college</option>
                  {COLLEGES.map(c => <option key={c.id} value={c.id}>{c.id} — {c.name}</option>)}
                </select>
              </div>
            )}

            {/* Sign-up only: phone (optional) */}
            {mode === 'signup' && !resetting && (
              <div className="field">
                <label htmlFor="auth-phone" className="field-label">
                  <Phone size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
                  Phone <span className="field-hint" style={{ fontWeight: 400 }}>(optional)</span>
                </label>
                {/* Fixed +91 affix rather than a country-code field: this is
                    an India-only launch, so the code is a question with exactly
                    one answer and one way to get it wrong. Mirrors the Account
                    screen — both call lib/phone, so the column can only ever
                    receive one shape. */}
                <div style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center',
                    padding: '0 12px', borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-inset)', border: '1px solid var(--border-default)',
                    fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)',
                    whiteSpace: 'nowrap',
                  }}>
                    +91
                  </span>
                  <input
                    id="auth-phone"
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="form-input"
                    placeholder="98765 43210"
                    value={phone}
                    onChange={e => setPhone(tenDigits(e.target.value))}
                    autoComplete="tel-national"
                    aria-invalid={!phoneOk || undefined}
                    maxLength={10}
                    style={{ flex: 1 }}
                  />
                </div>
                {phone !== '' && !phoneOk && (
                  <span className="field-hint" style={{ color: 'var(--accent-rose)' }}>
                    Enter a 10-digit mobile number (without +91).
                  </span>
                )}
              </div>
            )}


            {/* Sign-up only: read the address back (required).
                Nothing verifies the address on this path, so a typo is silent
                and permanent: no code fails to arrive, no error appears, the
                account just works while being unreachable — and password reset,
                which does email, has nowhere to send to. Printing the address
                inside the sentence they're agreeing to is the whole point; a
                generic "my email is correct" would be skimmed past. */}
            {mode === 'signup' && !resetting && !REQUIRE_EMAIL_CONFIRMATION && (
              <label style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                cursor: 'pointer',
                padding: '11px 13px',
                background: 'var(--bg-inset)',
                borderRadius: 14,
              }}>
                <input
                  type="checkbox"
                  checked={emailChecked}
                  onChange={e => setEmailChecked(e.target.checked)}
                  style={{ marginTop: 2, accentColor: 'var(--color-lime, #5C7A00)', flexShrink: 0 }}
                  required
                />
                <span style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                  <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                    I’ve checked that{' '}
                    {emailOk && domainOk ? email.trim().toLowerCase() : 'my email above'}{' '}
                    is spelled correctly.
                  </strong>{' '}
                  It’s how buyers and sellers reach me — and the only way back into
                  my account if I forget my password.
                </span>
              </label>
            )}

            {/* Sign-up only: terms checkbox (required) */}
            {mode === 'signup' && !resetting && (
              <label style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                cursor: 'pointer', fontSize: 12.5, lineHeight: 1.5,
                color: 'var(--text-secondary)',
              }}>
                <input
                  type="checkbox"
                  checked={termsAgreed}
                  onChange={e => setTermsAgreed(e.target.checked)}
                  style={{ marginTop: 2, accentColor: 'var(--color-lime, #5C7A00)', flexShrink: 0 }}
                  required
                />
                <span>
                  I agree to Wecycle&apos;s{' '}
                  <a href="/terms" target="_blank" rel="noopener noreferrer"
                    style={{ color: 'var(--text-primary)', textDecoration: 'underline' }}
                    onClick={e => e.stopPropagation()}
                  >Terms</a>
                  {' '}and{' '}
                  <a href="/privacy" target="_blank" rel="noopener noreferrer"
                    style={{ color: 'var(--text-primary)', textDecoration: 'underline' }}
                    onClick={e => e.stopPropagation()}
                  >Privacy Policy</a>.
                </span>
              </label>
            )}

            {/* Back out of the reset flow */}
            {resetting && (
              <button
                type="button"
                onClick={() => { setResetting(false); setError(null); setInfo(null); }}
                className="btn btn-ghost"
                style={{ alignSelf: 'flex-start', fontSize: 13, padding: '6px 10px' }}
              >
                <ArrowLeft size={13} strokeWidth={1.8} style={{ marginRight: 4, verticalAlign: '-2px' }} />
                Back to sign in
              </button>
            )}
          </>
        )}

        {step === 'confirm' && (
          <>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Check{' '}
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{email}</span>{' '}
              for the code and enter it below.
            </p>

            <div className="field">
              <label htmlFor="auth-code" className="field-label">
                <KeyRound size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
                Verification code <span className="required" aria-hidden="true">*</span>
              </label>
              <input
                ref={codeInputRef}
                id="auth-code"
                type="text"
                inputMode="numeric"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                maxLength={MAX_OTP_LENGTH}
                autoComplete="one-time-code"
                className="form-input"
                placeholder="Paste your code"
                value={code}
                onChange={e =>
                  setCode(e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, MAX_OTP_LENGTH))
                }
                style={{
                  textAlign: 'center',
                  fontSize: 20, fontWeight: 600,
                  letterSpacing: '0.22em',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                }}
                required
              />
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 8,
            }}>
              <button
                type="button"
                onClick={() => {
                  setStep('credentials'); setCode(''); setPending(null);
                  setError(null); setInfo(null);
                }}
                className="btn btn-ghost"
                style={{ fontSize: 13, padding: '6px 10px' }}
              >
                <ArrowLeft size={13} strokeWidth={1.8} style={{ marginRight: 4, verticalAlign: '-2px' }} />
                Change email
              </button>

              <button
                type="button"
                onClick={() => void resendCode()}
                disabled={resendSecs > 0 || submitting}
                className="btn btn-ghost"
                style={{
                  fontSize: 13, padding: '6px 10px',
                  opacity: resendSecs > 0 ? 0.6 : 1,
                  cursor: resendSecs > 0 ? 'not-allowed' : 'pointer',
                }}
              >
                {resendSecs > 0 ? `Resend in ${resendSecs}s` : 'Resend code'}
              </button>
            </div>

            {/* The code should have landed by now and hasn't been entered.
                We can't see bounces — Supabase's sender doesn't report them —
                so this is inferred from silence. Hence "may": it names the two
                real causes without asserting which, and every line is something
                the reader can act on. */}
            {codeOverdue && (
              <div role="status" style={{
                padding: '12px 14px', borderRadius: 14,
                background: 'var(--bg-inset)', lineHeight: 1.55,
              }}>
                <p style={{
                  margin: '0 0 6px', fontSize: 13, fontWeight: 600,
                  color: 'var(--text-primary)',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <MailWarning size={14} strokeWidth={2} aria-hidden="true" />
                  Still no code?
                </p>
                <p style={{ margin: '0 0 8px', fontSize: 12.5, color: 'var(--text-muted)' }}>
                  Check your spam or Junk folder first — campus mail often files it there.
                  {pending === 'reset'
                    /* Don't assert the mailbox is at fault here. On a reset the
                       likeliest cause is that there's no account — which the
                       code above deliberately refuses to confirm either way, so
                       silence is expected and says nothing about the mailbox. */
                    ? ' If it never turns up, one of these is usually why:'
                    : ' If it never turns up, the address may not be receiving mail:'}
                </p>
                <ul style={{
                  margin: '0 0 10px', paddingLeft: 18,
                  fontSize: 12.5, color: 'var(--text-muted)',
                }}>
                  {pending === 'reset' && (
                    <li style={{ marginBottom: 3 }}>
                      No Wecycle account on this address yet? There’s nothing to reset —
                      sign up instead.
                    </li>
                  )}
                  <li style={{ marginBottom: 3 }}>
                    Graduated or left? Manipal closes the mailbox, so nothing can reach it.
                  </li>
                  <li>
                    Or the address is slightly off — <strong style={{ color: 'var(--text-primary)' }}>{email}</strong>.
                    Use “Change email” above to fix it.
                  </li>
                </ul>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14 }}>
                  {pending === 'reset' && (
                    /* Naming sign-up as the fix and then making them find it
                       would be its own dead end. */
                    <button
                      type="button"
                      onClick={() => {
                        setStep('credentials');
                        setPending(null);
                        setResetting(false);
                        setCode(''); setError(null); setInfo(null);
                        setSentAt(0);
                        switchMode('signup');
                      }}
                      style={{
                        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                        fontFamily: 'inherit',
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)',
                        textDecoration: 'underline', textDecorationStyle: 'dotted',
                      }}
                    >
                      <GraduationCap size={13} strokeWidth={2} aria-hidden="true" />
                      Sign up instead
                    </button>
                  )}
                  <a
                    href={`mailto:${HELP_EMAIL}?subject=${encodeURIComponent(
                      pending === 'reset'
                        ? 'Wecycle — password reset code never arrived'
                        : 'Wecycle — sign-up code never arrived',
                    )}&body=${encodeURIComponent(
                      pending === 'reset'
                        ? `I tried to reset my Wecycle password for ${email.trim()} and the code hasn't arrived.`
                        : `I tried to sign up with ${email.trim()} and the code hasn't arrived.`,
                    )}`}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)',
                      textDecoration: 'underline', textDecorationStyle: 'dotted',
                    }}
                  >
                    <LifeBuoy size={13} strokeWidth={2} aria-hidden="true" />
                    Email us and we’ll sort it out
                  </a>
                </div>
              </div>
            )}
          </>
        )}

        {step === 'newpassword' && (
          <>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Pick a password for{' '}
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{email}</span>.
              You&apos;ll use it to sign in from now on.
            </p>

            <div className="field">
              <label htmlFor="auth-newpassword" className="field-label">
                <Lock size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
                New password <span className="required" aria-hidden="true">*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="auth-newpassword"
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  style={{ paddingRight: 44 }}
                  placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="new-password"
                  aria-invalid={!!passwordProblem}
                  aria-describedby="auth-newpassword-hint"
                  autoFocus
                  required
                />
                <RevealButton shown={showPassword} onToggle={() => setShowPassword(s => !s)} />
              </div>
              <StrengthHint id="auth-newpassword-hint" password={password} problem={passwordProblem} strength={strength} />
            </div>

            <ConfirmPasswordField
              value={password2}
              onChange={setPassword2}
              reveal={showPassword}
              mismatch={password2.length > 0 && !passwordsMatch}
            />
          </>
        )}

        {/* Info + error banners */}
        {info && !error && (
          <div role="status" style={{
            padding: '8px 12px', borderRadius: 10,
            background: 'rgba(34,197,94,0.10)',
            border: '1px solid rgba(34,197,94,0.22)',
            color: '#16A34A',
            fontSize: 12, fontWeight: 500, lineHeight: 1.45,
          }}>
            {info}
          </div>
        )}
        {error && (
          <div role="alert" style={{
            padding: '8px 12px', borderRadius: 10,
            background: 'rgba(237,46,80,0.10)',
            border: '1px solid rgba(237,46,80,0.22)',
            color: 'var(--accent-rose)',
            fontSize: 12, fontWeight: 500, lineHeight: 1.45,
          }}>
            {error}
          </div>
        )}

        {/* ── Help ──
           Opens the user's mail app with the subject prefilled. Available on
           every step, since the step you're stuck on is the one you need help
           with. A plain mailto anchor so it works in the native shell too. */}
        <a
          href={`mailto:${HELP_EMAIL}?subject=${encodeURIComponent('Wecycle — help signing in')}`}
          style={{
            alignSelf: 'center',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            marginTop: 2, padding: '7px 12px',
            borderRadius: 999,
            background: 'var(--bg-inset)',
            color: 'var(--text-secondary)',
            fontSize: 12, fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          <LifeBuoy size={13} strokeWidth={2} />
          Trouble signing in? Email us
        </a>
      </form>
    </Modal>
  );
}

/* ── Bits ───────────────────────────────────────────────── */

function RevealButton({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={shown ? 'Hide password' : 'Show password'}
      aria-pressed={shown}
      style={{
        position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
        width: 32, height: 32, borderRadius: 999,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent', border: 'none', cursor: 'pointer',
        color: 'var(--text-muted)',
      }}
    >
      {shown ? <EyeOff size={15} strokeWidth={1.9} /> : <Eye size={15} strokeWidth={1.9} />}
    </button>
  );
}

function ConfirmPasswordField({
  value, onChange, reveal, mismatch,
}: { value: string; onChange: (v: string) => void; reveal: boolean; mismatch: boolean }) {
  return (
    <div className="field">
      <label htmlFor="auth-password2" className="field-label">
        <Lock size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
        Confirm password <span className="required" aria-hidden="true">*</span>
      </label>
      <input
        id="auth-password2"
        type={reveal ? 'text' : 'password'}
        className="form-input"
        placeholder="Type it again"
        value={value}
        onChange={e => onChange(e.target.value)}
        autoComplete="new-password"
        aria-invalid={mismatch}
        required
      />
      {mismatch && (
        <span className="field-hint" style={{ color: 'var(--accent-rose)' }}>
          Those don&apos;t match yet.
        </span>
      )}
    </div>
  );
}

/** Strength meter + the single most useful correction, if any. */
function StrengthHint({
  id, password, problem, strength,
}: {
  id: string;
  password: string;
  problem: string | null;
  strength: { score: number; label: string };
}) {
  if (!password) {
    return (
      <span id={id} className="field-hint">
        At least {MIN_PASSWORD_LENGTH} characters. A short phrase beats a clever word.
      </span>
    );
  }
  const colors = ['var(--accent-rose)', '#F58400', '#16A34A', '#16A34A'];
  const tone = colors[Math.min(3, strength.score)];
  return (
    <div id={id} style={{ marginTop: 6 }}>
      <div aria-hidden="true" style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            flex: 1, height: 3, borderRadius: 999,
            background: strength.score > i ? tone : 'var(--bg-inset)',
            transition: 'background 180ms',
          }} />
        ))}
      </div>
      <span className="field-hint" style={{ color: problem ? 'var(--accent-rose)' : undefined }}>
        {problem ?? strength.label}
      </span>
    </div>
  );
}
