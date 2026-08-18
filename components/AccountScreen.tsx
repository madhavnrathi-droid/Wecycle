'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, Mail, Phone, IdCard, Check, LogOut, GraduationCap, Building2, Home, Loader2 } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { updateDemoSession, type Residence } from '../lib/demoAuth';
import { COLLEGES, normalizeCollege } from '../lib/colleges';
import { supabase, hasSupabaseEnv } from '../lib/supabase';
import { track, EVT } from '../lib/analytics';

/* Phone handling lives in lib/phone so sign-up and this screen cannot drift
   into writing different shapes to the same column again. */
import { tenDigits, toE164 } from '../lib/phone';

interface AccountScreenProps {
  onBack: () => void;
  onSignedOut: () => void;
}

export default function AccountScreen({ onBack, onSignedOut }: AccountScreenProps) {
  const { profile, user, signOut, isDemo, refreshProfile } = useAuth();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  /* Form state hydrated from current profile */
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [collegeId, setCollegeId] = useState('');
  const [graduatingYear, setGraduatingYear] = useState<string>('');
  const [course, setCourse] = useState('');
  const [college, setCollege] = useState<string>('');
  const [residence, setResidence] = useState<Residence | ''>('');

  /* Auto-save status — drives the tiny indicator in the header. We replaced
     the manual "Save" button with debounced auto-save: every field edit kicks
     off a 700ms debounce that, once expired, writes to Supabase / the demo
     store. The status cycles idle → saving → saved → idle. */
  type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  /* Only treat a change as "saveable" once the user has actually interacted
     with the form — otherwise the initial profile hydration would itself fire
     a save (no-op, but we'd flash "Saving…" on every visit). */
  const userInteracted = useRef(false);
  /* Edits not yet covered by a completed write. Set on every edit, cleared as a
     write starts (that write covers everything typed up to that point, and
     anything typed during it re-dirties). This is what the unmount flush reads
     to decide whether leaving the screen needs to save first. */
  const dirty = useRef(false);
  const markInteracted = () => { userInteracted.current = true; dirty.current = true; };

  /* Handle for the "Saved → idle" timer, so a new save can cancel the previous
     one. Leaving them uncancelled is what made the tick flicker: see persist. */
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Hydrate when profile loads. The email defaults from the SIGN-UP auth
     email (user.email) — that's the college address they registered with —
     and only falls back to profile.email if for some reason the auth user
     isn't there. This keeps the field populated immediately on every visit
     without the user needing to type it in. */
  const authEmail = (user as { email?: string } | null)?.email ?? '';
  /* Which profile we have already hydrated from. Hydration must happen ONCE per
     account, not on every change to the profile object, because saving ends in
     refreshProfile() — so re-hydrating meant a completed write pushed its own
     result back into the fields the user was still typing in. Type "Madhav",
     let the debounce fire at "Madh", and the refresh landing a moment later
     would reset the input to "Madh" mid-word. That looked like the edit being
     rejected, and any keystroke between the write and the refresh was lost.
     The email field does not need re-hydration to stay correct: currentEmail
     below already falls back to the auth address at render time. */
  const hydratedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!profile) return;
    const id = (profile as { id?: string }).id ?? user?.id ?? 'anon';
    if (hydratedFor.current === id) return;
    hydratedFor.current = id;
    setName(profile.full_name ?? '');
    setEmail((profile as { email?: string }).email ?? authEmail);
    setPhone(tenDigits(profile.phone ?? ''));
    setCollegeId((profile as { college_id?: string | null }).college_id ?? '');
    const gy = (profile as { graduating_year?: number | null }).graduating_year;
    setGraduatingYear(gy ? String(gy) : '');
    setCourse((profile as { course?: string | null }).course ?? '');
    /* Prefer the canonical column; fall back to salvaging a legacy
       `department` value ('smi', 'SMI - BSSD') so a member who set their school
       under the old field still sees it selected instead of an empty dropdown
       that the next auto-save would then blank. */
    setCollege(
      normalizeCollege((profile as { college?: string | null }).college)
      || normalizeCollege((profile as { department?: string | null }).department),
    );
    setResidence(((profile as { residence?: Residence | null }).residence ?? '') as Residence | '');
  }, [profile, authEmail, user]);

  /* One-time backfill — many existing profile rows have email=null because the
   * on-auth-create trigger predates the email column. Without this, every
   * listing they post joins with profile.email=null and the Contact Seller
   * button silently has nothing to email. We push the auth user's email into
   * the profile row the moment we notice the gap. */
  useEffect(() => {
    if (isDemo) return;
    if (!hasSupabaseEnv) return;
    if (!user || !authEmail) return;
    const profileEmail = (profile as { email?: string | null } | null)?.email;
    if (profileEmail) return;
    /* Fire-and-forget; refresh profile so the form picks up the new value. */
    supabase
      .from('profiles')
      .update({ email: authEmail } as never)
      .eq('id', user.id)
      .then(() => { void refreshProfile(); }, () => { /* swallow — best-effort */ });
  }, [isDemo, user, authEmail, profile, refreshProfile]);

  /* Always show the address the user signed up with as the default; the
     local `email` state can deviate (e.g. they're typing) but a fresh
     profile load resets it. */
  const currentEmail = email || authEmail;

  /* Phone is optional, but if present it must be exactly 10 digits. */
  const phoneValid = phone.length === 0 || phone.length === 10;

  /* Auto-save is allowed as long as the name is set and any provided phone /
   * college ID looks reasonable. College ID is optional at signup so we
   * must not block the save when the user never set one — that would silently
   * eat every other field's edit. */
  const collegeIdValid = collegeId.trim().length === 0 || collegeId.trim().length >= 3;
  const canSave =
    name.trim().length >= 2 &&
    collegeIdValid &&
    phoneValid;

  /* Persist the current form snapshot. Called both from the debounce timer
     and from onBlur for selects/toggles (immediate write feels right there). */
  const persist = useCallback(async () => {
    if (!canSave) return;
    /* This write covers everything typed up to now; anything typed while it is
       in flight will re-dirty and be picked up by the next one. */
    dirty.current = false;
    setError(null);
    /* Don't announce "Saving…" until the write has actually been slow enough to
       be worth mentioning. Most saves here finish well inside 300ms, and showing
       a spinner for 80ms — then swapping it for a tick — is the flicker, not a
       progress report. A slow write still gets its spinner. */
    const spinner = setTimeout(() => setSaveStatus('saving'), 300);
    try {
      const storedPhone = toE164(phone);

      if (isDemo) {
        updateDemoSession({
          name: name.trim(),
          collegeId: collegeId.trim(),
          email: currentEmail.trim() || undefined,
          phone: storedPhone ?? undefined,
          graduatingYear: graduatingYear ? Number(graduatingYear) : undefined,
          course: course.trim() || undefined,
          department: college || undefined,   /* demo session has no college field yet */
          residence: residence || undefined,
        });
      } else if (hasSupabaseEnv && user) {
        /* Persist the form to the profiles row. We DON'T touch auth.email
           here — Supabase auth has its own email change flow (with a
           confirmation step) which is out of scope; the profiles row carries
           a denormalized `email` column we use for display + contact. */
        const update: Record<string, unknown> = {
          full_name: name.trim() || null,
          phone: storedPhone,
          college_id: collegeId.trim() || null,
          graduating_year: graduatingYear ? Number(graduatingYear) : null,
          course: course.trim() || null,
          college: college || null,
          residence: residence || null,
        };
        const trimmedEmail = currentEmail.trim();
        if (trimmedEmail) update.email = trimmedEmail;
        const { error: err } = await supabase
          .from('profiles')
          .update(update as never)
          .eq('id', user.id);
        if (err) throw err;
        await refreshProfile();
      }

      track(EVT.account_edited, {
        has_phone: phone.length === 10,
        has_college_id: collegeId.trim().length > 0,
        has_year: !!graduatingYear,
        has_course: !!course.trim(),
        college: college || null,
      });
      clearTimeout(spinner);
      setSaveStatus('saved');
      /* Cancel any previous countdown before starting this one. Uncancelled,
         they stacked: save at t=0 and again at t=1000 left the first timer to
         fire at t=1600 and knock the second "Saved" back to idle after only
         600ms of the 1600 it was owed. The tick's lifetime became a function of
         typing rhythm, which is exactly what "flickers and glitches" describes. */
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => setSaveStatus(s => (s === 'saved' ? 'idle' : s)), 1600);
    } catch (e) {
      clearTimeout(spinner);
      /* Still unsaved — let the flush and the next edit retry it. */
      dirty.current = true;
      setError((e as Error).message ?? 'Could not save');
      setSaveStatus('error');
    }
  }, [canSave, phone, isDemo, name, collegeId, currentEmail, graduatingYear, course, college, residence, user, refreshProfile]);

  /* Always points at the newest persist closure, so the flush below can call it
     without re-subscribing its listeners on every keystroke. */
  const persistRef = useRef(persist);
  useEffect(() => { persistRef.current = persist; }, [persist]);

  /* Debounced auto-save — fires 700ms after the last edit. We re-derive the
     timer on every field change so rapid typing collapses into a single
     write at the end. The userInteracted ref guards against the initial
     hydration spuriously firing this. */
  useEffect(() => {
    if (!userInteracted.current) return;
    if (!canSave) return;
    /* Through the ref, NOT persist directly. Listing persist here was an
       infinite save loop: persist closes over refreshProfile, AuthContext builds
       its value inline so refreshProfile is a new function on every provider
       render, and persist ends by awaiting refreshProfile(). So each save
       re-rendered the provider, gave persist a new identity, re-ran this effect,
       and armed the next save — round and round every 700ms for as long as the
       screen stayed open, each one a real write and an account_edited event.
       That is what kept "Saved" lit permanently: every pass reset its countdown.

       The dependency list is now exactly the form values, which is what should
       actually trigger a save. */
    const t = setTimeout(() => { void persistRef.current(); }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, phone, collegeId, currentEmail, graduatingYear, course, college, residence, canSave]);

  /* Leaving the screen must not discard the edit that was still in the debounce.
   *
   * The 700ms timer above is cancelled by its own cleanup when this component
   * unmounts — and it unmounts the moment activeScreen changes, because the
   * parent renders it as {activeScreen === 'account' && <AccountScreen/>}. So
   * editing a field and tapping Back or a nav tab inside that window cancelled
   * the write and the change was simply gone. It reappeared as the original
   * value on the next visit, which is the "it didn't save" report.
   *
   * Mount-scoped ([] deps) so the listeners attach once; persistRef supplies the
   * current values. Both hidden-tab and unmount paths matter: pagehide and
   * visibilitychange cover backgrounding the PWA or locking the phone, where no
   * unmount happens at all, and the cleanup covers navigating within the app. */
  useEffect(() => {
    const flush = () => { if (dirty.current) void persistRef.current(); };
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      flush();
    };
  }, []);

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
          /* Opaque. --bg-overlay is 88% alpha, so the feed showed
             through the header as it scrolled past. */
          background: 'var(--bg-card)',
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
        {/* Tiny live status — fades between idle / saving / saved. No button:
           edits write automatically a moment after you stop typing. */}
        <span
          aria-live="polite"
          aria-atomic="true"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            /* Wide enough for "Saving…" plus its spinner, so the tick does not
               shift the header as the label swaps. */
            minWidth: 76, justifyContent: 'flex-end',
            whiteSpace: 'nowrap',
            fontSize: 12, fontWeight: 500,
            color:
              saveStatus === 'saved'   ? 'var(--accent-mint, #22C55E)' :
              saveStatus === 'error'   ? 'var(--accent-rose)'          :
              saveStatus === 'saving'  ? 'var(--text-muted)'           :
                                         'var(--text-muted)',
            opacity: saveStatus === 'idle' ? 0 : 1,
            transition: 'opacity 200ms ease',
            letterSpacing: '-0.01em',
            paddingRight: 8,
          }}
        >
          {saveStatus === 'saving' && (
            <>
              <Loader2 size={12} strokeWidth={2} style={{ animation: 'spin 0.9s linear infinite' }} />
              Saving…
            </>
          )}
          {saveStatus === 'saved' && (
            <>
              <Check size={13} strokeWidth={2.5} />
              Saved
            </>
          )}
          {saveStatus === 'error' && 'Couldn’t save'}
        </span>
      </header>

      {/* Form left in place for grouping + accessibility, but onSubmit is
         disabled — there is no Submit button, edits auto-save. */}
      <form id="account-form" onSubmit={(e) => e.preventDefault()} noValidate>

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
                {college || 'No college set'}{collegeId ? ` · ${collegeId}` : ''}
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
              onChange={e => { setName(e.target.value); markInteracted(); }}
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
                /* 80-char cap mirrors the AuthModal sign-up rule. The email
                 * column on profiles is text, so this is purely a UX guard. */
                maxLength={80}
                onChange={e => { setEmail(e.target.value); markInteracted(); }}
                autoComplete="email"
              />
              <span className="field-hint">
                The college email you signed up with — visible on your storefront and used as the default contact channel.
              </span>
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
                onChange={e => { setCollegeId(e.target.value.replace(/\D+/g, '')); markInteracted(); }}
                required
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="acc-phone" className="field-label">
              <Phone size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
              Phone <span className="field-hint" style={{ fontWeight: 400 }}>(optional)</span>
            </label>
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
                id="acc-phone"
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={10}
                className="form-input"
                placeholder="98765 43210"
                value={phone}
                onChange={e => { setPhone(tenDigits(e.target.value)); markInteracted(); }}
                autoComplete="tel-national"
                aria-invalid={!phoneValid}
                style={{ flex: 1 }}
              />
            </div>
            {!phoneValid && (
              <span className="field-error">Enter a 10-digit number (without +91).</span>
            )}
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
                onChange={e => { setGraduatingYear(e.target.value); markInteracted(); }}
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
                onChange={e => { setCourse(e.target.value); markInteracted(); }}
              />
            </div>
          </div>

          {/* College — the same required field as sign-up, editable here.
              Replaces the old "Department" select, which pointed at a column
              sign-up was writing free text into; see lib/colleges.ts. */}
          <div className="field">
            <label htmlFor="acc-college" className="field-label">
              <Building2 size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
              College
            </label>
            <select
              id="acc-college"
              className="form-select"
              value={college}
              onChange={e => { setCollege(e.target.value); markInteracted(); }}
            >
              <option value="">Pick your college</option>
              {COLLEGES.map(c => (
                <option key={c.id} value={c.id}>
                  {c.id} — {c.name}
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
                    onClick={() => { setResidence(active ? '' : opt); markInteracted(); }}
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
