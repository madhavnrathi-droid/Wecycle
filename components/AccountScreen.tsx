'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, Mail, Phone, IdCard, Check, LogOut, GraduationCap, Building2, Home } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { updateDemoSession, DEPARTMENTS, type Residence } from '../lib/demoAuth';

interface AccountScreenProps {
  onBack: () => void;
  onSignedOut: () => void;
}

export default function AccountScreen({ onBack, onSignedOut }: AccountScreenProps) {
  const { profile, signOut, isDemo } = useAuth();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  /* Form state hydrated from current profile */
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [collegeId, setCollegeId] = useState('');
  const [graduatingYear, setGraduatingYear] = useState<string>('');
  const [course, setCourse] = useState('');
  const [department, setDepartment] = useState<string>('');
  const [residence, setResidence] = useState<Residence | ''>('');

  const [savedFlash, setSavedFlash] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Hydrate when profile loads */
  useEffect(() => {
    if (!profile) return;
    setName(profile.full_name ?? '');
    setEmail((profile as { email?: string }).email ?? '');
    setPhone(profile.phone ?? '');
    setCollegeId((profile as { college_id?: string | null }).college_id ?? '');
    const gy = (profile as { graduating_year?: number | null }).graduating_year;
    setGraduatingYear(gy ? String(gy) : '');
    setCourse((profile as { course?: string | null }).course ?? '');
    setDepartment((profile as { department?: string | null }).department ?? '');
    setResidence(((profile as { residence?: Residence | null }).residence ?? '') as Residence | '');
  }, [profile]);

  /* Demo profiles don't carry the user's email directly (we use the synth user),
     fall back to a friendly placeholder. */
  const currentEmail = email || '';

  const canSave =
    name.trim().length >= 2 &&
    collegeId.trim().length >= 3;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setSubmitting(true);
    setError(null);
    try {
      if (isDemo) {
        updateDemoSession({
          name: name.trim(),
          collegeId: collegeId.trim(),
          email: currentEmail.trim() || undefined,
          phone: phone.trim() || undefined,
          graduatingYear: graduatingYear ? Number(graduatingYear) : undefined,
          course: course.trim() || undefined,
          department: department || undefined,
          residence: residence || undefined,
        });
      }
      /* Real path would be a supabase.from('profiles').update({...}) here. */
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1800);
    } catch (e) {
      setError((e as Error).message ?? 'Could not save');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    onSignedOut();
  };

  if (!mounted) return null;

  return (
    <div className="screen-transition" style={{ paddingBottom: 100, background: 'var(--bg-base)', minHeight: '100%' }}>

      {/* ── HEADER ── */}
      <header
        style={{
          position: 'sticky', top: 0, zIndex: 30,
          background: 'var(--bg-overlay)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          padding: '10px 12px',
          display: 'flex', alignItems: 'center', gap: 8,
        }}
      >
        <button
          onClick={onBack}
          aria-label="Back"
          className="theme-toggle"
        >
          <ChevronLeft size={20} strokeWidth={1.8} />
        </button>
        <h1 style={{
          margin: 0, flex: 1, textAlign: 'center',
          fontSize: 16, fontWeight: 600,
          letterSpacing: '-0.02em', color: 'var(--text-primary)',
        }}>
          Account
        </h1>
        <button
          form="account-form"
          type="submit"
          disabled={!canSave || submitting}
          style={{
            background: canSave ? 'var(--text-primary)' : 'var(--bg-inset)',
            color: canSave ? 'var(--bg-base)' : 'var(--text-muted)',
            border: 'none', borderRadius: 999,
            padding: '8px 16px',
            fontSize: 13, fontWeight: 600, cursor: canSave ? 'pointer' : 'default',
            letterSpacing: '-0.01em',
            transition: 'all 0.2s',
          }}
        >
          {submitting ? 'Saving…' : savedFlash ? <><Check size={13} strokeWidth={2.5} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 4 }} />Saved</> : 'Save'}
        </button>
      </header>

      <form id="account-form" onSubmit={handleSave} noValidate>

        {/* ── HERO: name preview ── */}
        <section style={{ padding: '20px 20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 64, height: 64, borderRadius: 20,
              background: (profile?.avatar_color ?? '#6C63FF'),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em',
              flexShrink: 0,
            }}>
              {profile?.initials ?? 'W'}
            </div>
            <div style={{ minWidth: 0, lineHeight: 1.25 }}>
              <h2 style={{
                margin: 0, fontSize: 22, fontWeight: 600,
                letterSpacing: '-0.025em', color: 'var(--text-primary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {name || 'Your name'}
              </h2>
              <p style={{
                margin: '2px 0 0', fontSize: 13, color: 'var(--text-muted)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {department ? `${department.toUpperCase()} · ` : ''}{collegeId || 'No college ID set'}
              </p>
            </div>
          </div>
        </section>

        {/* ── SECTION 1: Identity (required) ── */}
        <Section title="Identity" hint="Used for sign-in and listing attribution." required>
          <div className="field">
            <label htmlFor="acc-name" className="field-label">
              Full name <span className="required" aria-hidden="true">*</span>
            </label>
            <input
              id="acc-name"
              type="text"
              className="form-input"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              autoComplete="name"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="field">
              <label htmlFor="acc-email" className="field-label">
                <Mail size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
                Email <span className="required" aria-hidden="true">*</span>
              </label>
              <input
                id="acc-email"
                type="email"
                inputMode="email"
                className="form-input"
                value={currentEmail}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div className="field">
              <label htmlFor="acc-collegeid" className="field-label">
                <IdCard size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
                College ID <span className="required" aria-hidden="true">*</span>
              </label>
              <input
                id="acc-collegeid"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                className="form-input"
                placeholder="e.g. 230905123"
                value={collegeId}
                /* Strip any non-digit on the fly so paste, autofill, and
                   wrong keystrokes can't slip a letter in. */
                onChange={e => setCollegeId(e.target.value.replace(/\D+/g, ''))}
                required
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="acc-phone" className="field-label">
              <Phone size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
              Phone <span className="field-hint" style={{ fontWeight: 400 }}>(optional)</span>
            </label>
            <input
              id="acc-phone"
              type="tel"
              inputMode="tel"
              className="form-input"
              placeholder="+91 98765 43210"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              autoComplete="tel"
            />
          </div>
        </Section>

        {/* ── SECTION 2: Academic (optional) ── */}
        <Section title="Academic" hint="Helps your community recognize you. Skip what you don't want to share.">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 10 }}>
            <div className="field">
              <label htmlFor="acc-year" className="field-label">
                <GraduationCap size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
                Grad. year
              </label>
              <input
                id="acc-year"
                type="number"
                inputMode="numeric"
                min={1980}
                max={2100}
                className="form-input"
                placeholder="2027"
                value={graduatingYear}
                onChange={e => setGraduatingYear(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="acc-course" className="field-label">
                Course
              </label>
              <input
                id="acc-course"
                type="text"
                className="form-input"
                placeholder="e.g. B.Des Communication Design"
                value={course}
                onChange={e => setCourse(e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="acc-dept" className="field-label">
              <Building2 size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
              Department
            </label>
            <select
              id="acc-dept"
              className="form-select"
              value={department}
              onChange={e => setDepartment(e.target.value)}
            >
              <option value="">Pick your school</option>
              {DEPARTMENTS.map(d => (
                <option key={d.id} value={d.id}>
                  {d.label} — {d.description}
                </option>
              ))}
            </select>
          </div>

          {/* Residence as visual chips */}
          <div>
            <label className="field-label" style={{ display: 'block', marginBottom: 6 }}>
              <Home size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
              Residence
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {(['day_scholar', 'hosteler'] as Residence[]).map(opt => {
                const active = residence === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setResidence(active ? '' : opt)}
                    className="residence-chip"
                    data-active={active || undefined}
                  >
                    <span style={{ fontSize: 18, marginBottom: 4 }} aria-hidden="true">
                      {opt === 'day_scholar' ? '🏠' : '🛏️'}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {opt === 'day_scholar' ? 'Day scholar' : 'Hosteler'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </Section>

        {error && (
          <div role="alert" style={{
            margin: '0 20px 16px',
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

        {/* ── DANGER ── */}
        <section style={{ padding: '8px 20px 32px' }}>
          <div className="hairline" style={{ marginBottom: 16 }} />
          <button
            type="button"
            onClick={handleSignOut}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'transparent', border: '1px solid var(--border-default)',
              borderRadius: 999,
              padding: '10px 16px',
              fontSize: 13, fontWeight: 500,
              color: 'var(--accent-rose)',
              cursor: 'pointer',
            }}
          >
            <LogOut size={14} strokeWidth={1.8} />
            Sign out
          </button>
        </section>
      </form>
    </div>
  );
}

function Section({ title, hint, required, children }: {
  title: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section style={{ padding: '4px 20px 24px' }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <h3 style={{
            margin: 0,
            fontSize: 11, fontWeight: 700,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            color: 'var(--text-secondary)',
          }}>
            {title}
          </h3>
          {required && (
            <span style={{
              fontSize: 10, fontWeight: 600,
              color: 'var(--accent-rose)',
              letterSpacing: '0.02em',
            }}>
              required
            </span>
          )}
        </div>
        {hint && (
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
            {hint}
          </p>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {children}
      </div>
    </section>
  );
}
