import type { Metadata } from "next";
import type { Viewport } from "next/dist/lib/metadata/types/extra-types";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { AuthProvider } from "../lib/AuthContext";
import "./globals.css";

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
      </head>
      <body className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
