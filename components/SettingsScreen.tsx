'use client';

import { useEffect, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Sun, Moon, Monitor,
  Bell, BellRing, Shield, Tag, Info,
  MessageSquare, Globe, EyeOff, Trash2, Loader2, UserX,
} from 'lucide-react';
import { pushSupported, isPushEnabled, enablePush, disablePush } from '../lib/push';
import { getBlockedUsers, unblockUser, onBlocksChange, type BlockedUser } from '../lib/moderation';
import {
  getSettings, saveSettings, onSettingsChange, applyLargerText,
  type ThemeMode, type UserSettings,
} from '../lib/settings';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';
import { track, EVT } from '../lib/analytics';

interface SettingsScreenProps {
  onBack: () => void;
  onOpenNotifications: () => void;
  onOpenFeedback: () => void;
  onOpenAccount: () => void;
}

export default function SettingsScreen({
  onBack, onOpenNotifications, onOpenFeedback, onOpenAccount,
}: SettingsScreenProps) {
  const { user, isDemo, signOut } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [settings, setSettings] = useState<UserSettings>(getSettings());
  const [pushOn, setPushOn] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const pushAvailable = pushSupported();

  useEffect(() => { setMounted(true); }, []);

  /* Hydrate push state once on mount */
  useEffect(() => {
    let cancelled = false;
    isPushEnabled().then(v => { if (!cancelled) setPushOn(v); });
    return () => { cancelled = true; };
  }, []);

  /* Blocked users — hydrate on mount and re-fetch when blocks change
     anywhere in the app (e.g. blocked via a ReportSheet). */
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  useEffect(() => {
    let cancelled = false;
    const load = () => { getBlockedUsers().then(v => { if (!cancelled) setBlockedUsers(v); }); };
    load();
    const off = onBlocksChange(load);
    return () => { cancelled = true; off(); };
  }, []);

  useEffect(() => {
    return onSettingsChange(setSettings);
  }, []);

  if (!mounted) return null;

  /* Wrapped saver — every group emits one `settings_changed` event with the
   * specific key + new value so we can see which toggles users actually flip
   * in production. */
  const fireSettings = (group: string, patch: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(patch)) {
      track(EVT.settings_changed, { group, setting_key: key, value: String(value) });
    }
  };
  const setAppearance = (patch: Partial<UserSettings['appearance']>) => {
    fireSettings('appearance', patch as Record<string, unknown>);
    saveSettings({ appearance: { ...settings.appearance, ...patch } });
    /* Apply text-size change instantly so the screen reflows under the user's
       finger — they don't have to wait for the next paint or close the tab. */
    if (patch.largerText !== undefined) applyLargerText(patch.largerText);
  };
  const setPrivacy = (patch: Partial<UserSettings['privacy']>) => {
    fireSettings('privacy', patch as Record<string, unknown>);
    saveSettings({ privacy: { ...settings.privacy, ...patch } });
  };
  const setMarketplace = (patch: Partial<UserSettings['marketplace']>) => {
    fireSettings('marketplace', patch as Record<string, unknown>);
    saveSettings({ marketplace: { ...settings.marketplace, ...patch } });
  };
  const setContact = (patch: Partial<UserSettings['contact']>) => {
    fireSettings('contact', patch as Record<string, unknown>);
    saveSettings({ contact: { ...settings.contact, ...patch } });
  };

  const clearCache = () => {
    if (typeof window === 'undefined') return;
    const confirmed = window.confirm(
      'Clear local cache? This removes cached images and viewed-item history. Your account stays intact.',
    );
    if (!confirmed) return;
    /* Surgical clear — preserve auth & settings, drop everything else our app set. */
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('wecycle.cache.') || k.startsWith('wecycle.viewed.')) {
        localStorage.removeItem(k);
      }
    }
    /* Best-effort SW cache wipe */
    if ('caches' in window) {
      caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
    }
    window.alert('Cache cleared.');
  };

  const deleteAccount = async () => {
    if (typeof window === 'undefined') return;

    /* Stage 1 — clear warning. */
    const ok = window.confirm(
      'Permanently delete your account?\n\n' +
      'This removes all your posts, requests, comments, messages, saved searches, and profile.\n\n' +
      'This cannot be undone.',
    );
    if (!ok) return;

    /* Stage 2 — typed confirmation guards against fat-finger. */
    const typed = window.prompt('Type DELETE in capitals to confirm.');
    if ((typed ?? '').trim().toUpperCase() !== 'DELETE') return;

    try {
      /* Demo mode: nothing on the server to delete — just wipe local state. */
      if (!isDemo) {
        track(EVT.settings_changed, { group: 'account', setting_key: 'delete', value: 'true' });
        const { error } = await (supabase.rpc as unknown as (
          fn: string, args: Record<string, unknown>,
        ) => Promise<{ error: unknown }>)('delete_my_account', {});
        if (error) {
          window.alert(`Couldn't delete your account: ${(error as { message?: string }).message ?? 'unknown error'}`);
          return;
        }
      }
      /* Server delete succeeded (or demo) — clear local & sign out. */
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith('wecycle.')) localStorage.removeItem(k);
      }
      await signOut();
      onBack();
      /* Defer the alert one tick so the screen transition completes first. */
      setTimeout(() => window.alert('Your account has been deleted.'), 60);
    } catch (e) {
      window.alert(`Couldn't delete your account: ${(e as Error).message}`);
    }
  };

  return (
    <div className="screen-transition" style={{ paddingBottom: 80, background: 'var(--bg-base)', minHeight: '100%' }}>

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
        <button onClick={onBack} aria-label="Back" className="theme-toggle">
          <ChevronLeft size={20} strokeWidth={1.8} />
        </button>
        <h1 style={{
          margin: 0, flex: 1, textAlign: 'center',
          fontSize: 16, fontWeight: 600,
          letterSpacing: '-0.02em', color: 'var(--text-primary)',
        }}>
          Settings
        </h1>
        <span style={{ width: 36 }} aria-hidden="true" />
      </header>

      {/* ── APPEARANCE ── */}
      <Section title="Appearance" hint="How Wecycle looks on this device.">
        <Card>
          <Row label="Theme" hint="System matches your phone's appearance.">
            <ThemeSwitcher value={settings.appearance.theme} onChange={(v) => setAppearance({ theme: v })} />
          </Row>
          <Divider />
          <Row label="Larger text" hint="Bump readable body copy across the app.">
            <Toggle on={settings.appearance.largerText} onChange={(v) => setAppearance({ largerText: v })} />
          </Row>
        </Card>
      </Section>

      {/* ── NOTIFICATIONS ── */}
      <Section title="Notifications" hint={pushAvailable ? undefined : 'Push notifications are not supported in this browser.'}>
        {pushAvailable && (
          <Card>
            <Row
              label="Push notifications"
              hint={pushOn ? "You’ll get alerts for saved searches and messages." : 'Enable to get notified when someone matches your saved search or messages you.'}
              icon={pushOn ? <BellRing size={13} strokeWidth={1.8} /> : undefined}
            >
              {pushLoading ? (
                <Loader2 size={18} strokeWidth={1.8} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-muted)' }} />
              ) : (
                <Toggle on={pushOn} onChange={async (v) => {
                  setPushLoading(true);
                  try {
                    if (v) {
                      const result = await enablePush();
                      setPushOn(result === 'enabled');
                      if (result === 'denied') {
                        window.alert('Notification permission was denied. You can enable it in your browser settings.');
                      }
                    } else {
                      await disablePush();
                      setPushOn(false);
                    }
                  } finally {
                    setPushLoading(false);
                  }
                  fireSettings('notifications', { push: String(v) });
                }} />
              )}
            </Row>
          </Card>
        )}
        <LinkCard
          icon={<Bell size={16} strokeWidth={1.8} />}
          title="Notification preferences"
          subtitle="Choose channels, categories, and quiet hours"
          onClick={onOpenNotifications}
        />
      </Section>

      {/* ── PRIVACY ──
         Profiles are always public for community safety — that's not configurable.
         Email is always visible too (people need a way to reach you).
         What stays private: phone, presence, and your listings while you tidy up. */}
      <Section title="Privacy" hint="Profiles and email are always visible to your community. These tune the rest.">
        <Card>
          <Row label="Show I'm online" hint="Display a green “Online” label on your posts and profile.">
            <Toggle on={settings.privacy.showOnlineStatus} onChange={(v) => setPrivacy({ showOnlineStatus: v })} />
          </Row>
          <Divider />
          <Row label="Allow direct messages" hint="Others can DM you about your posts.">
            <Toggle on={settings.privacy.allowDMs} onChange={(v) => setPrivacy({ allowDMs: v })} />
          </Row>
          <Divider />
          <Row
            label="Show phone on profile"
            hint="Off keeps it private; messages route through Wecycle instead."
            icon={!settings.privacy.showPhone ? <EyeOff size={13} /> : undefined}
          >
            <Toggle on={settings.privacy.showPhone} onChange={(v) => setPrivacy({ showPhone: v })} />
          </Row>
          <Divider />
          <Row label="Hide my listings from search" hint="Useful while you're cleaning up your inventory.">
            <Toggle
              on={settings.privacy.hideListingsFromSearch}
              onChange={(v) => setPrivacy({ hideListingsFromSearch: v })}
            />
          </Row>
        </Card>
      </Section>

      {/* ── BLOCKED USERS ──
         The block action lives in each post/profile's Report sheet; this is
         the management surface to undo it. Always visible so users (and app
         reviewers) can find where blocks are controlled. */}
      <Section title="Blocked users" hint="People you've blocked can't message you, and their posts are hidden from your feeds.">
        <Card>
          {blockedUsers.length === 0 ? (
            <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <UserX size={15} strokeWidth={1.8} color="var(--text-muted)" />
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                You haven&rsquo;t blocked anyone.
              </span>
            </div>
          ) : (
            blockedUsers.map((b, i) => (
              <div key={b.id}>
                {i > 0 && <Divider />}
                <Row label={b.name} hint="Blocked">
                  <button
                    className="settings-btn-ghost"
                    onClick={async () => {
                      const ok = window.confirm(`Unblock ${b.name}? Their posts and messages become visible again.`);
                      if (!ok) return;
                      await unblockUser(b.id);
                    }}
                    aria-label={`Unblock ${b.name}`}
                  >
                    Unblock
                  </button>
                </Row>
              </div>
            ))
          )}
        </Card>
      </Section>

      {/* ── CONTACT PREFERENCES ──
         These drive which button(s) appear on YOUR posts. When both are on,
         viewers see "Email you" + "WhatsApp you"; one is on → one CTA; none →
         we fall back to email so the action is never dead. */}
      <Section
        title="How others contact you"
        hint="Choose the channels viewers use to message you about your posts."
      >
        <Card>
          <Row
            label="Email"
            hint="They open their mail app with your post pre-quoted."
          >
            <Toggle on={settings.contact.email} onChange={(v) => setContact({ email: v })} />
          </Row>
          <Divider />
          <Row
            label="WhatsApp"
            hint="They open WhatsApp with a pre-filled message. Requires a phone on your account."
          >
            <Toggle on={settings.contact.whatsapp} onChange={(v) => setContact({ whatsapp: v })} />
          </Row>
        </Card>
        {!settings.contact.email && !settings.contact.whatsapp && (
          <p style={{
            margin: '8px 4px 0', fontSize: 11, color: 'var(--accent-rose)', lineHeight: 1.4,
          }}>
            Both channels are off — Wecycle will still surface email as a fallback so people can reach you.
          </p>
        )}
      </Section>

      {/* ── MARKETPLACE ── */}
      <Section title="Marketplace" hint="How the marketplace feels day to day.">
        <Card>
          <Row label="Hide prices on feed" hint="See items by need, not budget.">
            <Toggle on={settings.marketplace.hidePriceOnFeed} onChange={(v) => setMarketplace({ hidePriceOnFeed: v })} />
          </Row>
        </Card>
      </Section>

      {/* ── DATA & STORAGE ──
         We auto-compress all uploads before sending them to Supabase storage —
         not a toggle, just a default. No "Data saver" row needed. */}
      <Section title="Data & storage" hint="Photos are auto-compressed before upload to save space.">
        <Card>
          <Row label="Clear local cache" hint="Wipe cached images and recently-viewed lists.">
            <button onClick={clearCache} className="settings-btn-ghost">
              <Trash2 size={13} strokeWidth={1.8} /> Clear
            </button>
          </Row>
        </Card>
      </Section>

      {/* ── HELP & FEEDBACK ── */}
      <Section title="Help & feedback">
        <LinkCard
          icon={<MessageSquare size={16} strokeWidth={1.8} />}
          title="Send feedback"
          subtitle="Tell us what to fix or build next"
          onClick={onOpenFeedback}
        />
        <LinkCard
          icon={<Info size={16} strokeWidth={1.8} />}
          title="About Wecycle"
          subtitle="Version 1.0 · Built for circulating resources"
          onClick={() => window.alert('Wecycle v1.0\nBuilt with love for circulating resources within communities.')}
        />
        <LinkCard
          icon={<Shield size={16} strokeWidth={1.8} />}
          title="Privacy policy"
          /* Relative path → resolves on whatever origin serves the app
             (vercel.app today, wecycle.page once the custom domain is wired). */
          onClick={() => window.open('/privacy', '_blank', 'noopener,noreferrer')}
        />
        <LinkCard
          icon={<Globe size={16} strokeWidth={1.8} />}
          title="Terms of service"
          onClick={() => window.open('/terms', '_blank', 'noopener,noreferrer')}
        />
      </Section>

      {/* ── ACCOUNT ── */}
      <Section title="Account">
        <LinkCard
          icon={<Tag size={16} strokeWidth={1.8} />}
          title="Edit profile"
          subtitle={user ? (isDemo ? 'Demo session' : 'Signed in') : 'Not signed in'}
          onClick={onOpenAccount}
        />
        <Card>
          <div style={{ padding: '14px 16px' }}>
            <p style={{
              margin: '0 0 8px', fontSize: 13, fontWeight: 600,
              color: 'var(--accent-rose)', letterSpacing: '-0.01em',
            }}>
              Danger zone
            </p>
            <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
              Deleting your account removes your listings, RSVPs, and saved alerts.
              You can't undo this.
            </p>
            <button onClick={deleteAccount} className="settings-btn-danger">
              <Trash2 size={13} strokeWidth={1.8} /> Delete account
            </button>
          </div>
        </Card>
      </Section>

      <FooterStamp />

      <style jsx>{`
        .settings-btn-ghost {
          display: inline-flex; align-items: center; gap: 6px;
          background: transparent; border: 1px solid var(--border-default);
          border-radius: 999px;
          padding: 6px 12px; font-size: 12px; font-weight: 500;
          color: var(--text-primary); cursor: pointer;
        }
        .settings-btn-danger {
          display: inline-flex; align-items: center; gap: 6px;
          background: transparent; border: 1px solid var(--accent-rose);
          color: var(--accent-rose); border-radius: 999px;
          padding: 8px 14px; font-size: 12px; font-weight: 600;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}

/* ──────────────────────────────────────────────── */
/*  Layout primitives                                */
/* ──────────────────────────────────────────────── */

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section style={{ padding: '4px 20px 18px' }}>
      <div style={{ marginBottom: 10 }}>
        <h3 style={{
          margin: 0, fontSize: 11, fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          color: 'var(--text-secondary)',
        }}>
          {title}
        </h3>
        {hint && (
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
            {hint}
          </p>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {children}
      </div>
    </section>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-default)',
      borderRadius: 16,
      overflow: 'hidden',
    }}>
      {children}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: 'var(--border-default)', opacity: 0.6 }} />;
}

function Row({ label, hint, icon, children }: {
  label: string; hint?: string; icon?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 16px', minHeight: 52,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 14, fontWeight: 500, color: 'var(--text-primary)',
          letterSpacing: '-0.01em',
        }}>
          {icon}
          {label}
        </div>
        {hint && (
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.35 }}>
            {hint}
          </p>
        )}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function LinkCard({ icon, title, subtitle, onClick }: {
  icon: React.ReactNode; title: string; subtitle?: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        all: 'unset', cursor: 'pointer', width: '100%',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-default)',
        borderRadius: 16, padding: '14px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
      }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: 10,
        background: 'var(--bg-inset)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-primary)', flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {subtitle}
          </div>
        )}
      </div>
      <ChevronRight size={16} strokeWidth={1.8} color="var(--text-muted)" />
    </button>
  );
}

/* ──────────────────────────────────────────────── */
/*  Controls                                         */
/* ──────────────────────────────────────────────── */

function ThemeSwitcher({ value, onChange }: { value: ThemeMode; onChange: (v: ThemeMode) => void }) {
  const options: Array<{ v: ThemeMode; label: string; icon: React.ReactNode }> = [
    { v: 'light',  label: 'Light',  icon: <Sun     size={13} strokeWidth={1.8} /> },
    { v: 'dark',   label: 'Dark',   icon: <Moon    size={13} strokeWidth={1.8} /> },
    { v: 'system', label: 'System', icon: <Monitor size={13} strokeWidth={1.8} /> },
  ];
  return (
    <div role="radiogroup" aria-label="Theme" style={{
      display: 'inline-flex', gap: 2, padding: 2,
      background: 'var(--bg-inset)', borderRadius: 999,
      border: '1px solid var(--border-default)',
    }}>
      {options.map(o => (
        <button
          key={o.v}
          role="radio"
          aria-checked={value === o.v}
          onClick={() => onChange(o.v)}
          style={{
            all: 'unset', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '5px 10px', fontSize: 12, fontWeight: 500,
            borderRadius: 999,
            background: value === o.v ? 'var(--bg-card)' : 'transparent',
            color: value === o.v ? 'var(--text-primary)' : 'var(--text-muted)',
            boxShadow: value === o.v ? '0 1px 2px rgba(0,0,0,0.04)' : 'none',
            transition: 'all 0.15s',
          }}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={() => !disabled && onChange(!on)}
      style={{
        all: 'unset', cursor: disabled ? 'not-allowed' : 'pointer',
        width: 40, height: 24, borderRadius: 999,
        position: 'relative',
        background: on ? 'var(--text-primary)' : 'var(--border-default)',
        opacity: disabled ? 0.4 : 1,
        transition: 'background 0.18s',
        flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: on ? 18 : 2,
        width: 20, height: 20, borderRadius: '50%',
        background: 'var(--bg-base)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
        transition: 'left 0.18s',
      }} />
    </button>
  );
}

function FooterStamp() {
  return (
    <div style={{
      textAlign: 'center', padding: '20px 20px 30px',
      fontSize: 11, color: 'var(--text-muted)', letterSpacing: '-0.01em',
    }}>
      Wecycle · v1.0 · Made for circulating resources
    </div>
  );
}
