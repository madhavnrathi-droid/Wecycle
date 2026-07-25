'use client';

/* ── Change password (signed in) ────────────────────────────────────────────
 * A dedicated full page, per the app's convention that focused tasks get their
 * own surface rather than a modal.
 *
 * We ask for the CURRENT password even though Supabase's updateUser() doesn't
 * require it — a session alone shouldn't be enough to lock the real owner out
 * of their account on a borrowed or unlocked device. It's verified by signing
 * in with it, which is the only way to check a password from the client.
 *
 * Accounts created before passwords existed have a random server-side one they
 * never knew, so "I don't know my current password" routes them to the emailed
 * -code reset in the auth modal instead of dead-ending here.
 */

import { useState } from 'react';
import { ChevronLeft, Lock, Eye, EyeOff, Check, Loader2 } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { supabase, hasSupabaseEnv } from '../lib/supabase';
import { validatePassword, passwordStrength, humanAuthError, MIN_PASSWORD_LENGTH } from '../lib/password';
import { track, EVT } from '../lib/analytics';
import { haptics } from '../lib/haptics';

interface ChangePasswordScreenProps {
  onBack: () => void;
  /** Opens the auth modal's emailed-code reset (for "I don't know it"). */
  onForgot?: () => void;
}

export default function ChangePasswordScreen({ onBack, onForgot }: ChangePasswordScreenProps) {
  const { user, profile, isDemo } = useAuth();
  const email = (user as { email?: string } | null)?.email ?? profile?.email ?? '';

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [reveal, setReveal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const problem = next ? validatePassword(next, { email, name: profile?.full_name ?? undefined }) : null;
  const matches = next.length > 0 && next === confirm;
  const strength = passwordStrength(next);
  const ready = !!current && !!next && !problem && matches && !saving;

  const save = async () => {
    if (!ready) return;
    setSaving(true);
    setError(null);
    try {
      if (isDemo || !hasSupabaseEnv) {
        await new Promise(r => setTimeout(r, 350));
        setDone(true);
        haptics.success();
        return;
      }
      /* Prove they know the current password before rotating it. */
      const { error: authErr } = await supabase.auth.signInWithPassword({ email, password: current });
      if (authErr) {
        setError(
          /invalid login credentials/i.test(authErr.message)
            ? 'That current password isn’t right. If you never set one, use “I don’t know my current password”.'
            : humanAuthError(authErr.message, 'signin'),
        );
        haptics.error();
        return;
      }
      const { error: err } = await supabase.auth.updateUser({ password: next });
      if (err) throw err;
      track(EVT.password_set, { context: 'change' });
      haptics.success();
      setDone(true);
    } catch (err) {
      setError(humanAuthError((err as Error).message, 'reset'));
      haptics.error();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', paddingBottom: 40 }}>
      <header style={{
        position: 'sticky', top: 0, zIndex: 30,
        display: 'flex', alignItems: 'center', gap: 12,
        padding: 'calc(10px + env(safe-area-inset-top)) 16px 10px',
        background: 'var(--bg-base)',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <button onClick={onBack} aria-label="Back" className="theme-toggle">
          <ChevronLeft size={20} strokeWidth={1.8} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: '-0.015em', color: 'var(--text-primary)' }}>
            Password
          </h1>
          {email && (
            <p style={{
              margin: '1px 0 0', fontSize: 12, color: 'var(--text-muted)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {email}
            </p>
          )}
        </div>
      </header>

      <div style={{ maxWidth: 520, margin: '0 auto', padding: '20px 20px 0' }}>
        {done ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div aria-hidden="true" style={{
              width: 52, height: 52, borderRadius: 999, margin: '0 auto 14px',
              background: 'rgba(34,197,94,0.12)', color: '#16A34A',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Check size={24} strokeWidth={2.4} />
            </div>
            <p style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
              Password updated
            </p>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              {isDemo
                ? 'Demo session — nothing was actually changed.'
                : 'Use it next time you sign in. You’re still signed in here.'}
            </p>
            <button type="button" onClick={onBack} className="btn btn-primary" style={{ minWidth: 160 }}>
              Done
            </button>
          </div>
        ) : (
          <form
            onSubmit={e => { e.preventDefault(); void save(); }}
            noValidate
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.55 }}>
              Choose something you don’t use anywhere else. You stay signed in on this device.
            </p>

            <Field label="Current password" id="cp-current">
              <PwInput
                id="cp-current" value={current} onChange={setCurrent} reveal={reveal}
                onReveal={() => setReveal(r => !r)} autoComplete="current-password"
                placeholder="The one you use now"
              />
              {onForgot && (
                <button
                  type="button"
                  onClick={onForgot}
                  style={{
                    alignSelf: 'flex-start', marginTop: 6,
                    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                    fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
                    textDecoration: 'underline', textDecorationStyle: 'dotted', fontFamily: 'inherit',
                  }}
                >
                  I don’t know my current password
                </button>
              )}
            </Field>

            <Field label="New password" id="cp-new">
              <PwInput
                id="cp-new" value={next} onChange={setNext} reveal={reveal}
                onReveal={() => setReveal(r => !r)} autoComplete="new-password"
                placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                invalid={!!problem}
              />
              {next ? (
                <div style={{ marginTop: 6 }}>
                  <div aria-hidden="true" style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                    {[0, 1, 2].map(i => (
                      <span key={i} style={{
                        flex: 1, height: 3, borderRadius: 999,
                        background: strength.score > i
                          ? ['var(--accent-rose)', '#F58400', '#16A34A', '#16A34A'][Math.min(3, strength.score)]
                          : 'var(--bg-inset)',
                        transition: 'background 180ms',
                      }} />
                    ))}
                  </div>
                  <span className="field-hint" style={{ color: problem ? 'var(--accent-rose)' : undefined }}>
                    {problem ?? strength.label}
                  </span>
                </div>
              ) : (
                <span className="field-hint">A short phrase beats a clever word.</span>
              )}
            </Field>

            <Field label="Confirm new password" id="cp-confirm">
              <PwInput
                id="cp-confirm" value={confirm} onChange={setConfirm} reveal={reveal}
                onReveal={() => setReveal(r => !r)} autoComplete="new-password"
                placeholder="Type it again" invalid={confirm.length > 0 && !matches}
              />
              {confirm.length > 0 && !matches && (
                <span className="field-hint" style={{ color: 'var(--accent-rose)' }}>
                  Those don’t match yet.
                </span>
              )}
            </Field>

            {error && (
              <div role="alert" style={{
                padding: '10px 12px', borderRadius: 12,
                background: 'rgba(237,46,80,0.10)',
                color: 'var(--accent-rose)', fontSize: 12.5, fontWeight: 500, lineHeight: 1.45,
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!ready}
              className="btn btn-primary"
              style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
            >
              {saving
                ? <><Loader2 size={15} strokeWidth={2.2} className="spin" /> Saving…</>
                : 'Update password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id} className="field-label">
        <Lock size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
        {label} <span className="required" aria-hidden="true">*</span>
      </label>
      {children}
    </div>
  );
}

function PwInput({
  id, value, onChange, reveal, onReveal, autoComplete, placeholder, invalid,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  reveal: boolean;
  onReveal: () => void;
  autoComplete: string;
  placeholder: string;
  invalid?: boolean;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <input
        id={id}
        type={reveal ? 'text' : 'password'}
        className="form-input"
        style={{ paddingRight: 44 }}
        value={value}
        onChange={e => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-invalid={!!invalid}
        required
      />
      <button
        type="button"
        onClick={onReveal}
        aria-label={reveal ? 'Hide password' : 'Show password'}
        aria-pressed={reveal}
        style={{
          position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
          width: 32, height: 32, borderRadius: 999,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
        }}
      >
        {reveal ? <EyeOff size={15} strokeWidth={1.9} /> : <Eye size={15} strokeWidth={1.9} />}
      </button>
    </div>
  );
}
