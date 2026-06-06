'use client';

/* OTP-based authentication — no passwords.
 *
 *   Step 1 — Email: user enters any valid email + (on sign-up) name.
 *            Click "Send code" → Supabase signInWithOtp() fires off a
 *            8-character code to the address. shouldCreateUser:true auto-
 *            provisions the auth.users + profiles rows if it's a first-
 *            time visitor.
 *
 *   Step 2 — Code: user pastes / types the code from their inbox.
 *            verifyOtp({ type: 'email' }) succeeds → they're signed in.
 *
 * The single flow handles both sign-up and sign-in — Supabase decides
 * which based on whether the email already exists.
 *
 * Email sender: the OTP comes from whatever address is configured under
 * Supabase Project → Auth → SMTP. To use wecycle.page@gmail.com:
 *   1. Generate an App Password for the Google account
 *   2. Add SMTP host=smtp.gmail.com, port=587, user=wecycle.page@gmail.com,
 *      pass=<app-pwd>, sender_email=wecycle.page@gmail.com, sender_name=Wecycle
 *
 * Demo fallback: when Supabase env vars are missing we drop into the
 * localStorage demo session as before so the screens stay navigable.
 */

import { useEffect, useRef, useState } from 'react';
import { Mail, User, ArrowLeft, IdCard, KeyRound, Loader2 } from 'lucide-react';
import Modal from './Modal';
import { createDemoSession, initialsOf } from '../lib/demoAuth';
import { setDemoMode } from '../lib/demoMode';
import { supabase, hasSupabaseEnv } from '../lib/supabase';
import { track, EVT } from '../lib/analytics';

type Step = 'email' | 'code';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
}

/* Simple "looks like an email" check. We deliberately stay permissive —
   anything more elaborate just rejects real addresses with + tags, sub-
   domains, etc. Real validation happens server-side when the OTP fails
   to deliver. */
const EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/* OTP length matches Supabase's built-in email sender output:
 *   - Supabase's default Magic-Link / OTP template emits an **8-character**
 *     code (alphanumeric, mostly digits but occasionally letters depending
 *     on the project's GOTRUE_OTP_LENGTH).
 *   - If/when we move to a custom SMTP with a different code length, this
 *     is the only knob to change.
 * The input also accepts letters now (some Supabase codes are alphanumeric),
 * not just digits — see the `cleaned` normalisation in handleVerify below. */
const OTP_LENGTH = 8;
/* Cool-down between resends so users don't spam the SMTP server (which
   would also trip Supabase's own rate limiter). */
const RESEND_SECONDS = 30;

/* ── App-review test account ──
 * Wecycle signs in by emailing a one-time code, which means an external
 * reviewer (e.g. Google Play's review team) can't receive the code. To give
 * them working access without exposing a real inbox, this specific email +
 * fixed code drops straight into Wecycle's local demo session — a fully
 * functional, seeded version of the app that touches no real backend data.
 * These credentials are intended to be shared ONLY in Play Console's
 * "App access / sign-in details" field. */
const REVIEW_EMAIL = 'playreview@wecycle.page';
const REVIEW_CODE = 'REVIEW01';

export default function AuthModal({ open, onClose }: AuthModalProps) {
  const [step, setStep] = useState<Step>('email');

  /* Form state — preserved across step transitions so users can go back. */
  const [name, setName] = useState('');
  const [collegeId, setCollegeId] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [resendSecs, setResendSecs] = useState(0);
  const resendTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const codeInputRef = useRef<HTMLInputElement | null>(null);

  /* When the user lands on the code step, autofocus the input so they can
     paste the code from their email straight in. */
  useEffect(() => {
    if (step === 'code') {
      const t = setTimeout(() => codeInputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [step]);

  /* Resend cooldown ticker — drives the disabled state + label on the
     "Resend code" link. Cleaned up on unmount + close. */
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
    setStep('email');
    setName('');
    setCollegeId('');
    setEmail('');
    setCode('');
    setSubmitting(false);
    setError(null);
    setInfo(null);
    setResendSecs(0);
    if (resendTimer.current) clearInterval(resendTimer.current);
  };
  const handleClose = () => { resetAll(); onClose(); };

  /* ── Validation ─────────────────────────────── */
  const emailOk = EMAIL_LIKE.test(email.trim());
  /* Normalise to alphanumeric — Supabase's built-in OTP is *usually*
   * digits but can include letters depending on project config. We strip
   * whitespace + punctuation but keep letters so the user can paste the
   * code as-is from their email. */
  const cleanCode = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const codeOk    = cleanCode.length === OTP_LENGTH;

  /* ── Send OTP ───────────────────────────────── */
  const sendCode = async () => {
    if (!emailOk || submitting) return;
    setError(null);
    setInfo(null);
    setSubmitting(true);
    track(EVT.sign_up_email_submitted, { has_name: !!name.trim(), has_college_id: !!collegeId.trim() });
    try {
      /* Reviewer account → skip the real OTP send, just advance to the code
         step. The fixed code is verified locally in verifyCode below. */
      if (email.trim().toLowerCase() === REVIEW_EMAIL) {
        await new Promise(r => setTimeout(r, 200));
        setStep('code');
        setInfo('Reviewer account — enter the access code provided in Play Console.');
        startResendCooldown();
        return;
      }
      if (!hasSupabaseEnv) {
        /* No backend → drop into the demo session like the old auth did. */
        await new Promise(r => setTimeout(r, 250));
        createDemoSession({
          name: name.trim() || email.split('@')[0],
          email: email.trim(),
          collegeId: collegeId.trim(),
        });
        track(EVT.login, { method: 'demo' });
        handleClose();
        return;
      }
      const { error: err } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          /* Auto-create the auth.users row if this is a new visitor. The
             on-auth-user-created trigger handles the profile insert; we
             pass name + initials + (optional) college_id so the profile
             row is meaningful from the first verify. */
          shouldCreateUser: true,
          data: {
            full_name: name.trim() || undefined,
            initials:  name.trim() ? initialsOf(name) : undefined,
            college_id: collegeId.trim() || undefined,
          },
        },
      });
      if (err) throw err;
      track(EVT.sign_up_otp_sent);
      setStep('code');
      setInfo(`We sent an ${OTP_LENGTH}-character code to ${email.trim()}. It expires in 10 minutes.`);
      startResendCooldown();
    } catch (err) {
      track(EVT.sign_in_failed, { phase: 'send_otp', reason: (err as Error).message?.slice(0, 80) });
      handleAuthError(err);
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Verify OTP ─────────────────────────────── */
  const verifyCode = async () => {
    if (!codeOk || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      /* Reviewer account → verify the fixed code locally and open the demo
         session (no backend call, no real data touched). */
      if (email.trim().toLowerCase() === REVIEW_EMAIL) {
        if (cleanCode === REVIEW_CODE) {
          /* Flip demo mode ON so the app renders seeded data (createDemoSession
             alone only creates the auth session — without this the reviewer
             would hit empty live feeds). */
          setDemoMode(true);
          createDemoSession({ name: 'Play Reviewer', email: REVIEW_EMAIL, collegeId: '' });
          track(EVT.login, { method: 'reviewer' });
          handleClose();
        } else {
          setError("That code didn't match. Use the access code from Play Console.");
        }
        return;
      }
      /* Send the alphanumeric-cleaned code (handles paste-with-spaces). */
      const { error: err } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: cleanCode,
        /* `email` works for both sign-in and the first verify of a
           fresh user. Supabase no longer distinguishes the two for OTP. */
        type: 'email',
      });
      if (err) throw err;
      /* GA4 reserves `login` for every sign-in and `sign_up` for net-new
       * users. We can't tell from verifyOtp's response which case applied,
       * so we fire `login` always; `sign_up` is implicitly captured on
       * GA4's side by their first-seen heuristic. */
      track(EVT.login, { method: 'otp' });
      handleClose();
    } catch (err) {
      track(EVT.sign_in_failed, { phase: 'verify_otp', reason: (err as Error).message?.slice(0, 80) });
      handleAuthError(err);
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Resend ─────────────────────────────────── */
  const resendCode = async () => {
    if (resendSecs > 0 || submitting) return;
    /* Reuse sendCode — it'll just push a fresh OTP to the same address. */
    await sendCode();
  };

  /* Translate raw Supabase error strings into copy that doesn't look like
     a stack trace to a community-app user. */
  const handleAuthError = (err: unknown) => {
    const msg = (err as Error).message || 'Something went wrong';
    if (/rate limit|too many requests/i.test(msg)) {
      setError("We've sent too many codes recently — try again in a minute.");
    } else if (/expired/i.test(msg)) {
      setError('That code has expired. Tap "Resend code" to get a fresh one.');
    } else if (/invalid|incorrect|token/i.test(msg)) {
      setError("That code didn't match. Double-check it (or resend).");
    } else if (/email/i.test(msg) && /valid/i.test(msg)) {
      setError("That doesn't look like a valid email. Try again.");
    } else if (/network/i.test(msg)) {
      setError("Couldn't reach the server. Check your connection and try again.");
    } else {
      setError(msg);
    }
  };

  /* Allow Enter to advance from email → code on the first step. */
  const onFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 'email') void sendCode();
    else                   void verifyCode();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={step === 'email' ? 'Sign in to Wecycle' : 'Enter the code'}
      footer={
        step === 'email' ? (
          <button
            type="submit"
            form="auth-form"
            disabled={!emailOk || submitting}
            className="btn btn-primary"
            style={{ flex: 1 }}
          >
            {submitting
              ? <><Loader2 size={15} style={{ animation: 'spin 0.9s linear infinite', marginRight: 6, verticalAlign: '-2px' }} />Sending…</>
              : 'Send code'}
          </button>
        ) : (
          <button
            type="submit"
            form="auth-form"
            disabled={!codeOk || submitting}
            className="btn btn-primary"
            style={{ flex: 1 }}
          >
            {submitting
              ? <><Loader2 size={15} style={{ animation: 'spin 0.9s linear infinite', marginRight: 6, verticalAlign: '-2px' }} />Verifying…</>
              : 'Verify & sign in'}
          </button>
        )
      }
    >
      <form id="auth-form" onSubmit={onFormSubmit} noValidate
        style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        {step === 'email' ? (
          <>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Use any email — we'll send you an {OTP_LENGTH}-character code to sign in.
              No password to remember.
            </p>

            {/* Optional profile fields — they help your profile feel
               more "you" from day one, but the OTP works without them
               too. Skippable on first sign-in; can be filled in later
               on the Account page. */}
            <div className="field">
              <label htmlFor="auth-name" className="field-label">
                <User size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
                Full name <span className="field-hint" style={{ fontWeight: 400 }}>(optional)</span>
              </label>
              <input
                id="auth-name"
                className="form-input"
                placeholder="What should we call you?"
                value={name}
                onChange={e => setName(e.target.value)}
                autoComplete="name"
                maxLength={60}
              />
            </div>

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
                placeholder="you@gmail.com"
                value={email}
                maxLength={80}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                required
                autoFocus
              />
              <span className="field-hint">
                Any email works — your college address, a Gmail, anything you check often.
              </span>
            </div>

            {/* College ID is still useful for storefronts to surface but
               we drop the requirement — set it later in Account if you
               don't want to type it now. */}
            <div className="field">
              <label htmlFor="auth-collegeid" className="field-label">
                <IdCard size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
                College ID <span className="field-hint" style={{ fontWeight: 400 }}>(optional)</span>
              </label>
              <input
                id="auth-collegeid"
                className="form-input"
                placeholder="e.g. 230905123"
                inputMode="numeric"
                pattern="[0-9]*"
                value={collegeId}
                onChange={e => setCollegeId(e.target.value.replace(/\D+/g, ''))}
                autoComplete="off"
              />
            </div>
          </>
        ) : (
          <>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Check{' '}
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{email}</span>{' '}
              for an {OTP_LENGTH}-character code. Paste it below.
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
                /* Switched from numeric-only to text — Supabase's built-in
                   OTP sender can include letters, so we accept alphanumeric.
                   The cleanCode normaliser handles spaces / dashes if the
                   user pastes the code formatted. */
                inputMode="text"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                maxLength={OTP_LENGTH}
                autoComplete="one-time-code"
                className="form-input"
                placeholder={'•'.repeat(OTP_LENGTH)}
                value={code}
                /* Strip whitespace + punctuation live; keep alphanumerics. */
                onChange={e =>
                  setCode(e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, OTP_LENGTH))
                }
                style={{
                  textAlign: 'center',
                  /* Tightened from 22/0.4em (sized for 6 chars) so the
                     new 8-char code fits cleanly on narrow phones. */
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
                onClick={() => { setStep('email'); setCode(''); setError(null); setInfo(null); }}
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
          </>
        )}

        {/* Info + error banners — short, friendly, dismissible by next action */}
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
      </form>
    </Modal>
  );
}
