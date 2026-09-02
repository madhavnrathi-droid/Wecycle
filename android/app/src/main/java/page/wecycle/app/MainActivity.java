package page.wecycle.app;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

import java.util.Locale;

/**
 * Reports the real system window insets to the web layer.
 *
 * targetSdk 36 means Android enforces edge-to-edge: the activity is laid out
 * behind the status bar and behind the gesture/navigation bar whether or not it
 * asks to be. On iOS the CSS copes on its own because WebKit fills in
 * env(safe-area-inset-*) — but the Android WebView reports those as ZERO. So
 * every safe-area allowance in globals.css fell back to its constant: the
 * Wecycle wordmark sat under the camera cutout, and the back/home/recents bar
 * sat on top of the bottom navigation.
 *
 * WHY THIS WRITES CSS RATHER THAN PADDING THE WEBVIEW
 *
 * The obvious fix — view.setPadding(insets) — is wrong, and wrong in a way that
 * only shows up at the bottom of the screen. WebView padding clips what is
 * DRAWN; it does not move the CSS viewport. So `position: fixed; bottom: 0`
 * still resolves to the true bottom of the window, and the bottom navigation
 * was laid out underneath the padding and had its icons sliced off along that
 * line. Verified on an API 36 emulator in three-button mode: the system buttons
 * were clear of the app, and the app's own nav icons were cut in half.
 *
 * Handing the measurement to CSS instead means the layout can actually use it:
 * the nav pads its own content clear of the system bar while its white surface
 * still runs to the bottom of the screen, which is what edge-to-edge is
 * supposed to look like. It also means Android and iOS share one mechanism —
 * globals.css reads var(--safe-*) and never has to know which platform it is
 * on. See the "Safe area" block at the top of that file.
 *
 * WHY THE VALUES ARE RE-PUBLISHED AFTER THE PAGE LOADS
 *
 * Setting a property on <html> writes it onto the CURRENT document. The first
 * inset dispatch happens while the WebView is still on about:blank, so the
 * values were being written and then thrown away the moment the bundle loaded
 * — the emulator showed the navigation bar sitting straight back on top of the
 * app's own nav, exactly as reported. Nothing is wrong with the measurement;
 * it just has to be re-stated to the document that ends up on screen. The
 * watcher below re-publishes once the load reaches 100% and then stops.
 *
 * The insets are returned rather than consumed so the keyboard plugin's own
 * resize handling still sees them.
 */
public class MainActivity extends BridgeActivity {

    /** Last measurement, so it can be re-stated to a freshly loaded document. */
    private Insets lastInsets = Insets.NONE;
    private final Handler handler = new Handler(Looper.getMainLooper());

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) {
            return;
        }

        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            lastInsets = bars;
            publishInsets((WebView) view, bars);
            return windowInsets;
        });

        /* A listener only runs when a dispatch happens, and the first dispatch
           of the activity's life can land before this one is attached — in
           which case nothing is applied until a rotation or the keyboard forces
           another pass, and the app looks broken until you turn the phone
           sideways. Ask for that first pass explicitly. */
        ViewCompat.requestApplyInsets(webView);

        awaitPageThenRepublish(webView, 0);
    }

    /**
     * Re-state the insets to whatever document is loaded once the load
     * finishes. Gives up after roughly fifteen seconds so a failed load cannot
     * leave a runnable ticking forever.
     */
    private void awaitPageThenRepublish(WebView webView, int attempt) {
        if (attempt > 75) {
            return;
        }
        handler.postDelayed(() -> {
            if (webView.getProgress() >= 100) {
                publishInsets(webView, lastInsets);
            } else {
                awaitPageThenRepublish(webView, attempt + 1);
            }
        }, 200);
    }

    @Override
    public void onResume() {
        super.onResume();
        /* Ask again on resume: the web layer may have reloaded (which discards
           inline styles set on <html>), and the navigation mode may have been
           changed while we were backgrounded. */
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) {
            ViewCompat.requestApplyInsets(webView);
            awaitPageThenRepublish(webView, 0);
        }
    }

    /**
     * Write the four insets onto <html> as the same custom properties the
     * stylesheet declares, so they override its env()-based defaults.
     *
     * Insets arrive in physical pixels and CSS wants density-independent ones,
     * so everything is divided by the display density. Skipping that step makes
     * a 48dp navigation bar reserve 144px on a 3x screen.
     */
    private void publishInsets(WebView webView, Insets bars) {
        float density = getResources().getDisplayMetrics().density;
        if (density <= 0f) {
            density = 1f;
        }

        String js = String.format(
                Locale.US,
                "(function(){var s=document.documentElement.style;"
                        + "s.setProperty('--safe-top','%dpx');"
                        + "s.setProperty('--safe-right','%dpx');"
                        + "s.setProperty('--safe-bottom','%dpx');"
                        + "s.setProperty('--safe-left','%dpx');})();",
                Math.round(bars.top / density),
                Math.round(bars.right / density),
                Math.round(bars.bottom / density),
                Math.round(bars.left / density));

        webView.evaluateJavascript(js, null);
    }
}
