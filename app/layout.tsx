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
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
