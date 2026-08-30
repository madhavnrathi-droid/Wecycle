/* Lets `node --test` load the app's TypeScript directly.
 *
 * Node's ESM resolver demands a file extension; the app is written for a
 * bundler and imports `./signals`. Rather than write `./signals.ts` throughout
 * the source — which would be a change to production code made purely to suit
 * the test runner — this hook retries a failed relative resolution with the
 * extensions a bundler would have tried. */
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (err) {
    if (!specifier.startsWith('.')) throw err;
    for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
      try { return await next(specifier + ext, context); } catch { /* try the next */ }
    }
    throw err;
  }
}
