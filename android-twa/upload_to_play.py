#!/usr/bin/env python3
"""
Upload a signed AAB to Google Play via the Android Publisher API.

Prerequisites (one-time, in the Play Console — see README.md):
  1. App already created in Play Console with package id `page.wecycle.app`.
  2. Android Publisher API enabled in the GCP project.
  3. This service account invited under Play Console → Users & permissions
     with "Release to testing tracks" (or Admin) permission.

Usage:
  pip install -r requirements.txt
  python3 upload_to_play.py \
      --key  /path/to/service-account.json \
      --aab  app/build/outputs/bundle/release/app-release.aab \
      --package page.wecycle.app \
      --track internal           # internal | alpha | beta | production
      --status draft             # draft | completed  (draft = staged, you press publish)

Notes:
  - First upload to a brand-new app usually must go to the `internal` track
    with status `draft`, then you finish the release in the console (Google
    requires the content-rating / data-safety / target-audience declarations
    which the API cannot fill in).
  - Versioning: the AAB's versionCode must be higher than any previously
    uploaded build, or the upload is rejected.
"""

import argparse
import sys

try:
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload
except ImportError:
    sys.exit("Missing deps. Run:  pip install -r requirements.txt")

SCOPES = ["https://www.googleapis.com/auth/androidpublisher"]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--key", required=True, help="Service account JSON path")
    ap.add_argument("--aab", required=True, help="Path to the .aab")
    ap.add_argument("--package", default="page.wecycle.app")
    ap.add_argument("--track", default="internal",
                    choices=["internal", "alpha", "beta", "production"])
    ap.add_argument("--status", default="draft",
                    choices=["draft", "completed", "inProgress", "halted"])
    args = ap.parse_args()

    creds = service_account.Credentials.from_service_account_file(
        args.key, scopes=SCOPES)
    service = build("androidpublisher", "v3", credentials=creds, cache_discovery=False)
    edits = service.edits()

    print(f"→ Opening edit for {args.package} …")
    edit_id = edits.insert(body={}, packageName=args.package).execute()["id"]

    print(f"→ Uploading {args.aab} …")
    media = MediaFileUpload(args.aab, mimetype="application/octet-stream", resumable=True)
    bundle = edits.bundles().upload(
        packageName=args.package, editId=edit_id, media_body=media).execute()
    version = bundle["versionCode"]
    print(f"   uploaded versionCode {version}")

    print(f"→ Assigning to '{args.track}' track (status={args.status}) …")
    edits.tracks().update(
        packageName=args.package, editId=edit_id, track=args.track,
        body={"track": args.track,
              "releases": [{"versionCodes": [str(version)], "status": args.status}]},
    ).execute()

    print("→ Committing edit …")
    edits.commit(packageName=args.package, editId=edit_id).execute()
    print(f"✅ Done. versionCode {version} is on the '{args.track}' track ({args.status}).")
    print("   Finish the release in Play Console if status=draft.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
