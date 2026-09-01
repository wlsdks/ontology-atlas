---
uid: 74c21391-8605-46a0-b880-e19cd30c65e4
slug: capabilities/app-update
kind: capability
title: App Auto-Update
display_ko: 앱 자동 업데이트
domain: domains/onboarding-and-shell
elements: []
path: src/features/app-update
created_by: "agent:unknown"
review_state: human_decides
review_note: "Does this belong with onboarding-and-shell, or in a distribution domain beside desktop-download-decision? The two share one release gate (scripts/check-hosted-download-surface.mjs imports validateHostedUpdaterManifest), so splitting this one alone would put both halves of that gate in different domains."
---

## Definition
The ability to automatically or manually check for new versions in the desktop shell, download and install signed archives, and relaunch the app. The installed app reads only one Pages manifest URL that remains constant across release types.

## Inclusions / Exclusions
- Inclusions: desktop-shell 24-hour automatic checks, manual checks in settings, per-version dismissal,
  download progress, post-install relaunch, and separation of check failures from install failures.
- Inclusions: The Pages build deployment contract that stages `latest.json` from the newest non-draft GitHub Release
  to `/update/latest.json`. Release candidates are also included.
- Exclusions: Web app self-updates, separate update servers/accounts, and bypassing signature verification.

## Trust Boundary
The Pages manifest is a pointer that stably distributes which release to target. Whether actual installation is allowed is determined by the Tauri updater verifying the bundle signature of each archive. Check failures are reported once in the settings row, while only install failures display recovery instructions in the bottom-right corner. Raw English error messages from the updater library are not exposed to the user interface.

## Evidence
- `src/features/app-update/model/use-app-update.ts`: automatic/manual checks, check/install failure stages, `downloadAndInstall`, progress status, and relaunch
- `src/features/app-update/ui/UpdateToast.tsx` ·
  `src/widgets/app-settings-menu/ui/AppUpdateSettings.tsx`: single failure surface per stage
- `scripts/stage-hosted-updater-manifest.mjs`: selects the newest non-draft release,
  validates manifest version, signature, and tag-pinned HTTPS URL
- `.github/workflows/deploy-pages.yml` · `src-tauri/tauri.conf.json`: Pages staging and
  the installed app's single stable endpoint
- `scripts/check-hosted-download-surface.mjs`: hosted surface gate that verifies the deployed updater manifest together

## Confidence
medium-high: State, deployment, manifest staging, and signature gates are automated.
Installing and relaunching with the real new archive is re-verified for every deployment.
