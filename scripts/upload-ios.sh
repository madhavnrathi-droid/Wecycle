#!/usr/bin/env bash
#
# Build, sign and upload an App Store build — no secrets in this file.
#
# It reads an App Store Connect API key from the environment. Create one at
# App Store Connect -> Users and Access -> Integrations -> App Store Connect API,
# with the "App Manager" role, then put the .p8 where Apple's tools look for it:
#
#   mkdir -p ~/.appstoreconnect/private_keys
#   mv ~/Downloads/AuthKey_XXXXXXXXXX.p8 ~/.appstoreconnect/private_keys/
#
# and export the two identifiers shown next to the key:
#
#   export ASC_KEY_ID=XXXXXXXXXX
#   export ASC_ISSUER_ID=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee
#
# An API key is used rather than an Apple ID because an Apple ID with 2FA cannot
# be scripted, and because a key can be revoked on its own without touching the
# account. The key never appears here or in the repo.
#
# Usage:  ./scripts/upload-ios.sh          # bump build, archive, export, upload
#         ./scripts/upload-ios.sh --no-bump
set -euo pipefail

cd "$(dirname "$0")/.."
PROJ="ios/App/App.xcodeproj"
ARCHIVE="ios/build/Wecycle.xcarchive"
EXPORT_DIR="ios/build/ipa"

: "${ASC_KEY_ID:?Set ASC_KEY_ID (see the header of this script)}"
: "${ASC_ISSUER_ID:?Set ASC_ISSUER_ID (see the header of this script)}"

# ── 1. Build number ───────────────────────────────────────────────────────────
# Every upload needs a build number unseen for this version string; App Store
# Connect rejects a repeat outright, and it is the single commonest reason an
# upload bounces.
if [[ "${1:-}" != "--no-bump" ]]; then
  CURRENT=$(grep -m1 'CURRENT_PROJECT_VERSION = ' "$PROJ/project.pbxproj" | sed 's/[^0-9]//g')
  NEXT=$((CURRENT + 1))
  sed -i '' "s/CURRENT_PROJECT_VERSION = $CURRENT;/CURRENT_PROJECT_VERSION = $NEXT;/g" "$PROJ/project.pbxproj"
  echo "==> build $CURRENT -> $NEXT"
fi

# ── 2. Web bundle into the native shell ───────────────────────────────────────
echo "==> building web bundle"
npm run build:cap
npx cap sync ios

# ── 3. Archive, unsigned ──────────────────────────────────────────────────────
# Deliberately unsigned. Automatic signing from the command line resolves to a
# DEVELOPMENT profile and then fails with "your team has no devices", and forcing
# manual signing is refused while the only Store profile is Xcode-managed.
# Signing at export sidesteps both. Capacitor 8 uses SPM, so there is no
# .xcworkspace to pass.
echo "==> archiving"
rm -rf "$ARCHIVE"
xcodebuild -project "$PROJ" -scheme App -configuration Release \
  -destination "generic/platform=iOS" -archivePath "$ARCHIVE" \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" \
  archive

# ── 4. Export, signed ─────────────────────────────────────────────────────────
echo "==> exporting signed ipa"
rm -rf "$EXPORT_DIR"
xcodebuild -exportArchive -archivePath "$ARCHIVE" \
  -exportOptionsPlist ios/ExportOptions.plist -exportPath "$EXPORT_DIR" \
  -allowProvisioningUpdates

IPA="$EXPORT_DIR/App.ipa"

# ── 5. Validate before uploading ──────────────────────────────────────────────
# Validation catches the things that otherwise come back as a rejection email
# hours later — missing icons, bad entitlements, a duplicate build number.
echo "==> validating"
xcrun altool --validate-app -f "$IPA" -t ios \
  --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"

echo "==> uploading"
xcrun altool --upload-app -f "$IPA" -t ios \
  --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"

echo "==> done. The build appears in App Store Connect after processing (5-30 min)."
