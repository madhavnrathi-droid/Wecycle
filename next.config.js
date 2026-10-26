/** @type {import('next').NextConfig} */

/* The NATIVE (Capacitor) build sets CAP_EXPORT=1 to emit a static export in
   `out/` that is bundled into the app. The normal web build (Vercel) leaves it
   unset and stays a full Next.js app (API routes, dynamic /s/[id], SSR OG). */
const isCapacitor = process.env.CAP_EXPORT === '1';

const nextConfig = {
  reactStrictMode: true,
  /* The version shown on the Settings > About row. Read from package.json at
     build time so the two cannot drift — it said "Version 1.0" while the app
     shipped 1.1, because it was a string typed into a component. Keep
     package.json in step with ios MARKETING_VERSION on each release. */
  env: { NEXT_PUBLIC_APP_VERSION: require('./package.json').version },
  experimental: { turbo: {} },
  /* @shadergradient/react (the share-card gradient) ships pre-bundled ESM in
     which `new OrthographicCamera(...)` is assigned to variables nothing
     reads. Webpack's inner-graph pass then judges the three.js import unused
     and drops its binding, while the minifier rightly keeps the `new` call —
     so production threw "P is not defined" and the share sheet took the page
     down. Turning that one pass off keeps the bindings. */
  webpack: (config, { isServer }) => {
    if (!isServer) config.optimization.innerGraph = false;
    return config;
  },
  ...(isCapacitor
    ? { output: 'export', trailingSlash: true, images: { unoptimized: true } }
    : {}),
};

module.exports = nextConfig;
