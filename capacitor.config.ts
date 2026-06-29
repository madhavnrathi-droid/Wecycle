import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Wecycle native app (Capacitor). Same app id as the Play listing
 * (`page.wecycle.app`). The web build stays a normal Next.js app on Vercel;
 * the NATIVE build bundles a static export (`out/`, produced with CAP_EXPORT=1)
 * so the app opens instantly and works without a network round-trip for the
 * shell. All data still comes from Supabase over the network at runtime.
 */
const config: CapacitorConfig = {
  appId: 'page.wecycle.app',
  appName: 'Wecycle',
  webDir: 'out',
  android: {
    backgroundColor: '#FAFAF6',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      launchAutoHide: true,
      backgroundColor: '#FAFAF6',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
  },
};

export default config;
