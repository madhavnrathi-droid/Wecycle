'use client';

/**
 * Native (Capacitor) runtime setup. No-ops on the web — every plugin is loaded
 * dynamically and only when running inside the native app, so the web bundle is
 * unaffected.
 *
 *  - Status bar: dark icons on the light (#FAFAF6) surface; Android bar bg set
 *    to match so it blends with the app header.
 *  - Keyboard: resize the web view so focused inputs aren't covered.
 *  - Splash: hide once the web app has mounted (snappier than a fixed timer).
 *  - Session: keep the auth token fresh across background/foreground so people
 *    never get bounced back to the OTP screen (see below).
 */

import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../lib/supabase';

export default function NativeInit() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    (async () => {
      try {
        const { StatusBar, Style } = await import('@capacitor/status-bar');
        /* Style.Dark = dark icons/text, for our light background. */
        await StatusBar.setStyle({ style: Style.Dark });
        if (Capacitor.getPlatform() === 'android') {
          await StatusBar.setBackgroundColor({ color: '#FAFAF6' });
        }
      } catch { /* plugin unavailable — ignore */ }

      try {
        const { Keyboard, KeyboardResize } = await import('@capacitor/keyboard');
        await Keyboard.setResizeMode({ mode: KeyboardResize.Native });
      } catch { /* ignore */ }

      try {
        const { SplashScreen } = await import('@capacitor/splash-screen');
        await SplashScreen.hide();
      } catch { /* ignore */ }
    })();
  }, []);

  /* ── Keep the session alive across app suspension ──
     autoRefreshToken runs on a timer, and the OS freezes timers while the app
     is backgrounded — so an app reopened after a long gap can come back with
     an expired access token. Supabase's documented fix is to tie the refresh
     loop to app state: refresh immediately on foreground, stand down on
     background (saves battery, and avoids refreshing when nobody's looking).
     The refresh token itself is long-lived, so this keeps people signed in
     indefinitely instead of sending them back for another OTP. */
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    supabase.auth.startAutoRefresh();

    let remove: (() => void) | undefined;
    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const handle = await App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) supabase.auth.startAutoRefresh();
          else supabase.auth.stopAutoRefresh();
        });
        remove = () => { handle.remove(); };
      } catch { /* plugin unavailable — the default timer still applies */ }
    })();

    return () => {
      remove?.();
      supabase.auth.stopAutoRefresh();
    };
  }, []);

  return null;
}
