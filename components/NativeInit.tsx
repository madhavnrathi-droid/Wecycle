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
 */

import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

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

  return null;
}
