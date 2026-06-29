/** @type {import('next').NextConfig} */

/* The NATIVE (Capacitor) build sets CAP_EXPORT=1 to emit a static export in
   `out/` that is bundled into the app. The normal web build (Vercel) leaves it
   unset and stays a full Next.js app (API routes, dynamic /s/[id], SSR OG). */
const isCapacitor = process.env.CAP_EXPORT === '1';

const nextConfig = {
  reactStrictMode: true,
  experimental: { turbo: {} },
  ...(isCapacitor
    ? { output: 'export', trailingSlash: true, images: { unoptimized: true } }
    : {}),
};

module.exports = nextConfig;
