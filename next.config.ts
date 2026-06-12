import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack(config, { isServer }) {
    if (!isServer) {
      /* onnxruntime-web (pulled in by @imgly/background-removal) ships ESM-
       * only dist files that use import.meta / top-level ESM syntax.  Next.js
       * production Terser runs in CJS mode and chokes on these.
       *
       * Fix: append a Terser minimizer with an `exclude` pattern that skips
       * these specific ort files.  We re-use Next.js's bundled TerserPlugin
       * so all other settings stay identical. */
      const existingMinimizer: unknown[] = config.optimization?.minimizer ?? [];
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const TerserPlugin = require("terser-webpack-plugin");
      const [existingTerser] = existingMinimizer.filter(
        (p) => p instanceof TerserPlugin,
      );
      if (existingTerser) {
        // Patch the existing Terser instance's options in-place.
        (existingTerser as { options: { exclude?: RegExp } }).options.exclude =
          /ort\.(node|webgpu\.bundle)/;
      } else {
        config.optimization = config.optimization ?? {};
        config.optimization.minimizer = [
          ...existingMinimizer,
          new TerserPlugin({ exclude: /ort\.(node|webgpu\.bundle)/ }),
        ];
      }
    }
    return config;
  },
};

export default nextConfig;
