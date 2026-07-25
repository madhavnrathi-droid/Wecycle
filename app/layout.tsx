import type { Metadata } from "next";
import type { Viewport } from "next/dist/lib/metadata/types/extra-types";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import Script from "next/script";
import { AuthProvider } from "../lib/AuthContext";
import { SITE_URL } from "../lib/siteUrl";
import SessionSplash from "../components/SessionSplash";
import NativeInit from "../components/NativeInit";
import "./globals.css";

/* Microsoft Clarity project ID. Hard-coded because Clarity's snippet is
 * public-by-design — the ID is embedded in the script URL on every page that
 * loads it, so there's no secret to hide. Keeping it inline (not in env) so
 * Vercel preview builds also report into the same dashboard. */
const CLARITY_PROJECT_ID = "wy1d87md22";

/* Google Tag Manager container ID. Public-by-design like the Clarity ID —
 * it appears in the request URL the moment GTM loads. Additional pixels
 * (Facebook, LinkedIn ad conversions, etc.) get configured *inside* the
 * GTM UI, which means we never need to touch this file again for those. */
const GTM_ID = "GTM-T59PDHDF";

/* Google Analytics 4 Measurement ID. We install gtag.js directly here
 * (instead of through GTM) so basic page-view + event tracking works the
 * moment we ship — no manual GTM publish step required. If you ever want
 * GA4 *also* configured inside GTM, REMOVE THE GTM CONFIGURATION TAG
 * there — otherwise every hit gets counted twice. */
const GA4_MEASUREMENT_ID = "G-FR9104LN7N";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Wecycle — Community Operating System",
  description:
    "Circulate resources within your community — share, swap, repair, and request what you need. Built for campuses, apartments, and neighborhoods.",
  manifest: "/manifest.json",
  applicationName: "Wecycle",
  /* Favicon + apple-touch-icon come from app/icon.png and app/apple-icon.png
     (Next App Router file conventions) — no manual <link> needed. PWA install
     icons live in manifest.json. */
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Wecycle",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    title: "Wecycle — Community Operating System",
    description: "Circulate resources within your community.",
    siteName: "Wecycle",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Wecycle" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Wecycle",
    description: "Circulate resources within your community.",
    images: ["/og-image.png"],
  },
  /* Hint to the OS that this is an installable PWA */
  other: {
    "msapplication-tap-highlight": "no",
  },
  /* Wecycle is light-only — pin the browser/PWA chrome to the cream surface so
     a phone in OS dark mode never tints the status bar dark over a light app.
     (Single non-media value; no dark variant.) */
  themeColor: "#FAFAF6",
  viewport: {
    width: "device-width",
    initialScale: 1,
    /* DO NOT lock maximumScale — that blocks zoom and violates WCAG 1.4.4 */
    viewportFit: "cover",
  },
};

/* viewport export kept for forward-compat with Next 14+ */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* apple-touch-icon + favicon are emitted from metadata.icons above */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />

        {/* ── Google Tag Manager ──
            GTM is the canonical container for any non-GA4 tags we wire up
            later (Facebook Pixel, LinkedIn Insight, ad conversions). GA4
            itself is installed directly below — DO NOT also add a GA4
            Configuration tag inside GTM or every hit will be counted twice.
            Both GTM and gtag use the same `window.dataLayer` so events
            pushed by `lib/analytics.ts` reach both pipelines. */}
        <Script id="gtm-init" strategy="afterInteractive">
          {`
            (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','${GTM_ID}');
          `}
        </Script>

        {/* ── Google Analytics 4 (gtag.js) ──
            Installed directly so basic page-view + custom events work the
            second this ships, with no manual GTM publish step. The async
            loader + the inline gtag init are the standard GA4 snippet,
            wrapped in next/script. The inline init runs synchronously
            against window.dataLayer (which GTM may have already created).
            Custom events live in lib/analytics.ts. */}
        <Script
          id="ga4-loader"
          src={`https://www.googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}`}
          strategy="afterInteractive"
        />
        <Script id="ga4-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            window.gtag = gtag;
            gtag('js', new Date());
            gtag('config', '${GA4_MEASUREMENT_ID}', {
              /* Single-page-app: we'll send our own page_view events on
                 screen changes via lib/analytics.ts → trackScreenView. */
              send_page_view: true,
            });
          `}
        </Script>

        {/* Microsoft Clarity — session replay + heatmaps + funnel analytics.
            Loaded via next/script with strategy="afterInteractive" so it
            never blocks the first paint, but still injects before the user
            starts clicking around. */}
        <Script id="ms-clarity" strategy="afterInteractive">
          {`
            (function(c,l,a,r,i,t,y){
                c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
                t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
                y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
            })(window, document, "clarity", "script", "${CLARITY_PROJECT_ID}");
          `}
        </Script>
      </head>
      <body className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}>
        {/* GTM noscript fallback — fires the container for browsers (and
            crawlers) that have JS disabled. Must be the first child of
            <body> per Google's spec. */}
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
        <AuthProvider>{children}</AuthProvider>
        {/* Full-screen brand splash on a new session — overlays everything,
            decides + paints before the app shows, then fades out. */}
        <SessionSplash />
        {/* Native (Capacitor) runtime setup — status bar, keyboard, splash.
            No-op on the web. */}
        <NativeInit />
      </body>
    </html>
  );
}
