'use client';

/* Email + PASSWORD authentication. An emailed code is used ONLY to prove the
 * address is real — at sign-up, and when setting/resetting a password.
 *
 *   Sign in    — email + password → signInWithPassword(). No email sent.
 *   Sign up    — details + password → we email a code → verifyOtp() confirms
 *                the address and opens a session → updateUser() stores the
 *                password they chose. One email, ever.
 *   Set/reset  — email → code → choose a new password. This is also how the
 *                pre-password accounts (who never had one) get in.
 *
 * Why the code is a *sign-in* OTP rather than Supabase's "confirm signup"
 * link: the magic-link template on this project already emits a numeric code,
 * so this path needs no dashboard template edits and sends exactly one email.
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
 * App-review test account: playreview@wecycle.page + REVIEW_PASSWORD below —
 * signs into DEMO mode (never real data). Mirrored in PLAY_CONSOLE_LAUNCH.md.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Mail, User, ArrowLeft, IdCard, KeyRound, Loader2, Phone, BookOpen, Lock, Eye, EyeOff,
  GraduationCap, LifeBuoy,
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

type Step = 'credentials' | 'confirm' | 'newpassword';
type AuthMode = 'signin' | 'signup';
/** What the emailed code is currently proving. */
type Pending = 'signup' | 'reset' | null;

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
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

export default function AuthModal({ open, onClose }: AuthModalProps) {
  const [step, setStep] = useState<Step>('credentials');
  const [mode, setMode] = useState<AuthMode>('signin');
  /* Forgot / set-a-password flow — collects email only, ends at 'newpassword'. */
  const [resetting, setResetting] = useState(false);
  const [pending, setPending] = useState<Pending>(null);

  const [name, setName] = useState('');
  const [collegeId, setCollegeId] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [department, setDepartment] = useState('');
  const [termsAgreed, setTermsAgreed] = useState(false);
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

  useEffect(() => {
    if (open) setMode(readStoredMode());
  }, [open]);

  useEffect(() => {
    if (step === 'confirm') {
      const t = setTimeout(() => codeInputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [step]);

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
    setName(''); setCollegeId(''); setEmail('');
    setPhone(''); setDepartment(''); setTermsAgreed(false);
    setPassword(''); setPassword2(''); setShowPassword(false); setCode('');
    pendingPassword.current = '';
    setSubmitting(false); setError(null); setInfo(null); setResendSecs(0);
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
  const phoneOk = phone.trim() === '' || PHONE_LIKE.test(phone.trim());
  /* Only surfaced once they've typed enough to be worth judging. */
  const passwordProblem = password ? validatePassword(password, { email, name }) : null;
  const passwordsMatch = password.length > 0 && password === password2;
  const strength = passwordStrength(password);

  const credentialsReady =
    resetting ? emailOk && domainOk
    : mode === 'signup'
      ? name.trim().length > 0 && emailOk && domainOk && termsAgreed && phoneOk
        && !passwordProblem && passwordsMatch
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

  /* ── Email a code (sign-up confirmation, or set/reset password) ── */
  const sendCode = async (purpose: Exclude<Pending, null>) => {
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        /* Sign-up provisions the account; reset must never create one (that
           would silently turn a typo into a new account). */
        shouldCreateUser: purpose === 'signup',
        ...(purpose === 'signup' ? {
          data: {
            full_name: name.trim() || undefined,
            initials: name.trim() ? initialsOf(name) : undefined,
            college_id: collegeId.trim() || undefined,
            ...(phone.trim() ? { phone: phone.trim() } : {}),
            ...(department.trim() ? { department: department.trim() } : {}),
          },
        } : {}),
      },
    });
    if (err) throw err;
    setPending(purpose);
    setStep('confirm');
    setCode('');
    setInfo(`We emailed a code to ${email.trim()}. It expires in 10 minutes.`);
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
          createDemoSession({ name: 'Play Reviewer', email: REVIEW_EMAIL, collegeId: '' });
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
          collegeId: collegeId.trim(),
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
          has_college_id: !!collegeId.trim(),
          has_phone: !!phone.trim(),
          has_department: !!department.trim(),
        });
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
      track(EVT.login, { method: 'password' });
      handleClose();
    } catch (err) {
      const msg = (err as Error)?.message ?? '';
      /* Signed up but never confirmed → the password is fine, the address
         isn't proven yet. Send a fresh code and put them on the code step
         instead of showing a dead end. */
      if (/email not confirmed/i.test(msg)) {
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
        resetting ? 'send_reset_code' : mode === 'signup' ? 'send_signup_code' : 'password_signin',
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
    : mode === 'signup' ? (submitting ? 'Sending…' : 'Create account')
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
                  : 'Create your account. We’ll email one code to confirm your address — after that it’s just your password.'}
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
                onChange={e => setEmail(e.target.value)}
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
              ) : emailOk && isManipalEmail(email) && mode === 'signup' && !resetting ? (
                <span className="field-hint" style={{ color: '#16A34A' }}>
                  Manipal address recognised.
                </span>
              ) : null}
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

            {/* Sign-up only: college ID (optional) */}
            {mode === 'signup' && !resetting && (
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
            )}

            {/* Sign-up only: phone (optional) */}
            {mode === 'signup' && !resetting && (
              <div className="field">
                <label htmlFor="auth-phone" className="field-label">
                  <Phone size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
                  Phone <span className="field-hint" style={{ fontWeight: 400 }}>(optional)</span>
                </label>
                <input
                  id="auth-phone"
                  type="tel"
                  inputMode="tel"
                  className="form-input"
                  placeholder="+91 98765 43210"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  autoComplete="tel"
                  maxLength={25}
                />
                {phone.trim() !== '' && !phoneOk && (
                  <span className="field-hint" style={{ color: 'var(--accent-rose)' }}>
                    Enter a valid phone number with optional country code.
                  </span>
                )}
              </div>
            )}

            {/* Sign-up only: department / course (optional) */}
            {mode === 'signup' && !resetting && (
              <div className="field">
                <label htmlFor="auth-department" className="field-label">
                  <BookOpen size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
                  Department / course <span className="field-hint" style={{ fontWeight: 400 }}>(optional)</span>
                </label>
                <input
                  id="auth-department"
                  className="form-input"
                  placeholder="e.g. Computer Science"
                  value={department}
                  onChange={e => setDepartment(e.target.value.slice(0, 60))}
                  autoComplete="off"
                  maxLength={60}
                />
              </div>
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
