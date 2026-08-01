/* Local-only user preferences. Stored in localStorage and synced across tabs
   via a CustomEvent so multiple components stay in lock-step.

   Server-backed prefs (notifications routing) live here too; when we wire
   Supabase the same shape will round-trip to `public.user_settings`. */

export type ThemeMode = 'light' | 'dark' | 'system';

export type EmailFrequency = 'realtime' | 'daily' | 'weekly' | 'never';

export interface NotifChannels {
  inApp: boolean;          /* show in the activity tab + push toasts */
  sound: boolean;          /* play a soft chime alongside in-app */
  email: boolean;          /* master email opt-in */
  sms:   boolean;          /* master SMS opt-in (requires phone) */
}

export interface NotifCategories {
  comments:        boolean;    /* replies / likes on your own posts */
  requestReplies:  boolean;    /* someone responds to a request you posted */
  messages:        boolean;    /* DMs about items / events */
  matches:         boolean;    /* saved-search alerts firing on new posts */
  events:          boolean;    /* RSVP reminders + organizer updates */
  lostFound:       boolean;    /* matches on something you lost or found */
  marketplace:     boolean;    /* price drops / reposts on items you saved */
  community:       boolean;    /* announcements from your community */
  accountSecurity: boolean;    /* sign-ins, password changes, suspicious activity */
  digest:          boolean;    /* weekly recap email */
}

export interface QuietHours {
  enabled: boolean;
  from: string;            /* 'HH:MM' 24h */
  to:   string;
}

export interface AppearanceSettings {
  theme: ThemeMode;
  largerText: boolean;
}

export interface PrivacySettings {
  /* Profiles are always public for community safety. We still let users:
     - hide their phone number from the public profile,
     - opt out of DMs entirely,
     - hide their own listings from search while cleaning up,
     - and broadcast presence ("Online") to others. */
  showOnlineStatus: boolean;
  allowDMs: boolean;
  showPhone: boolean;
  hideListingsFromSearch: boolean;
}

/* How OTHERS reach the user about their posts — separate from notification
 * channels (which control inbound noise). When `whatsapp` is on but the user
 * hasn't added a phone, the picker on the product page automatically falls
 * back to email so the action button is never dead.
 *
 * Defaults: both on, because the whole product premise is being reachable. */
export interface ContactSettings {
  email: boolean;
  whatsapp: boolean;
}

export interface NotificationSettings {
  channels: NotifChannels;
  categories: NotifCategories;
  emailFrequency: EmailFrequency;
  quietHours: QuietHours;
}

export interface DataSettings {
  /* Auto-clear viewed items from local cache after N days */
  cacheDays: number;
}

export interface MarketplaceSettings {
  hidePriceOnFeed: boolean;
}

export interface UserSettings {
  appearance: AppearanceSettings;
  privacy: PrivacySettings;
  notifications: NotificationSettings;
  data: DataSettings;
  marketplace: MarketplaceSettings;
  contact: ContactSettings;
}

export const DEFAULT_SETTINGS: UserSettings = {
  appearance: {
    /* First-time visitors land in light mode rather than auto-following the
     * OS. Wecycle's brand reads as a bright, friendly community board first
     * — handing the user a black screen on initial load (which is what most
     * Macs / Androids default to at night) doesn't match the brand. Once
     * the user toggles theme or signs in, their explicit choice persists
     * via the saveSettings merge below. */
    theme: 'light',
    largerText: false,
  },
  privacy: {
    showOnlineStatus: true,
    allowDMs: true,
    showPhone: false,
    hideListingsFromSearch: false,
  },
  notifications: {
    channels: { inApp: true, sound: true, email: true, sms: false },
    categories: {
      comments: true,
      requestReplies: true,
      messages: true,
      matches: true,
      events: true,
      lostFound: true,
      marketplace: true,
      community: true,
      accountSecurity: true,
      digest: true,
    },
    emailFrequency: 'realtime',
    quietHours: { enabled: false, from: '22:00', to: '07:00' },
  },
  data: {
    cacheDays: 30,
  },
  marketplace: {
    hidePriceOnFeed: false,
  },
  contact: {
    email: true,
    /* Must match profiles.contact_whatsapp_enabled, which defaults to FALSE.
       Defaulting this to true made Settings show WhatsApp as already enabled
       while the DB flag was off, so it never appeared on the user's posts and
       there was nothing to toggle to fix it. */
    whatsapp: false,
  },
};

const STORAGE_KEY = 'wecycle.settings.v1';
const CHANGE_EVENT = 'wecycle:settings-changed';

/* ── Storage helpers ──────────────────────────── */

function isBrowser() {
  return typeof window !== 'undefined';
}

function deepMerge<T>(base: T, patch: Partial<T> | undefined): T {
  if (!patch) return base;
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...(base as any) };
  for (const k of Object.keys(patch)) {
    const v = (patch as any)[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object') {
      out[k] = deepMerge(out[k], v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

export function getSettings(): UserSettings {
  if (!isBrowser()) return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return deepMerge(DEFAULT_SETTINGS, JSON.parse(raw)) as UserSettings;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(patch: Partial<UserSettings> | ((cur: UserSettings) => UserSettings)) {
  if (!isBrowser()) return;
  const cur = getSettings();
  const next = typeof patch === 'function' ? patch(cur) : deepMerge(cur, patch);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }));
}

/* Subscribe to changes. Returns an unsubscribe function. */
export function onSettingsChange(cb: (s: UserSettings) => void): () => void {
  if (!isBrowser()) return () => {};
  const handler = (e: Event) => cb((e as CustomEvent<UserSettings>).detail);
  /* Cross-tab via storage event */
  const storageHandler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) cb(getSettings());
  };
  window.addEventListener(CHANGE_EVENT, handler);
  window.addEventListener('storage', storageHandler);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener('storage', storageHandler);
  };
}

/* ── Theme application ─────────────────────────── */

/** Dark mode has been retired — Wecycle is light-only. We keep the signature so
 *  callers/persisted settings stay valid, but it always resolves to light. */
export function resolveTheme(_mode: ThemeMode): 'light' | 'dark' {
  return 'light';
}

/* The two surface colors the browser/OS chrome should tint to. Must match
 * --bg-base in globals.css for light + dark so the status bar / PWA title
 * bar blends seamlessly into the app instead of showing a seam. */
const THEME_COLOR = { light: '#FAFAF6', dark: '#0C0C0B' } as const;

/** Apply the theme to <html> by toggling the `.dark` class. */
export function applyTheme(mode: ThemeMode) {
  if (!isBrowser()) return;
  const resolved = resolveTheme(mode);
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  /* Also expose the chosen mode + resolved for CSS that wants it */
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themeMode = mode;

  /* Drive the browser/PWA chrome tint from the app's ACTUAL theme, not the
   * OS preference. Without this, a user whose phone is in dark mode but who
   * sees Wecycle's light-default UI would get a black Android status bar
   * over a cream app — a visible seam. We update (or create) the
   * <meta name="theme-color"> live on every theme change. */
  const color = THEME_COLOR[resolved];
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = color;
}

/** Apply the "larger text" preference by toggling a root class. CSS keys off
 *  `.text-larger` to bump base font sizes globally. */
export function applyLargerText(on: boolean) {
  if (!isBrowser()) return;
  document.documentElement.classList.toggle('text-larger', on);
}

/** Build a once-per-app effect: applies the theme and reacts to OS changes
 *  when mode === 'system'. Returns an unsubscribe fn for cleanup. */
export function watchSystemTheme(mode: ThemeMode, onChange: () => void): () => void {
  if (!isBrowser() || mode !== 'system') return () => {};
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => onChange();
  /* Safari < 14 lacks addEventListener on MediaQueryList */
  if (mq.addEventListener) mq.addEventListener('change', handler);
  else mq.addListener?.(handler);
  return () => {
    if (mq.removeEventListener) mq.removeEventListener('change', handler);
    else mq.removeListener?.(handler);
  };
}
