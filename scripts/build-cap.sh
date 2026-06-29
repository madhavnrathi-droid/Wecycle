#!/usr/bin/env bash
# Build the static export bundled into the Capacitor (native) app.
#
# Two routes can't be statically exported and the native app doesn't need them:
#   - app/api/remove-background  (server route; the app calls the deployed origin)
#   - app/s/[id]                 (force-dynamic OG share page; share opens externally)
# We move them aside for the export and restore them afterwards. The trap
# guarantees they come back even if the build fails.
set -euo pipefail
cd "$(dirname "$0")/.."

STASH=".cap-excluded"

restore() {
  [ -d "$STASH/api" ] && mv "$STASH/api" app/api 2>/dev/null || true
  [ -d "$STASH/s" ]   && mv "$STASH/s"   app/s   2>/dev/null || true
  rmdir "$STASH" 2>/dev/null || true
}
trap restore EXIT

mkdir -p "$STASH"
if [ -d app/api ]; then mv app/api "$STASH/api"; fi
if [ -d app/s ];   then mv app/s   "$STASH/s";   fi

rm -rf out
CAP_EXPORT=1 npx next build

echo "✅ Static export ready in ./out"
