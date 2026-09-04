---
uid: d47fbf09-315d-40d1-bdda-b14da014917d
slug: elements/gateway-chrome
kind: element
title: Gateway Chrome
display_ko: 관문 크롬
domain: domains/onboarding-and-shell
path: src/widgets/gateway-chrome
created_by: "agent:unknown"
---

Persistent chrome widget for uninstalled web visitors across the root, download, guide, and changelog surfaces. Its home link carries the compact pixel mascot and product name; this gateway identity is separate from the installed workbench rail, which intentionally begins with destinations and carries no repeated logo.

## Evidence

- Primary implementation: `src/widgets/gateway-chrome/ui/GatewayNav.tsx#GatewayNav`
- Focused test: `src/widgets/gateway-chrome/ui/GatewayNav.test.tsx#carries the gateway brand identity at every gateway address`
- Focused test: `src/widgets/gateway-chrome/ui/GatewayNav.test.tsx#names the current page in the breadcrumb everywhere except the gateway root`
- Focused test: `src/widgets/gateway-chrome/ui/GatewayNav.test.tsx#offers the changelog chip only where the page does not already carry the changelog`

## Includes

- The persistent nav chrome for uninstalled web visitors across root, download, guide, and changelog surfaces, carrying the compact pixel mascot and product name.
- The reading-links component surfaced alongside the gateway nav on prose pages.

## Excludes

- The installed workbench rail, which intentionally omits a repeated logo and begins with destinations (elements/app-nav-rail).
- The gateway prose pages themselves (guide/changelog content), owned by elements/gateway-doc.
- The download page hero and demo stage, owned by elements/download.
