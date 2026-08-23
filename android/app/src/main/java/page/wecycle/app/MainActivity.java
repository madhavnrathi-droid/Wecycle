package page.wecycle.app;

import android.os.Bundle;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

/**
 * Applies the system window insets to the WebView.
 *
 * targetSdk 36 means Android enforces edge-to-edge: the activity is laid out
 * behind the status bar and behind the gesture/navigation bar, whether or not
 * it asks to be. On iOS the CSS copes with that on its own, because WebKit
 * reports env(safe-area-inset-*) — but the Android WebView reports those as
 * ZERO. So every safe-area allowance in globals.css evaluated to its fallback,
 * and the bottom navigation ended up underneath the gesture pill: the icons
 * were visible, the labels were not.
 *
 * Padding the WebView is the fix rather than another CSS guess, because the
 * inset is a device fact, not a constant. A gesture bar is about 24dp and a
 * three-button bar about 48dp; any hardcoded floor is wrong for one of them,
 * and wrong again on a foldable or in split screen. Asking the window means it
 * is right everywhere, including when the user switches navigation mode with
 * the app open — the listener re-fires.
 *
 * The insets are returned rather than consumed so the keyboard plugin's own
 * resize handling still sees them.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        ViewCompat.setOnApplyWindowInsetsListener(getBridge().getWebView(), (view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            /* The padded band shows the WebView's own background, which
               capacitor.config sets to #FAFAF6 — the same cream as the app. */
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return windowInsets;
        });
    }
}
