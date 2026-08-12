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
  ios: {
    backgroundColor: '#FAFAF6',
    /* The web layer already paints its own strip behind the status bar
       (.app-container::before, sized by env(safe-area-inset-top)) and pads for
       the home indicator itself. Letting Capacitor inset the WebView as well
       would double every safe-area allowance and leave a dead band under the
       notch. 'never' hands safe-area handling entirely to the CSS, which is
       where it already lives for Android. */
    contentInset: 'never',
    /* Keep the rubber-band scroll — an app that doesn't bounce reads as a
       website in a shell, which is the first thing App Review looks for. */
    scrollEnabled: true,
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
