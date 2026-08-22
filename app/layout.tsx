import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { AuthProvider } from "../lib/AuthContext";
import { SITE_URL } from "../lib/siteUrl";
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
            pushed by `lib/analytics.ts` reach both pipelines.

            lazyOnload, not afterInteractive: this is a tag CONTAINER, and until
            tags are configured in it there is nothing here the first screen
            needs. afterInteractive put it in the same queue as the app's own
            hydration, on a page whose problem is people leaving before it
            finishes. */}
        <Script id="gtm-init" strategy="lazyOnload">
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
            Custom events live in lib/analytics.ts.

            DELIBERATELY still afterInteractive while GTM and Clarity move to
            lazyOnload. GA4 is the thing measuring the bounce rate, and a
            bounced visit is by definition a short one — defer the beacon and
            the quickest exits stop being counted, which lowers the REPORTED
            number without a single real user staying longer. Fixing a metric by
            breaking its instrument is the one optimisation here that would be
            worse than doing nothing. gtag is also the lightest of the three. */}
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
              /* false, and this is load-bearing. Every screen here lives in one
                 route, so app/page.tsx owns page_view and fires it on each
                 screen change — including the first, which is why the automatic
                 one is switched off. Left on, the landing screen would be
                 counted twice and a deep link would report "/" before it
                 reported the post that was actually opened.

                 It used to be true, paired with a comment claiming
                 trackScreenView sent the rest. Nothing called trackScreenView,
                 so this was the only page_view the app ever sent. */
              send_page_view: false,

              /* ── The two flags that keep this out of ATT territory ──
                 Apple defines tracking as linking this app's data with data
                 from OTHER companies' apps or sites for advertising, or sharing
                 it with a data broker. Analytics is not tracking — but GA4 can
                 become tracking if Google Signals is on, because that is
                 precisely Google linking this property's data to its
                 cross-property ads graph.

                 Off, explicitly, so "Wecycle does not track" is something the
                 code enforces rather than something we assert. App Review asked
                 the question once; this is the answer being true by
                 construction, and it is quotable in the reply. */
              allow_google_signals: false,
              allow_ad_personalization_signals: false,
            });
          `}
        </Script>

        {/* Microsoft Clarity — session replay + heatmaps + funnel analytics.

            The heaviest third party here by a distance: it does not just report,
            it RECORDS, instrumenting the DOM and streaming mutations for the
            whole visit. afterInteractive had it doing that while the feed was
            still trying to render. lazyOnload holds it until the browser is
            idle after load, which costs a fraction of a second of replay
            coverage and buys that time back on every first paint. */}
        <Script id="ms-clarity" strategy="lazyOnload">
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
        {/* The session splash that stood here is gone. It held a full-screen
            overlay for 1400ms and then faded for another 640ms, so better than
            two seconds of every new session were spent looking at a logo
            instead of the app. On a bounce-rate problem that is the single
            most expensive thing on the page: it delayed nothing technical, it
            was pure dwell, and it ran on exactly the visit — the first one —
            where a stranger decides whether to stay. */}
        {/* Native (Capacitor) runtime setup — status bar, keyboard, splash.
            No-op on the web. */}
        <NativeInit />
        {/* Vercel Analytics — page views and Web Vitals, measured at the edge
            rather than in a tag manager. The /next entry point subscribes to
            App Router navigation, which is what this app needs: every screen is
            a client component swapped inside one route, so a script that only
            counts document loads would record a single visit per session no
            matter how much of the app someone walked through.

            Nothing needs disabling for the native build, though not because
            the component checks: in production it points at the relative path
            /_vercel/insights/script.js, which only exists because the Vercel
            platform serves it. Inside the Capacitor app that path resolves
            against the local bundle and 404s, so no data leaves the device. In
            local dev it instead loads Vercel's debug script, which reports to
            the console rather than recording anything. */}
        <Analytics />
      </body>
    </html>
  );
}
