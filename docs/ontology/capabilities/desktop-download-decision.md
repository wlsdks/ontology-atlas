---
uid: de739ff1-9bfd-49e3-ac86-54427a5f5840
slug: capabilities/desktop-download-decision
kind: capability
title: Desktop Download Decision
display_ko: 데스크톱 내려받기 안내
domain: domains/onboarding-and-shell
elements: [elements/download]
path: src/views/download
created_by: "agent:unknown"
---

## Definition
The ability to compare platform-specific installers and trust status in one place, and continue via web if installation is blocked. macOS presents signed/notarized Apple Silicon/Intel DMGs; Windows presents unsigned x64 betas with SmartScreen risks disclosed first.

## Evidence
- src/views/download (platform group, release facts, warnings, CTA)
- .github/workflows/release-macos.yml (`main` workflow_dispatch admits tags and SHA, passes through `release-signing` build and separate `release` publication approval, publishing only assets with the same SHA)
- .github/workflows/windows-beta-check.yml (Windows PR native verification without secret keys)
- scripts/check-macos-release-source.mjs (unwraps annotated/lightweight tags to commits, admits/pins at tag reassignment stage, fails closed on stale sources)
- scripts/check-macos-release-github.mjs (pre-validates main-only/no-tag/admin-bypass policies for two protected environments, public approval, API 3 environment + certificate/updater 4 repository secret placement, and absence of legacy copies)
- scripts/build-macos-release-artifact.mjs (applies step-by-step credential allowlists to 11 release children, materializes App Store Connect `.p8` only as a `0600` temporary file, then removes it)
- scripts/notarize-macos-dmg.mjs (passes only keychain profile or API key path/ID/issuer to `notarytool`, prohibiting argv/child env inheritance of password/private-key bodies)
- scripts/generate-download-release-facts.mjs (generates URL, size, SHA-256 from GitHub Release assets, compares asset version with tag, isolates external strings as JSON literals)
- scripts/check-macos-release-status.mjs (combines PR, workflow, protected environment, secret, and public asset evidence, keeping download verification omission as a readiness blocker)
- docs/FEATURES.md: "`/download`: the install decision"

## Confidence
high (0.95)
