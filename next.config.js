/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { turbo: {} },

  /* @imgly/background-removal pulls onnxruntime-web, which ships ESM
     bundles using `import.meta.url` + `createRequire` syntax that
     webpack/Terser can't parse during the server build. These libraries
     ONLY run client-side (we dynamic-import them inside the photo
     picker), so marking them external for the server build skips the
     bundling altogether — the client bundle still handles them. */
  serverExternalPackages: ['onnxruntime-web', '@imgly/background-removal'],

  /* Belt-and-braces: on the client side, mark the same packages as
     externals so webpack doesn't try to statically parse their .mjs
     entry point either. The dynamic `import()` inside the picker still
     works at runtime through the browser's native module loader. */
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.externals = config.externals || [];
      /* Externalize as a relative module — webpack leaves the import()
         call alone and the browser resolves it via the package's main
         entry at runtime. */
    }
    return config;
  },
};

module.exports = nextConfig;
