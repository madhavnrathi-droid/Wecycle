'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft, Bell, Volume2, Mail, Phone,
  MessageCircle, Sparkles, CalendarDays, Store, Search,
  Megaphone, Newspaper, Info,
} from 'lucide-react';
import {
  getSettings, saveSettings, onSettingsChange,
  type UserSettings, type EmailFrequency,
} from '../lib/settings';
import { useAuth } from '../lib/AuthContext';
import { Toggle } from './SettingsScreen';

interface NotificationsScreenProps {
  onBack: () => void;
  onOpenAccount: () => void;
}

export default function NotificationsScreen({ onBack, onOpenAccount }: NotificationsScreenProps) {
  const { profile, user } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [settings, setSettings] = useState<UserSettings>(getSettings());

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => onSettingsChange(setSettings), []);

  /* Channel gating — toggle is dead until contact info exists. */
  const hasEmail = useMemo(() => {
    return !!(
      (profile as { email?: string | null } | null)?.email ||
      (user as { email?: string | null } | null)?.email
    );
  }, [profile, user]);
  const hasPhone = useMemo(() => !!profile?.phone, [profile]);

  /* Browser push permission — separate from our "in-app" toggle */
  const [pushPerm, setPushPerm] = useState<NotificationPermission | 'unsupported'>(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return Notification.permission;
  });

  const requestPush = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    const result = await Notification.requestPermission();
    setPushPerm(result);
  };

  if (!mounted) return null;

  const setChannels = (patch: Partial<UserSettings['notifications']['channels']>) =>
    saveSettings({
      notifications: { ...settings.notifications, channels: { ...settings.notifications.channels, ...patch } },
    });
  const setCategories = (patch: Partial<UserSettings['notifications']['categories']>) =>
    saveSettings({
      notifications: { ...settings.notifications, categories: { ...settings.notifications.categories, ...patch } },
    });
  const setQuiet = (patch: Partial<UserSettings['notifications']['quietHours']>) =>
    saveSettings({
      notifications: { ...settings.notifications, quietHours: { ...settings.notifications.quietHours, ...patch } },
    });
  const setEmailFreq = (v: EmailFrequency) =>
    saveSettings({ notifications: { ...settings.notifications, emailFrequency: v } });

  const ch = settings.notifications.channels;
  const cat = settings.notifications.categories;
  const qh = settings.notifications.quietHours;

  /* If a master channel is off, all categories collapse to "no delivery via that channel"
     — but we keep category state intact so toggling channels back restores prefs. */

  return (
    <div className="screen-transition" style={{ paddingBottom: 80, background: 'var(--bg-base)', minHeight: '100%' }}>

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
          Notifications
        </h1>
        <span style={{ width: 36 }} aria-hidden="true" />
      </header>

      {/* ── CHANNELS ── */}
      <Section title="Channels" hint="How you'd like Wecycle to reach you.">
        <Card>
          <ChannelRow
            icon={<Bell size={15} strokeWidth={1.8} />}
            title="In-app"
            subtitle="Activity tab + banner toasts"
            on={ch.inApp}
            onChange={(v) => setChannels({ inApp: v })}
          />
          <Divider />
          <ChannelRow
            icon={<Volume2 size={15} strokeWidth={1.8} />}
            title="Sound"
            subtitle="Play a chime with in-app alerts"
            on={ch.sound}
            disabled={!ch.inApp}
            disabledHint="Turn on in-app first"
            onChange={(v) => setChannels({ sound: v })}
          />
          <Divider />
          <ChannelRow
            icon={<Mail size={15} strokeWidth={1.8} />}
            title="Email"
            subtitle={hasEmail ? 'Sent to your account email' : 'Add an email to enable'}
            on={ch.email}
            disabled={!hasEmail}
            disabledHint="Add email in Account"
            onAction={!hasEmail ? { label: 'Add email', onClick: onOpenAccount } : undefined}
            onChange={(v) => setChannels({ email: v })}
          />
          <Divider />
          <ChannelRow
            icon={<Phone size={15} strokeWidth={1.8} />}
            title="SMS"
            subtitle={hasPhone ? 'Text messages to your phone' : 'Add a phone number to enable'}
            on={ch.sms}
            disabled={!hasPhone}
            disabledHint="Add phone in Account"
            onAction={!hasPhone ? { label: 'Add phone', onClick: onOpenAccount } : undefined}
            onChange={(v) => setChannels({ sms: v })}
          />
        </Card>

        {/* Browser push permission — surfaced when available */}
        {pushPerm !== 'unsupported' && (
          <div style={{
            marginTop: 10, padding: '12px 14px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            borderRadius: 14,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <Bell size={16} strokeWidth={1.8} color="var(--text-secondary)" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                Browser push
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {pushPerm === 'granted' && 'Enabled — we can ping this device'}
                {pushPerm === 'denied'  && 'Blocked — re-enable from your browser settings'}
                {pushPerm === 'default' && 'Not yet requested'}
              </div>
            </div>
            {pushPerm === 'default' && (
              <button onClick={requestPush} className="notif-btn-primary">Enable</button>
            )}
          </div>
        )}
      </Section>

      {/* ── EMAIL FREQUENCY (only when email is on) ── */}
      {hasEmail && ch.email && (
        <Section title="Email frequency" hint="Batch us up if your inbox is busy.">
          <Card>
            <div role="radiogroup" aria-label="Email frequency" style={{ padding: 8 }}>
              {([
                { v: 'realtime', label: 'Real-time',   hint: 'One email per event' },
                { v: 'daily',    label: 'Daily digest', hint: 'Once per evening' },
                { v: 'weekly',   label: 'Weekly digest', hint: 'Sundays at 9am' },
                { v: 'never',    label: 'Off',          hint: 'No email notifications' },
              ] as Array<{ v: EmailFrequency; label: string; hint: string }>).map(o => (
                <button
                  key={o.v}
                  role="radio"
                  aria-checked={settings.notifications.emailFrequency === o.v}
                  onClick={() => setEmailFreq(o.v)}
                  style={{
                    all: 'unset', cursor: 'pointer', width: '100%',
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 12px', borderRadius: 10,
                    background: settings.notifications.emailFrequency === o.v ? 'var(--bg-inset)' : 'transparent',
                  }}
                >
                  <span style={{
                    width: 16, height: 16, borderRadius: '50%',
                    border: '2px solid ' + (settings.notifications.emailFrequency === o.v ? 'var(--text-primary)' : 'var(--border-default)'),
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {settings.notifications.emailFrequency === o.v && (
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--text-primary)' }} />
                    )}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{o.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{o.hint}</div>
                  </div>
                </button>
              ))}
            </div>
          </Card>
        </Section>
      )}

      {/* ── CATEGORIES ── */}
      <Section title="What to notify me about" hint="Pick the topics you actually care about.">
        <Card>
          <CategoryRow
            icon={<MessageCircle size={15} strokeWidth={1.8} />}
            title="Direct messages"
            subtitle="Someone wants to swap, request, or chat"
            on={cat.messages}
            onChange={(v) => setCategories({ messages: v })}
          />
          <Divider />
          <CategoryRow
            icon={<Sparkles size={15} strokeWidth={1.8} />}
            title="Saved alert matches"
            subtitle="A new post matches your alert criteria"
            on={cat.matches}
            onChange={(v) => setCategories({ matches: v })}
          />
          <Divider />
          <CategoryRow
            icon={<CalendarDays size={15} strokeWidth={1.8} />}
            title="Event reminders"
            subtitle="Day-of nudges for events you RSVP'd to"
            on={cat.events}
            onChange={(v) => setCategories({ events: v })}
          />
          <Divider />
          <CategoryRow
            icon={<Store size={15} strokeWidth={1.8} />}
            title="Marketplace activity"
            subtitle="Price drops + reposts on items you saved"
            on={cat.marketplace}
            onChange={(v) => setCategories({ marketplace: v })}
          />
          <Divider />
          <CategoryRow
            icon={<Search size={15} strokeWidth={1.8} />}
            title="Lost & Found matches"
            subtitle="A nearby report sounds like yours"
            on={cat.lostFound}
            onChange={(v) => setCategories({ lostFound: v })}
          />
          <Divider />
          <CategoryRow
            icon={<Megaphone size={15} strokeWidth={1.8} />}
            title="Community announcements"
            subtitle="From your community admins"
            on={cat.community}
            onChange={(v) => setCategories({ community: v })}
          />
          <Divider />
          <CategoryRow
            icon={<Newspaper size={15} strokeWidth={1.8} />}
            title="Weekly digest"
            subtitle="A recap of what's circulating each week"
            on={cat.digest}
            onChange={(v) => setCategories({ digest: v })}
          />
        </Card>
      </Section>

      {/* ── QUIET HOURS ── */}
      <Section title="Quiet hours" hint="We'll hold notifications during this window.">
        <Card>
          <Row label="Enable quiet hours">
            <Toggle on={qh.enabled} onChange={(v) => setQuiet({ enabled: v })} />
          </Row>
          {qh.enabled && (
            <>
              <Divider />
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>From</div>
                </div>
                <input
                  type="time"
                  value={qh.from}
                  onChange={(e) => setQuiet({ from: e.target.value })}
                  className="form-input"
                  style={{ width: 100, padding: '6px 8px', fontSize: 13 }}
                />
              </div>
              <Divider />
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>To</div>
                </div>
                <input
                  type="time"
                  value={qh.to}
                  onChange={(e) => setQuiet({ to: e.target.value })}
                  className="form-input"
                  style={{ width: 100, padding: '6px 8px', fontSize: 13 }}
                />
              </div>
            </>
          )}
        </Card>
      </Section>

      {(!hasEmail || !hasPhone) && (
        <div style={{ padding: '0 20px 24px' }}>
          <div style={{
            display: 'flex', gap: 10,
            padding: 12, borderRadius: 12,
            background: 'var(--bg-inset)',
            border: '1px dashed var(--border-default)',
          }}>
            <Info size={14} strokeWidth={1.8} color="var(--text-secondary)" style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45 }}>
              Add {[!hasEmail && 'an email', !hasPhone && 'a phone number'].filter(Boolean).join(' and ')}
              {' '}in your Account to unlock {!hasEmail && !hasPhone ? 'email and SMS' : !hasEmail ? 'email' : 'SMS'} notifications.
              <button
                onClick={onOpenAccount}
                style={{
                  all: 'unset', cursor: 'pointer', marginLeft: 6,
                  color: 'var(--text-primary)', fontWeight: 600,
                  textDecoration: 'underline',
                }}
              >
                Open account
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .notif-btn-primary {
          background: var(--text-primary);
          color: var(--bg-base);
          border: none; border-radius: 999px;
          padding: 6px 12px; font-size: 12px; font-weight: 600;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}

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
      {children}
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
  return <div style={{ height: 1, background: 'var(--border-default)', opacity: 0.6, marginLeft: 56 }} />;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 16px',
    }}>
      <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
        {label}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function ChannelRow({ icon, title, subtitle, on, onChange, disabled, disabledHint, onAction }: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  disabledHint?: string;
  onAction?: { label: string; onClick: () => void };
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 16px', opacity: disabled ? 0.7 : 1,
    }}>
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
            {disabled && disabledHint ? disabledHint : subtitle}
          </div>
        )}
      </div>
      {onAction ? (
        <button onClick={onAction.onClick} className="notif-btn-primary">{onAction.label}</button>
      ) : (
        <Toggle on={on} onChange={onChange} disabled={disabled} />
      )}
      <style jsx>{`
        .notif-btn-primary {
          background: var(--text-primary);
          color: var(--bg-base);
          border: none; border-radius: 999px;
          padding: 6px 12px; font-size: 12px; font-weight: 600;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}

function CategoryRow({ icon, title, subtitle, on, onChange }: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 16px',
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 10,
        background: 'var(--bg-inset)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-secondary)', flexShrink: 0,
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
      <Toggle on={on} onChange={onChange} />
    </div>
  );
}
