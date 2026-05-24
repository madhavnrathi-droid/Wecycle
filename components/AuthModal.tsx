'use client';

/* Password-based authentication.
 *
 *   - **Sign in** mode: existing users enter email + password.
 *   - **Sign up** mode: new users enter full name + college ID + email +
 *     password. We hand the extra profile fields to Supabase as user_metadata
 *     so the profiles trigger can persist them on first login.
 *
 * Password policy: minimum 6 characters, no character-class requirements.
 * The Supabase project's GoTrue config must mirror this (password_min_length=6)
 * so the server doesn't reject what the client accepts.
 *
 * Fallback: when Supabase env vars are missing (the stub client is in play),
 * we drop into the localStorage demo path so the screens are still navigable
 * for early UX testing.
 */

import { useState } from 'react';
import { Mail, User, ArrowLeft, IdCard, Lock, Eye, EyeOff } from 'lucide-react';
import Modal from './Modal';
import { createDemoSession, initialsOf } from '../lib/demoAuth';
import { supabase, hasSupabaseEnv } from '../lib/supabase';

type Tab = 'signin' | 'signup';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
}

/* Single source of truth for the password rule — keep this in sync with the
   `password_min_length` setting on the Supabase project. */
export const PASSWORD_MIN_LENGTH = 6;

/* Accept either a MAHE learner address (`@learner.manipal.edu`) or a
   faculty / staff address (`@manipal.edu`). */
const MAHE_EMAIL = /^[^\s@]+@(learner\.)?manipal\.edu$/i;
/* Admin escape hatch — the single hard-coded moderation account. We allow it
   alongside MAHE addresses so the admin can sign in from this same modal. */
const ADMIN_EMAIL = 'wecycle.page@gmail.com';
const isAllowedEmail = (e: string) =>
  MAHE_EMAIL.test(e.trim()) || e.trim().toLowerCase() === ADMIN_EMAIL;

export default function AuthModal({ open, onClose }: AuthModalProps) {
  const [tab, setTab] = useState<Tab>('signin');
  const [showPassword, setShowPassword] = useState(false);

  /* Form state — kept on the parent so toggling tabs doesn't wipe entered values */
  const [name, setName] = useState('');
  const [collegeId, setCollegeId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetAll = () => {
    setTab('signin');
    setShowPassword(false);
    setName('');
    setCollegeId('');
    setEmail('');
    setPassword('');
    setSubmitting(false);
    setError(null);
  };

  const handleClose = () => { resetAll(); onClose(); };

  /* ── Validation ─────────────────────────────── */

  const emailOk    = isAllowedEmail(email);
  const passwordOk = password.length >= PASSWORD_MIN_LENGTH;
  const nameOk     = name.trim().length >= 2;
  const collegeOk  = collegeId.trim().length >= 3;

  const canSubmit =
    tab === 'signin'
      ? emailOk && passwordOk
      : emailOk && passwordOk && nameOk && collegeOk;

  /* ── Submit handlers ───────────────────────── */

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      if (!hasSupabaseEnv) {
        /* Demo deploy (no env vars) — drop into localStorage session so the
           tester can navigate the app. Password isn't checked because there's
           no auth backend to check it against. */
        await new Promise(r => setTimeout(r, 280));
        createDemoSession({
          name: nameOk ? name.trim() : email.split('@')[0],
          email: email.trim(),
          collegeId: collegeOk ? collegeId.trim() : '',
        });
        handleClose();
        return;
      }

      if (tab === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (err) throw err;
        handleClose();
      } else {
        /* Sign up → immediate sign-in. Our DB trigger `wecycle_autoconfirm`
           pre-fills email_confirmed_at on every new auth.users row, so no
           confirmation link is ever sent and the credentials are usable on
           the very next request. */
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            /* Forwarded to the profiles row via the on-auth-user-created
               trigger / RLS-friendly upsert in lib/api/auth.ts. */
            data: {
              full_name: name.trim(),
              initials:  initialsOf(name),
              college_id: collegeId.trim(),
            },
          },
        });
        if (err) throw err;

        /* When the project's "Confirm email" toggle happens to still be on,
           signUp returns `data.session === null`. Our trigger has already
           confirmed the user at the DB level, so an immediate password-based
           sign-in resolves to a real session without the user noticing. */
        if (!data.session) {
          const { error: signInErr } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });
          if (signInErr) throw signInErr;
        }
        handleClose();
      }
    } catch (err) {
      const msg = (err as Error).message || 'Something went wrong';
      /* Translate the most common Supabase error strings into friendlier copy. */
      if (/invalid login credentials/i.test(msg)) {
        setError("That email and password don't match — try again, or sign up if you're new.");
      } else if (/user already registered/i.test(msg)) {
        setError("That email already has an account. Switch to Sign in.");
      } else if (/password.*should be at least/i.test(msg)) {
        setError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
      } else if (/network/i.test(msg)) {
        setError("Couldn't reach the server. Check your connection and try again.");
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Render ─────────────────────────────────── */

  const submitLabel =
    submitting
      ? (tab === 'signin' ? 'Signing in…' : 'Creating account…')
      : (tab === 'signin' ? 'Sign in'    : 'Create account');

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={tab === 'signin' ? 'Welcome back' : 'Join Wecycle'}
      footer={
        <button
          type="submit"
          form="auth-form"
          disabled={!canSubmit || submitting}
          className="btn btn-primary"
          style={{ flex: 1 }}
        >
          {submitLabel}
        </button>
      }
    >
      <form id="auth-form" onSubmit={submit} noValidate
        style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        {/* Tab toggle */}
        <div className="segmented" role="tablist" aria-label="Sign in or sign up">
          <button
            type="button"
            role="tab"
            onClick={() => { setTab('signin'); setError(null); }}
            aria-selected={tab === 'signin'}
            data-active={tab === 'signin' || undefined}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            onClick={() => { setTab('signup'); setError(null); }}
            aria-selected={tab === 'signup'}
            data-active={tab === 'signup' || undefined}
          >
            Sign up
          </button>
        </div>

        {tab === 'signup' && (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            We just need a couple of details to set up your profile.
          </p>
        )}

        {/* ── Sign-up only: name + college ID ── */}
        {tab === 'signup' && (
          <>
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
                inputMode="numeric"
                pattern="[0-9]*"
                className="form-input"
                placeholder="e.g. 230905123"
                value={collegeId}
                onChange={e => setCollegeId(e.target.value.replace(/\D+/g, ''))}
                autoComplete="off"
                required
              />
            </div>
          </>
        )}

        {/* ── Email ── */}
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
            /* Max 80 chars during sign-up keeps the email column from being
             * abused; matches typical max-length of the email column on
             * Supabase (255) while staying well within MAHE-mail bounds. */
            maxLength={80}
            onChange={e => setEmail(e.target.value)}
            autoComplete="email"
            required
            autoFocus={tab === 'signin'}
          />
          <span className="field-hint">
            Use your MAHE email — <strong>@learner.manipal.edu</strong> or <strong>@manipal.edu</strong>.
          </span>
        </div>

        {/* ── Password ── */}
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
              placeholder={tab === 'signup' ? `At least ${PASSWORD_MIN_LENGTH} characters` : 'Your password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete={tab === 'signin' ? 'current-password' : 'new-password'}
              minLength={PASSWORD_MIN_LENGTH}
              required
              style={{ paddingRight: 40 }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(s => !s)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', padding: 6,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {showPassword ? <EyeOff size={15} strokeWidth={1.8} /> : <Eye size={15} strokeWidth={1.8} />}
            </button>
          </div>
          {tab === 'signup' && (
            <span className="field-hint">
              Minimum {PASSWORD_MIN_LENGTH} characters. No other restrictions.
            </span>
          )}
        </div>

        {/* ── Status ── */}
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
