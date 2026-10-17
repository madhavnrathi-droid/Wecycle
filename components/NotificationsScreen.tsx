'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft, Bell, Volume2, Mail, Phone,
  MessageCircle, Sparkles, CalendarDays, Store, Search,
  Megaphone, Newspaper, Info, MessageSquare, Reply,
  ShieldCheck, MapPin,
} from '@/lib/icons';
import {
  getSettings, saveSettings, onSettingsChange,
  notifAskState, recordNotifAsk,
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
  /* 'unasked' until the member answers the prompt below, either way. Read once
     on mount rather than during render — localStorage is not available on the
     server and this component renders on both. */
  const [ask, setAsk] = useState<'unasked' | 'on' | 'dismissed'>('on');

  useEffect(() => { setMounted(true); setAsk(notifAskState()); }, []);
  useEffect(() => onSettingsChange(setSettings), []);

  const hasEmail = useMemo(() => {
    return !!(
      (profile as { email?: string | null } | null)?.email ||
      (user as { email?: string | null } | null)?.email
    );
  }, [profile, user]);
  const hasPhone = useMemo(() => !!profile?.phone, [profile]);

  /* Browser push permission */
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

  return (
    <div className="screen-transition" style={{ paddingBottom: 80, background: 'var(--bg-base)', minHeight: '100%' }}>

      <header
        style={{
          position: 'sticky', top: 0, zIndex: 30,
          /* Opaque. --bg-overlay is 88% alpha, so content showed
             through the header as it scrolled past. */
          background: 'var(--bg-card)',
          padding: '10px 12px',
          display: 'flex', alignItems: 'center', gap: 8,
        }}
      >
        <button onClick={onBack} aria-label="Back" className="theme-toggle">
          <ChevronLeft size={20} strokeWidth={1.8} />
        </button>
        <h1 style={{
          margin: 0, flex: 1, textAlign: 'center',
          fontSize: 'calc(16px * var(--text-scale))', fontWeight: 600,
          letterSpacing: '-0.02em', color: 'var(--text-primary)',
        }}>
          Notifications
        </h1>
        <span style={{ width: 36 }} aria-hidden="true" />
      </header>

      {/* ── The ask ──────────────────────────────────────────────────────────
          Everything below this arrives switched off for anything that leaves
          the app, which is the honest default but only half the job: a default
          answers "what if nobody asks", and somebody still has to ask.

          Both buttons are the same size, the same weight and the same colour.
          A prompt whose decline is a grey whisper next to a bright Accept is
          the pattern this was written to remove, only louder. "Not now" is
          also final — it is recorded, and the prompt does not come back. */}
      {ask === 'unasked' && (
        <section style={{ padding: '4px 20px 18px' }}>
          <div style={{
            background: 'var(--bg-inset)',
            border: 'none',
            borderRadius: 16,
            padding: '16px 16px 14px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Bell size={20} aria-hidden="true" />
              <h2 style={{
                margin: 0, fontSize: 'calc(17px * var(--text-scale))', fontWeight: 600,
                letterSpacing: '-0.025em', color: 'var(--text-primary)',
              }}>
                Want to hear from Wecycle?
              </h2>
            </div>
            <p style={{
              margin: '0 0 14px', fontSize: 'calc(13px * var(--text-scale))',
              color: 'var(--text-secondary)', lineHeight: 1.5,
            }}>
              Email is off. Turn it on and we&apos;ll write when someone messages you about
              a post, replies to a request, or matches something you lost — nothing else,
              and you can change it any time on this screen.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  setChannels({ email: true });
                  recordNotifAsk('on');
                  setAsk('on');
                }}
                style={{
                  flex: 1, minHeight: 44, cursor: 'pointer',
                  border: 'none', borderRadius: 12,
                  background: '#FFFFFF', color: 'var(--text-primary)',
                  font: 'inherit', fontSize: 'calc(15px * var(--text-scale))', fontWeight: 600,
                  letterSpacing: '-0.015em',
                }}
              >
                Yes, email me
              </button>
              <button
                type="button"
                onClick={() => { recordNotifAsk('dismissed'); setAsk('dismissed'); }}
                style={{
                  flex: 1, minHeight: 44, cursor: 'pointer',
                  border: 'none', borderRadius: 12,
                  background: '#FFFFFF', color: 'var(--text-primary)',
                  font: 'inherit', fontSize: 'calc(15px * var(--text-scale))', fontWeight: 600,
                  letterSpacing: '-0.015em',
                }}
              >
                No thanks
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ── CHANNELS ── */}
      <Section title="Channels" hint="How you'd like Wecycle to reach you.">
        <Card>
          <ChannelRow
            icon={<Bell size={20} />}
            title="In-app"
            subtitle="Activity tab + banner toasts"
            on={ch.inApp}
            onChange={(v) => setChannels({ inApp: v })}
          />
          <Divider />
          <ChannelRow
            icon={<Volume2 size={20} />}
            title="Sound"
            subtitle="Play a chime with in-app alerts"
            on={ch.sound}
            disabled={!ch.inApp}
            disabledHint="Turn on in-app first"
            onChange={(v) => setChannels({ sound: v })}
          />
          <Divider />
          {/* Push — integrated inside the Channels card */}
          {pushPerm !== 'unsupported' && (
            <>
              <ChannelRow
                icon={<Bell size={20} />}
                title="Push"
                subtitle={
                  pushPerm === 'granted' ? 'Device alerts even when the app is closed' :
                  pushPerm === 'denied'  ? 'Blocked — re-enable in your browser settings' :
                  'Tap Enable to allow device push alerts'
                }
                on={pushPerm === 'granted'}
                disabled={pushPerm === 'denied'}
                disabledHint="Re-enable in browser settings"
                onChange={() => { if (pushPerm === 'default') requestPush(); }}
                actionLabel={pushPerm === 'default' ? 'Enable' : undefined}
                onActionClick={pushPerm === 'default' ? requestPush : undefined}
              />
              <Divider />
            </>
          )}
          <ChannelRow
            icon={<Mail size={20} />}
            title="Email"
            subtitle={hasEmail ? 'Sent to your account email' : 'Add an email to enable'}
            on={ch.email}
            disabled={!hasEmail}
            disabledHint="Add email in Account"
            onAction={!hasEmail ? { label: 'Add', onClick: onOpenAccount } : undefined}
            onChange={(v) => setChannels({ email: v })}
          />
          <Divider />
          <ChannelRow
            icon={<Phone size={20} />}
            title="SMS"
            subtitle={hasPhone ? 'Text messages to your phone' : 'Add a phone number to enable'}
            on={ch.sms}
            disabled={!hasPhone}
            disabledHint="Add phone in Account"
            onAction={!hasPhone ? { label: 'Add', onClick: onOpenAccount } : undefined}
            onChange={(v) => setChannels({ sms: v })}
          />
        </Card>
      </Section>

      {/* ── EMAIL FREQUENCY (only when email is on) ── */}
      {hasEmail && ch.email && (
        <Section title="Email frequency" hint="Batch us up if your inbox is busy.">
          <Card>
            <div role="radiogroup" aria-label="Email frequency" style={{ padding: 8 }}>
              {([
                { v: 'realtime', label: 'Real-time',    hint: 'One email per event' },
                { v: 'daily',    label: 'Daily digest',  hint: 'Once per evening' },
                { v: 'weekly',   label: 'Weekly digest', hint: 'Sundays at 9am' },
                { v: 'never',    label: 'Off',           hint: 'No email notifications' },
              ] as Array<{ v: EmailFrequency; label: string; hint: string }>).map(o => (
                <button
                  key={o.v}
                  role="radio"
                  aria-checked={settings.notifications.emailFrequency === o.v}
                  onClick={() => setEmailFreq(o.v)}
                  style={{
                    all: 'unset', boxSizing: 'border-box', cursor: 'pointer', width: '100%',
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 12px', borderRadius: 10,
                    background: 'transparent',
                  }}
                >
                  <span style={{
                    width: 18, height: 18, borderRadius: '50%',
                    border: '1.5px solid ' + (settings.notifications.emailFrequency === o.v ? 'var(--ink)' : 'var(--border-strong)'),
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {settings.notifications.emailFrequency === o.v && (
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--ink)' }} />
                    )}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 'calc(15px * var(--text-scale))', fontWeight: 400, letterSpacing: '-0.015em', color: 'var(--text-primary)' }}>{o.label}</div>
                    <div style={{ fontSize: 'calc(12px * var(--text-scale))', color: 'var(--text-muted)' }}>{o.hint}</div>
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
            icon={<MessageSquare size={20} />}
            title="Comments on my posts"
            subtitle="Someone comments on or likes your listing"
            on={cat.comments}
            onChange={(v) => setCategories({ comments: v })}
          />
          <Divider />
          <CategoryRow
            icon={<Reply size={20} />}
            title="Responses to my requests"
            subtitle="A reply comes in on a request you posted"
            on={cat.requestReplies}
            onChange={(v) => setCategories({ requestReplies: v })}
          />
          <Divider />
          <CategoryRow
            icon={<MessageCircle size={20} />}
            title="Direct messages"
            subtitle="Someone wants to swap, request, or chat"
            on={cat.messages}
            onChange={(v) => setCategories({ messages: v })}
          />
          <Divider />
          <CategoryRow
            icon={<Sparkles size={20} />}
            title="Saved-search alerts"
            subtitle="A new post matches your saved search keywords"
            on={cat.matches}
            onChange={(v) => setCategories({ matches: v })}
          />
          <Divider />
          <CategoryRow
            icon={<MapPin size={20} />}
            title="Lost & found nearby"
            subtitle="A new report near you matches your keywords"
            on={cat.lostFound}
            onChange={(v) => setCategories({ lostFound: v })}
          />
          <Divider />
          <CategoryRow
            icon={<CalendarDays size={20} />}
            title="Events near me"
            subtitle="Day-of nudges for events you RSVP'd to"
            on={cat.events}
            onChange={(v) => setCategories({ events: v })}
          />
          <Divider />
          <CategoryRow
            icon={<Store size={20} />}
            title="Marketplace activity"
            subtitle="Price drops + reposts on items you saved"
            on={cat.marketplace}
            onChange={(v) => setCategories({ marketplace: v })}
          />
          <Divider />
          <CategoryRow
            icon={<Megaphone size={20} />}
            title="Community announcements"
            subtitle="From your community admins"
            on={cat.community}
            onChange={(v) => setCategories({ community: v })}
          />
          <Divider />
          <CategoryRow
            icon={<ShieldCheck size={20} />}
            title="Account & security"
            subtitle="Sign-ins, password changes, suspicious activity"
            on={cat.accountSecurity}
            onChange={(v) => setCategories({ accountSecurity: v })}
          />
          <Divider />
          <CategoryRow
            icon={<Newspaper size={20} />}
            title="Weekly digest"
            subtitle="A recap of what's circulating each week"
            on={cat.digest}
            onChange={(v) => setCategories({ digest: v })}
          />
        </Card>
      </Section>

      {/* ── QUIET HOURS ── */}
      <Section title="Quiet hours" hint="Push and sound alerts are held during this window.">
        <Card>
          <Row label="Enable quiet hours" hint="No push or sound alerts during this time.">
            <Toggle on={qh.enabled} onChange={(v) => setQuiet({ enabled: v })} />
          </Row>
          {qh.enabled && (
            <>
              <Divider />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 'calc(15px * var(--text-scale))', fontWeight: 400, letterSpacing: '-0.015em', color: 'var(--text-primary)' }}>From</div>
                  <div style={{ fontSize: 'calc(12px * var(--text-scale))', color: 'var(--text-muted)', marginTop: 2 }}>Start of quiet window</div>
                </div>
                <input
                  type="time"
                  value={qh.from}
                  onChange={(e) => setQuiet({ from: e.target.value })}
                  className="form-input"
                  style={{ width: 104, padding: '6px 8px', fontSize: 'calc(13px * var(--text-scale))' }}
                />
              </div>
              <Divider />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 'calc(15px * var(--text-scale))', fontWeight: 400, letterSpacing: '-0.015em', color: 'var(--text-primary)' }}>To</div>
                  <div style={{ fontSize: 'calc(12px * var(--text-scale))', color: 'var(--text-muted)', marginTop: 2 }}>End of quiet window</div>
                </div>
                <input
                  type="time"
                  value={qh.to}
                  onChange={(e) => setQuiet({ to: e.target.value })}
                  className="form-input"
                  style={{ width: 104, padding: '6px 8px', fontSize: 'calc(13px * var(--text-scale))' }}
                />
              </div>
            </>
          )}
        </Card>
      </Section>

      {(!hasEmail || !hasPhone) && (
        <div style={{ padding: '0 20px 24px' }}>
          {/* A footnote, not a box: the glyph and the words are enough. */}
          <div style={{ display: 'flex', gap: 10, padding: '0 4px' }}>
            <Info size={18} color="var(--text-secondary)" style={{ flexShrink: 0, marginTop: 0 }} />
            <div style={{ fontSize: 'calc(13px * var(--text-scale))', color: 'var(--text-muted)', lineHeight: 1.4 }}>
              Add {[!hasEmail && 'an email', !hasPhone && 'a phone number'].filter(Boolean).join(' and ')}
              {' '}in your Account to unlock {!hasEmail && !hasPhone ? 'email and SMS' : !hasEmail ? 'email' : 'SMS'} notifications.
              <button
                onClick={onOpenAccount}
                style={{
                  all: 'unset', boxSizing: 'border-box', cursor: 'pointer', marginLeft: 6,
                  color: 'var(--brand-ink)', fontWeight: 500,
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
          background: var(--ink);
          color: #FFFFFF;
          border: none; border-radius: 999px;
          padding: 7px 14px; font-size: calc(13px * var(--text-scale)); font-weight: 600;
          letter-spacing: -0.006em;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}

/* ──────────────────────────────────────────────── */
/*  Layout primitives (mirror SettingsScreen)        */
/* ──────────────────────────────────────────────── */

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section style={{ padding: '4px 20px 18px' }}>
      <div style={{ marginBottom: 10 }}>
        <h3 style={{
          margin: 0, fontSize: 'calc(11px * var(--text-scale))', fontWeight: 500,
          letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)',
          color: 'var(--text-secondary)',
        }}>
          {title}
        </h3>
        {hint && (
          <p style={{ margin: '4px 0 0', fontSize: 'calc(12px * var(--text-scale))', color: 'var(--text-muted)', lineHeight: 1.4 }}>
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
      background: 'var(--bg-inset)',
      border: 'none',
      borderRadius: 16,
      overflow: 'hidden',
    }}>
      {children}
    </div>
  );
}

function Divider() {
  /* Inset to the text, past the glyph — the iOS grouped-list rule. */
  return <div style={{ height: 0.5, background: 'var(--hairline)', marginLeft: 56 }} />;
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', minHeight: 52 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'calc(15px * var(--text-scale))', fontWeight: 400, color: 'var(--text-primary)', letterSpacing: '-0.015em' }}>
          {label}
        </div>
        {hint && (
          <p style={{ margin: '2px 0 0', fontSize: 'calc(12px * var(--text-scale))', color: 'var(--text-muted)', lineHeight: 1.35 }}>
            {hint}
          </p>
        )}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function ChannelRow({ icon, title, subtitle, on, onChange, disabled, disabledHint, onAction, actionLabel, onActionClick }: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  disabledHint?: string;
  onAction?: { label: string; onClick: () => void };
  actionLabel?: string;
  onActionClick?: () => void;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 16px', opacity: disabled ? 0.7 : 1,
    }}>
      <div style={{
        width: 28, height: 28,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-primary)', flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'calc(15px * var(--text-scale))', fontWeight: 400, color: 'var(--text-primary)', letterSpacing: '-0.015em' }}>
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: 'calc(12px * var(--text-scale))', color: 'var(--text-muted)', marginTop: 2 }}>
            {disabled && disabledHint ? disabledHint : subtitle}
          </div>
        )}
      </div>
      {onAction ? (
        <button onClick={onAction.onClick} className="notif-btn-primary">{onAction.label}</button>
      ) : actionLabel && onActionClick ? (
        <button onClick={onActionClick} className="notif-btn-primary">{actionLabel}</button>
      ) : (
        <Toggle on={on} onChange={onChange} disabled={disabled} />
      )}
      <style jsx>{`
        .notif-btn-primary {
          background: var(--ink);
          color: #FFFFFF;
          border: none; border-radius: 999px;
          padding: 7px 14px; font-size: calc(13px * var(--text-scale)); font-weight: 600;
          letter-spacing: -0.006em;
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
      <div style={{
        width: 28, height: 28,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-primary)', flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'calc(15px * var(--text-scale))', fontWeight: 400, color: 'var(--text-primary)', letterSpacing: '-0.015em' }}>
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: 'calc(12px * var(--text-scale))', color: 'var(--text-muted)', marginTop: 2 }}>
            {subtitle}
          </div>
        )}
      </div>
      <Toggle on={on} onChange={onChange} />
    </div>
  );
}
