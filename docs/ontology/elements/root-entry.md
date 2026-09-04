---
uid: 6d84e487-03a3-45ca-b8e5-22e42f395347
slug: elements/root-entry
kind: element
title: Root Entry
display_ko: 루트 진입
domain: domains/onboarding-and-shell
path: src/views/root-entry
created_by: "agent:unknown"
---

/ Smart entry logic (branches based on identity).

## Evidence

- Primary implementation: `src/views/root-entry/ui/RootEntryPage.tsx#RootEntryPage`
- Focused test: `src/views/root-entry/ui/RootEntryPage.test.tsx#shows the first-run surface in the desktop shell when no vault is loaded`
- Focused test: `src/views/root-entry/ui/RootEntryPage.test.tsx#opens the topology hub when a vault is already loaded`

## Includes

- The `/` branch decision: web with no vault renders the gateway, desktop with no vault renders First Run, and any loaded/restored vault renders Home directly (no starter module, no sample badge, no readout).
- Matching the shell's own gateway verdict (`isGatewaySurface`) so chrome and content cannot disagree.

## Excludes

- The gateway page content itself, owned by elements/download (`GatewayLandingPage`).
- The first-run screen content, owned by elements/first-run.
- The topology hub content once a vault is loaded, owned by elements/home.
