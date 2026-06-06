/*
 * Wecycle mobile shell — Expo Go wrapper around the production PWA.
 *
 * The web app already targets mobile layouts (414px container, bottom nav,
 * camera intents, etc.). For native testing we mount it inside a WebView so
 * we can run the exact same UI inside Expo Go without maintaining a parallel
 * React Native build.
 *
 * Targets in this order:
 *   1. EXPO_PUBLIC_WECYCLE_URL  (override at run time)
 *   2. extra.webUrl in app.json (defaults to production)
 *   3. http://<lan-ip>:3000     (uncomment for local-dev hot reload)
 */

import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, View, ActivityIndicator, Text, useColorScheme } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { useRef, useState, useCallback } from 'react';

function resolveTargetUrl(): string {
  /* Highest priority: explicit env override (e.g. local LAN dev) */
  const envUrl =
    (process.env.EXPO_PUBLIC_WECYCLE_URL as string | undefined) ?? '';
  if (envUrl) return envUrl;

  /* Otherwise read from app.json -> expo.extra.webUrl */
  const extra = (Constants.expoConfig?.extra ?? {}) as { webUrl?: string };
  return extra.webUrl ?? 'https://wecycle-seven.vercel.app';
}

export default function App() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const targetUrl = resolveTargetUrl();
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);

  /* ── Native haptic bridge ──
   * The web app (lib/haptics.ts) posts { type:'haptic', style } messages.
   * We map them onto expo-haptics so iOS finally gets the real Taptic
   * Engine — something an installed PWA on iOS Safari can never do, since
   * Safari doesn't implement the Web Vibration API. */
  const onMessage = useCallback((e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data) as { type?: string; style?: string };
      if (msg.type !== 'haptic') return;
      switch (msg.style) {
        case 'selection': Haptics.selectionAsync(); break;
        case 'light':     Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); break;
        case 'medium':    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); break;
        case 'heavy':     Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); break;
        case 'success':   Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); break;
        case 'warning':   Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); break;
        case 'error':     Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); break;
        default: break;
      }
    } catch { /* non-JSON message — ignore */ }
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView
        style={[
          styles.safe,
          { backgroundColor: isDark ? '#0C0C0B' : '#FAFAF8' },
        ]}
        edges={['top', 'left', 'right']}
      >
        <StatusBar style={isDark ? 'light' : 'dark'} />

        <WebView
          ref={webRef}
          source={{ uri: targetUrl }}
          style={styles.webview}
          /* iOS — match the OS look behind the WebView, so any rubber-band
             pull-to-refresh doesn't flash white at the seam. */
          containerStyle={{ backgroundColor: isDark ? '#0C0C0B' : '#FAFAF8' }}
          /* Allow camera / photo library / file uploads from the in-app
             browser so the Post flow works end to end. */
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          /* Don't let the page navigate to non-https targets (mail:, tel:,
             whatsapp:) inside the webview — let the OS handle them. */
          originWhitelist={['https://*', 'http://*']}
          onShouldStartLoadWithRequest={(req) => {
            if (
              req.url.startsWith('mailto:') ||
              req.url.startsWith('tel:') ||
              req.url.startsWith('whatsapp:') ||
              req.url.startsWith('sms:')
            ) {
              return false;
            }
            return true;
          }}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          /* Receives haptic requests from the web app's lib/haptics.ts. */
          onMessage={onMessage}
          /* Pull-to-refresh on Android. */
          pullToRefreshEnabled
        />

        {loading && (
          <View
            pointerEvents="none"
            style={[
              styles.loader,
              { backgroundColor: isDark ? '#0C0C0B' : '#FAFAF8' },
            ]}
          >
            <ActivityIndicator
              size="large"
              color={isDark ? '#C4F649' : '#0C0C0B'}
            />
            <Text style={[styles.loaderLabel, { color: isDark ? '#FAFAF8' : '#0C0C0B' }]}>
              Wecycle
            </Text>
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  webview: { flex: 1, backgroundColor: 'transparent' },
  loader: {
    position: 'absolute',
    top: 0, bottom: 0, left: 0, right: 0,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loaderLabel: {
    marginTop: 14,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
