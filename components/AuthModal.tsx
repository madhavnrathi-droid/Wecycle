'use client';

import { useState } from 'react';
import { Mail, Phone, User, ArrowLeft, IdCard } from 'lucide-react';
import Modal from './Modal';
import { createDemoSession, initialsOf } from '../lib/demoAuth';
// When DEMO_MODE is set to false, re-import `supabase` from '../lib/supabase'
// to use real `signInWithOtp` / `verifyOtp` calls.

type Mode = 'email' | 'phone';
type Step = 'identify' | 'otp';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
}

/* Demo mode: any 6-digit OTP works. Real OTP wiring lives commented inline
   below — drop the demo path once SMTP / SMS providers are configured. */
const DEMO_MODE = true;

export default function AuthModal({ open, onClose }: AuthModalProps) {
  const [mode, setMode] = useState<Mode>('email');
  const [step, setStep] = useState<Step>('identify');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [collegeId, setCollegeId] = useState('');
  const [otp, setOtp] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  const resetAll = () => {
    setMode('email');
    setStep('identify');
    setName('');
    setEmail('');
    setPhone('');
    setCollegeId('');
    setOtp('');
    setError(null);
    setSubmitting(false);
  };

  const handleClose = () => {
    resetAll();
    onClose();
  };

  const sendCode = async () => {
    setError(null);
    setSubmitting(true);
    try {
      if (DEMO_MODE) {
        /* Demo path: skip real network. Pretend the code was sent. */
        await new Promise(r => setTimeout(r, 400));
        setStep('otp');
        return;
      }

      // Real OTP path — uncomment once SMTP / SMS is configured.
      // const data = { full_name: name.trim(), initials: initialsOf(name) };
      // const { error: err } = mode === 'email'
      //   ? await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true, data } })
      //   : await supabase.auth.signInWithOtp({ phone, options: { shouldCreateUser: true, data } });
      // if (err) throw err;
      // setStep('otp');
    } catch (e) {
      setError((e as Error).message ?? 'Could not send code');
    } finally {
      setSubmitting(false);
    }
  };

  const verifyCode = async () => {
    setError(null);
    setSubmitting(true);
    try {
      if (DEMO_MODE) {
        if (!/^\d{6}$/.test(otp)) {
          throw new Error('Enter the 6-digit code');
        }
        await new Promise(r => setTimeout(r, 300));
        createDemoSession({
          name: name.trim(),
          email: mode === 'email' ? email.trim() : undefined,
          phone: mode === 'phone' ? phone.trim() : undefined,
          collegeId: collegeId.trim(),
        });
        handleClose();
        return;
      }

      // Real verification path — uncomment when real OTP is wired.
      // const { error: err } = mode === 'email'
      //   ? await supabase.auth.verifyOtp({ email, token: otp, type: 'email' })
      //   : await supabase.auth.verifyOtp({ phone, token: otp, type: 'sms' });
      // if (err) throw err;
      // if (name.trim()) {
      //   const { data: { user } } = await supabase.auth.getUser();
      //   if (user) {
      //     await supabase.from('profiles').update({
      //       full_name: name.trim(),
      //       initials: initialsOf(name),
      //     }).eq('id', user.id);
      //   }
      // }
      // handleClose();
    } catch (e) {
      setError((e as Error).message ?? 'Invalid code');
    } finally {
      setSubmitting(false);
    }
  };

  const resend = async () => {
    setResending(true);
    setError(null);
    try {
      if (DEMO_MODE) {
        await new Promise(r => setTimeout(r, 400));
        return;
      }
      // Real resend — same as sendCode().
    } catch (e) {
      setError((e as Error).message ?? 'Could not resend');
    } finally {
      setResending(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 'identify') void sendCode();
    else void verifyCode();
  };

  const canContinue =
    name.trim().length >= 2 &&
    collegeId.trim().length >= 3 &&
    (mode === 'email' ? /.+@.+\..+/.test(email) : phone.replace(/\D/g, '').length >= 8);

  const target = mode === 'email' ? email : phone;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={step === 'identify' ? 'Get started' : 'Verify it\'s you'}
      footer={
        <>
          {step === 'otp' && (
            <button
              type="button"
              onClick={() => { setStep('identify'); setOtp(''); setError(null); }}
              className="btn btn-secondary"
              style={{ flex: 1 }}
            >
              <ArrowLeft size={14} strokeWidth={2} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
              Back
            </button>
          )}
          <button
            type="submit"
            form="auth-form"
            disabled={submitting || (step === 'identify' ? !canContinue : otp.length < 6)}
            className="btn btn-primary"
            style={{ flex: step === 'otp' ? 2 : 1 }}
          >
            {submitting
              ? (step === 'identify' ? 'Sending…' : 'Verifying…')
              : (step === 'identify' ? 'Send code' : 'Verify')}
          </button>
        </>
      }
    >
      <form id="auth-form" onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {step === 'identify' ? (
          <>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              We'll send a one-time code to confirm it's you. No password needed.
            </p>

            {/* Email / Phone toggle */}
            <div className="segmented" role="tablist" aria-label="Sign-in method">
              <button
                type="button"
                role="tab"
                onClick={() => setMode('email')}
                aria-selected={mode === 'email'}
                data-active={mode === 'email' || undefined}
              >
                <Mail size={13} strokeWidth={2} style={{ display: 'inline', marginRight: 5, verticalAlign: '-2px' }} />
                Email
              </button>
              <button
                type="button"
                role="tab"
                onClick={() => setMode('phone')}
                aria-selected={mode === 'phone'}
                data-active={mode === 'phone' || undefined}
              >
                <Phone size={13} strokeWidth={2} style={{ display: 'inline', marginRight: 5, verticalAlign: '-2px' }} />
                Phone
              </button>
            </div>

            {/* Name + College ID side by side on wider screens */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
              <div className="field">
                <label htmlFor="auth-name" className="field-label">
                  <User size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
                  Full name <span className="required" aria-hidden="true">*</span>
                </label>
                <input
                  id="auth-name"
                  type="text"
                  className="form-input"
                  placeholder="Ananya Sharma"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  autoComplete="name"
                  required
                  autoFocus
                />
              </div>

              <div className="field">
                <label htmlFor="auth-collegeid" className="field-label">
                  <IdCard size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
                  College ID <span className="required" aria-hidden="true">*</span>
                </label>
                <input
                  id="auth-collegeid"
                  type="text"
                  className="form-input"
                  placeholder="e.g. 230905123"
                  value={collegeId}
                  onChange={e => setCollegeId(e.target.value)}
                  autoComplete="off"
                  required
                />
              </div>
            </div>

            {/* Email or phone */}
            {mode === 'email' ? (
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
                  placeholder="ananya@learner.manipal.edu"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
                <span className="field-hint">
                  Tip: any email works. MAHE / learner.manipal.edu addresses get community matching first.
                </span>
              </div>
            ) : (
              <div className="field">
                <label htmlFor="auth-phone" className="field-label">
                  <Phone size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
                  Phone <span className="required" aria-hidden="true">*</span>
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
                  required
                />
                <span className="field-hint">
                  Include country code (e.g. +91 for India). We'll text you a code.
                </span>
              </div>
            )}
          </>
        ) : (
          <>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              We sent a 6-digit code to <strong style={{ color: 'var(--text-primary)' }}>{target}</strong>.
            </p>

            <div className="field">
              <label htmlFor="auth-otp" className="field-label">One-time code</label>
              <input
                id="auth-otp"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                className="form-input otp-input"
                placeholder="• • • • • •"
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                autoComplete="one-time-code"
                autoFocus
                required
                aria-required="true"
              />
            </div>

            <button
              type="button"
              onClick={resend}
              disabled={resending}
              style={{
                background: 'none', border: 'none', padding: '4px 0',
                fontSize: 12, fontWeight: 500,
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              {resending ? 'Resending…' : "Didn't get a code? Resend"}
            </button>
          </>
        )}

        {error && (
          <div role="alert" style={{
            padding: '10px 12px',
            background: 'rgba(237,46,80,0.10)',
            border: '1px solid rgba(237,46,80,0.25)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--accent-rose)',
            fontSize: 12, fontWeight: 500,
          }}>
            {error}
          </div>
        )}

        <p style={{
          margin: '4px 0 0',
          fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5,
        }}>
          By continuing you agree to our terms. We never share your contact.
        </p>
      </form>
    </Modal>
  );
}
