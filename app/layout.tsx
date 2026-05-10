import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wecycle — Community Operating System",
  description: "The operating system for sustainable communities. Circulate resources, coordinate exchange, and build a circular economy in your campus, apartment, or neighborhood.",
  manifest: "/manifest.json",
  themeColor: "#0C0C0B",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Wecycle",
  },
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    viewportFit: "cover",
  },
  openGraph: {
    type: "website",
    title: "Wecycle — Community Operating System",
    description: "The operating system for sustainable communities.",
    siteName: "Wecycle",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-180.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
