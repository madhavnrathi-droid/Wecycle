import type { Metadata } from "next";
import type { Viewport } from "next/dist/lib/metadata/types/extra-types";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import Script from "next/script";
import { AuthProvider } from "../lib/AuthContext";
import "./globals.css";

/* Microsoft Clarity project ID. Hard-coded because Clarity's snippet is
 * public-by-design — the ID is embedded in the script URL on every page that
 * loads it, so there's no secret to hide. Keeping it inline (not in env) so
 * Vercel preview builds also report into the same dashboard. */
const CLARITY_PROJECT_ID = "wy1d87md22";

/* Google Tag Manager container ID. Public-by-design like the Clarity ID —
 * it appears in the request URL the moment GTM loads. GA4 + any future
 * pixels (Facebook, LinkedIn, etc.) are configured *inside* the GTM UI,
 * which means we never need to touch this file again to add a new tag. */
const GTM_ID = "GTM-T59PDHDF";

export const metadata: Metadata = {
  title: "Wecycle — Community Operating System",
  description:
    "Circulate resources within your community — share, swap, repair, and request what you need. Built for campuses, apartments, and neighborhoods.",
  manifest: "/manifest.json",
  applicationName: "Wecycle",
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
  },
  twitter: {
    card: "summary_large_image",
    title: "Wecycle",
    description: "Circulate resources within your community.",
  },
  /* Hint to the OS that this is an installable PWA */
  other: {
    "msapplication-tap-highlight": "no",
  },
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAFAF6" },
    { media: "(prefers-color-scheme: dark)",  color: "#0C0C0B" },
  ],
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
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-180.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />

        {/* ── Google Tag Manager ──
            GTM is the canonical container for GA4 + every other tag we'll
            ever wire up (Facebook Pixel, LinkedIn Insight, ad conversions).
            Loading with strategy="afterInteractive" — the recommended
            balance for analytics: fires before any user click can be missed
            but after the page is interactive so it never blocks first paint.
            (next/script doesn't allow third-party `beforeInteractive` in
            app router, so this is the right setting.) */}
        <Script id="gtm-init" strategy="afterInteractive">
          {`
            (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','${GTM_ID}');
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
      </body>
    </html>
  );
}
