/**
 * Patch onnxruntime-web's package.json exports to use CJS .js files instead
 * of ESM .mjs files for all conditions.  This prevents Next.js's Terser
 * minifier from choking on `import.meta` syntax in the .mjs bundles.
 *
 * Run automatically via `npm run postinstall`.
 */
'use strict';
const fs = require('fs');
const path = require('path');

let pkgPath;
try {
  pkgPath = path.join(
    path.dirname(require.resolve('onnxruntime-web/package.json')),
    'package.json',
  );
} catch {
  // onnxruntime-web is not installed — nothing to patch.
  process.exit(0);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

// Already patched (detect by checking if webgpu import points to .js)
if (
  pkg.exports &&
  pkg.exports['./webgpu'] &&
  pkg.exports['./webgpu'].import &&
  pkg.exports['./webgpu'].import.endsWith('.js')
) {
  console.log('[patch-ort-exports] Already patched, skipping.');
  process.exit(0);
}

// CJS replacements for every known export subpath
const CJS_MAP = {
  '.':        { node: { import: './dist/ort.node.min.js', require: './dist/ort.node.min.js' }, import: './dist/ort.min.js',      require: './dist/ort.min.js'      },
  './all':    { import: './dist/ort.all.min.js',    require: './dist/ort.all.min.js'    },
  './wasm':   { import: './dist/ort.wasm.min.js',   require: './dist/ort.wasm.min.js'   },
  './webgl':  { import: './dist/ort.webgl.min.js',  require: './dist/ort.webgl.min.js'  },
  './webgpu': { import: './dist/ort.webgpu.min.js', require: './dist/ort.webgpu.min.js' },
};

if (pkg.exports) {
  for (const [subpath, cjsEntry] of Object.entries(CJS_MAP)) {
    if (pkg.exports[subpath]) {
      pkg.exports[subpath] = cjsEntry;
    }
  }
}

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log('[patch-ort-exports] Patched onnxruntime-web exports to use CJS bundles.');
