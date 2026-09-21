---
uid: de739ff1-9bfd-49e3-ac86-54427a5f5840
slug: capabilities/desktop-download-decision
kind: capability
title: Desktop download decision
display_en: Desktop download decision
display_ko: 데스크톱 내려받기 안내
domain: domains/human-workbench
elements: []
path: src/views/download/ui/DownloadPage.tsx
created_by: "agent:unknown"
---

## Definition

Lets a visitor of the hosted website compare the macOS and Windows installers, read their trust status, and decide whether to install the desktop app or continue on the web, on one page.

## Includes

- The per-platform installers with published release facts (URL, size, checksum) generated from the GitHub release.
- The signed and notarized macOS DMGs, and the unsigned Windows x64 beta with its SmartScreen warning placed ahead of its own button.
- The web fallback for a visitor who cannot install.

## Excludes

- Building, signing, notarizing or publishing the installers; those are release scripts and workflows, not this page.
- Anything the installed app does after launch; the desktop first run owns that.

## Uncertainty

- Carried over from the earlier hand-curated vault and re-pointed at the page file; the product-built vault had left this page out pending the owner's call. The release scripts it once listed as evidence were not re-read for this revision.
