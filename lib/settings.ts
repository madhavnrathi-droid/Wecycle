/* Local-only user preferences. Stored in localStorage and synced across tabs
   via a CustomEvent so multiple components stay in lock-step.

   Server-backed prefs (notifications routing) live here too; when we wire
   Supabase the same shape will round-trip to `public.user_settings`. */

export type ThemeMode = 'light' | 'dark' | 'system';

export type Privacy =
  | 'public'      /* visible to anyone */
  | 'community'   /* visible to your community only */
  | 'private';    /* hidden — opt-in to share contact */

export type EmailFrequency = 'realtime' | 'daily' | 'weekly' | 'never';

export interface NotifChannels {
  inApp: boolean;          /* show in the activity tab + push toasts */
  sound: boolean;          /* play a soft chime alongside in-app */
  email: boolean;          /* master email opt-in */
  sms:   boolean;          /* master SMS opt-in (requires phone) */
}

export interface NotifCategories {
  messages:    boolean;    /* DMs about items / events */
  matches:     boolean;    /* saved alerts firing on new posts */
  events:      boolean;    /* RSVP reminders + organizer updates */
  marketplace: boolean;    /* price drops / reposts on items you saved */
  lostFound:   boolean;    /* matches on something you lost or found */
  community:   boolean;    /* announcements from your community */
  digest:      boolean;    /* weekly recap email */
}

export interface QuietHours {
  enabled: boolean;
  from: string;            /* 'HH:MM' 24h */
  to:   string;
}

export interface AppearanceSettings {
  theme: ThemeMode;
  reduceMotion: boolean;
  largerText: boolean;
}

export interface PrivacySettings {
  profile: Privacy;
  showOnlineStatus: boolean;
  allowDMs: boolean;
  showPhone: boolean;
  showEmail: boolean;
  hideListingsFromSearch: boolean;
}

export interface NotificationSettings {
  channels: NotifChannels;
  categories: NotifCategories;
  emailFrequency: EmailFrequency;
  quietHours: QuietHours;
}

export interface DataSettings {
  /* If true, image uploads are auto-downscaled before posting to save bandwidth */
  dataSaver: boolean;
  /* Auto-clear viewed items from local cache after N days */
  cacheDays: number;
}

export interface MarketplaceSettings {
  defaultPickupRadiusKm: number;
  preferredCurrency: 'INR' | 'USD' | 'EUR' | 'GBP';
  hidePriceOnFeed: boolean;
}

export interface UserSettings {
  appearance: AppearanceSettings;
  privacy: PrivacySettings;
  notifications: NotificationSettings;
  data: DataSettings;
  marketplace: MarketplaceSettings;
}

export const DEFAULT_SETTINGS: UserSettings = {
  appearance: {
    theme: 'system',
    reduceMotion: false,
    largerText: false,
  },
  privacy: {
    profile: 'community',
    showOnlineStatus: true,
    allowDMs: true,
    showPhone: false,
    showEmail: false,
    hideListingsFromSearch: false,
  },
  notifications: {
    channels: { inApp: true, sound: true, email: true, sms: false },
    categories: {
      messages: true,
      matches: true,
      events: true,
      marketplace: true,
      lostFound: true,
      community: true,
      digest: true,
    },
    emailFrequency: 'realtime',
    quietHours: { enabled: false, from: '22:00', to: '07:00' },
  },
  data: {
    dataSaver: false,
    cacheDays: 30,
  },
  marketplace: {
    defaultPickupRadiusKm: 5,
    preferredCurrency: 'INR',
    hidePriceOnFeed: false,
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

/** Resolve "system" against the current OS preference. */
export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode;
  if (!isBrowser()) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Apply the theme to <html> by toggling the `.dark` class. */
export function applyTheme(mode: ThemeMode) {
  if (!isBrowser()) return;
  const resolved = resolveTheme(mode);
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  /* Also expose the chosen mode + resolved for CSS that wants it */
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themeMode = mode;
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
