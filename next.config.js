/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { turbo: {} },

  /* @imgly/background-removal pulls onnxruntime-web, which ships ESM
     bundles using `import.meta.url` + `createRequire` syntax that
     Vercel's webpack/Terser pipeline can't parse during the server build.
     These libraries ONLY run client-side (dynamic-imported inside the
     photo picker) — marking them server-external skips them entirely
     during SSR bundling. */
  serverExternalPackages: ['onnxruntime-web', '@imgly/background-removal'],

  webpack: (config, { isServer, webpack }) => {
    if (isServer) {
      /* Belt-and-braces on the server build — even with
         serverExternalPackages, webpack still attempts to resolve the
         entry to verify it exists. Use IgnorePlugin to skip any
         attempt to load these packages on the server side entirely. */
      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /^(onnxruntime-web|@imgly\/background-removal)/,
        }),
      );
    }
    return config;
  },
};

module.exports = nextConfig;
