'use client';

/* OTP-based authentication — no passwords.
 *
 *   Mode: Sign in (email only) or Sign up (full profile + terms).
 *   Last-used mode is persisted to localStorage key `wecycle.lastAuthMode`.
 *
 *   Step 1 — Email: user picks mode, fills fields, clicks "Send code".
 *            Supabase signInWithOtp() fires an 8-character code to the address.
 *            shouldCreateUser:true auto-provisions auth.users + profiles rows
 *            on first visit; sign-up mode also sends phone + department.
 *
 *   Step 2 — Code: user pastes / types the code from their inbox.
 *            verifyOtp({ type: 'email' }) succeeds → they're signed in.
 *
 * Demo fallback: when Supabase env vars are missing we drop into the
 * localStorage demo session so the screens stay navigable.
 *
 * App-review test account:
 *   Email: playreview@wecycle.page  Code: REVIEW01
 *   Drops into demo mode; shared only in Play Console sign-in details.
 */

import { useEffect, useRef, useState } from 'react';
import { Mail, User, ArrowLeft, IdCard, KeyRound, Loader2, Phone, BookOpen } from 'lucide-react';
import Modal from './Modal';
import { createDemoSession, initialsOf } from '../lib/demoAuth';
import { setDemoMode } from '../lib/demoMode';
import { supabase, hasSupabaseEnv } from '../lib/supabase';
import { track, EVT } from '../lib/analytics';
import { Logomark } from './Brand';

type Step = 'email' | 'code';
type AuthMode = 'signin' | 'signup';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
}

const EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/* Phone: optional leading +, optional country code digits, then 7–15 digits */
const PHONE_LIKE = /^\+?[0-9\s\-()]{7,20}$/;
const OTP_LENGTH = 8;
const RESEND_SECONDS = 30;
const AUTH_MODE_KEY = 'wecycle.lastAuthMode';

const REVIEW_EMAIL = 'playreview@wecycle.page';
const REVIEW_CODE = 'REVIEW01';

function readStoredMode(): AuthMode {
  if (typeof window === 'undefined') return 'signin';
  const v = localStorage.getItem(AUTH_MODE_KEY);
  return v === 'signup' ? 'signup' : 'signin';
}

export default function AuthModal({ open, onClose }: AuthModalProps) {
  const [step, setStep] = useState<Step>('email');
  const [mode, setMode] = useState<AuthMode>('signin');

  /* Form state */
  const [name, setName] = useState('');
  const [collegeId, setCollegeId] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [department, setDepartment] = useState('');
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [code, setCode] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [resendSecs, setResendSecs] = useState(0);
  const resendTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const codeInputRef = useRef<HTMLInputElement | null>(null);

  /* Load persisted mode on first open */
  useEffect(() => {
    if (open) setMode(readStoredMode());
  }, [open]);

  /* Autofocus code input when step changes */
  useEffect(() => {
    if (step === 'code') {
      const t = setTimeout(() => codeInputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [step]);

  /* Resend cooldown */
  useEffect(() => () => {
    if (resendTimer.current) clearInterval(resendTimer.current);
  }, []);
  const startResendCooldown = () => {
    setResendSecs(RESEND_SECONDS);
    if (resendTimer.current) clearInterval(resendTimer.current);
    resendTimer.current = setInterval(() => {
      setResendSecs(s => {
        if (s <= 1) { if (resendTimer.current) clearInterval(resendTimer.current); return 0; }
        return s - 1;
      });
    }, 1000);
  };

  const resetAll = () => {
    setStep('email');
    setName(''); setCollegeId(''); setEmail('');
    setPhone(''); setDepartment(''); setTermsAgreed(false); setCode('');
    setSubmitting(false); setError(null); setInfo(null); setResendSecs(0);
    if (resendTimer.current) clearInterval(resendTimer.current);
  };
  const handleClose = () => { resetAll(); onClose(); };

  const switchMode = (m: AuthMode) => {
    setMode(m);
    localStorage.setItem(AUTH_MODE_KEY, m);
    setError(null); setInfo(null);
  };

  /* ── Validation ── */
  const emailOk = EMAIL_LIKE.test(email.trim());
  const phoneOk = phone.trim() === '' || PHONE_LIKE.test(phone.trim());
  /* Sign-up: name required + terms must be checked + phone (if entered) valid */
  const signupReady = mode === 'signup'
    ? name.trim().length > 0 && emailOk && termsAgreed && phoneOk
    : emailOk;
  const cleanCode = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const codeOk = cleanCode.length === OTP_LENGTH;

  /* ── Send OTP ── */
  const sendCode = async () => {
    if (!signupReady || submitting) return;
    setError(null); setInfo(null); setSubmitting(true);
    track(EVT.sign_up_email_submitted, {
      mode,
      has_name: !!name.trim(),
      has_college_id: !!collegeId.trim(),
      has_phone: !!phone.trim(),
      has_department: !!department.trim(),
    });
    try {
      if (email.trim().toLowerCase() === REVIEW_EMAIL) {
        await new Promise(r => setTimeout(r, 200));
        setStep('code');
        setInfo('Reviewer account — enter the access code provided in Play Console.');
        startResendCooldown();
        return;
      }
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
      const { error: err } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: true,
          data: {
            full_name: name.trim() || undefined,
            initials: name.trim() ? initialsOf(name) : undefined,
            college_id: collegeId.trim() || undefined,
            ...(mode === 'signup' && phone.trim() ? { phone: phone.trim() } : {}),
            ...(mode === 'signup' && department.trim() ? { department: department.trim() } : {}),
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

  /* ── Verify OTP ── */
  const verifyCode = async () => {
    if (!codeOk || submitting) return;
    setError(null); setSubmitting(true);
    try {
      if (email.trim().toLowerCase() === REVIEW_EMAIL) {
        if (cleanCode === REVIEW_CODE) {
          setDemoMode(true);
          createDemoSession({ name: 'Play Reviewer', email: REVIEW_EMAIL, collegeId: '' });
          track(EVT.login, { method: 'reviewer' });
          handleClose();
        } else {
          setError("That code didn't match. Use the access code from Play Console.");
        }
        return;
      }
      const { error: err } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: cleanCode,
        type: 'email',
      });
      if (err) throw err;
      track(EVT.login, { method: 'otp' });
      handleClose();
    } catch (err) {
      track(EVT.sign_in_failed, { phase: 'verify_otp', reason: (err as Error).message?.slice(0, 80) });
      handleAuthError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const resendCode = async () => {
    if (resendSecs > 0 || submitting) return;
    await sendCode();
  };

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

  const onFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 'email') void sendCode();
    else                   void verifyCode();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={step === 'email' ? 'Welcome to Wecycle' : 'Enter the code'}
      footer={
        step === 'email' ? (
          <button
            type="submit"
            form="auth-form"
            disabled={!signupReady || submitting}
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
        {/* ── Brand logomark — centered above the form ── */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: -4, marginBottom: 2 }}>
          <Logomark size={56} alt="" />
        </div>
        {step === 'email' ? (
          <>
            {/* ── Segmented control ── */}
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

            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              {mode === 'signin'
                ? `Enter your email and we'll send you a ${OTP_LENGTH}-character code. No password needed.`
                : 'Create your Wecycle account. We\'ll email you a code to verify.'}
            </p>

            {/* Sign-up only: full name (required) */}
            {mode === 'signup' && (
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
                placeholder="you@gmail.com"
                value={email}
                maxLength={80}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                required
                autoFocus
              />
              {mode === 'signin' && (
                <span className="field-hint">
                  Any email works — your college address, a Gmail, anything you check often.
                </span>
              )}
            </div>

            {/* Sign-up only: college ID (optional) */}
            {mode === 'signup' && (
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
            {mode === 'signup' && (
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
            {mode === 'signup' && (
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
            {mode === 'signup' && (
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
                inputMode="text"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                maxLength={OTP_LENGTH}
                autoComplete="one-time-code"
                className="form-input"
                placeholder={'•'.repeat(OTP_LENGTH)}
                value={code}
                onChange={e =>
                  setCode(e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, OTP_LENGTH))
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
      </form>
    </Modal>
  );
}
