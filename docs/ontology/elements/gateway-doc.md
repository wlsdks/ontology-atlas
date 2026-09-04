---
uid: 0d604e7d-00b6-4b47-9a7a-41a003ddddb3
slug: elements/gateway-doc
kind: element
title: Gateway Doc
display_ko: 관문 읽을거리
domain: domains/onboarding-and-shell
path: src/views/gateway-doc
created_by: "agent:unknown"
---

Gateway documentation/marketing page.

## Evidence

- Primary implementation: `src/views/gateway-doc/ui/GatewayDocPage.tsx#GatewayDocPage`
- Supporting implementation: `src/views/gateway-doc/model/guide-pages.ts#GUIDE_PAGES`
- Focused test: `tests/e2e/gateway-reading-reach.spec.ts#좁은 폭 차례가 넓은 폭 차례와 같은 장을 담는다`

## Includes

- Rendering one page of gateway reading material (`/guide`, `/changelog`) with prose-optimized measure, leading, and section rhythm.
- Extracting and trimming vault-doc entries (headings, recent-sections) for the guide/changelog content source.

## Excludes

- The persistent gateway nav chrome itself, owned by elements/gateway-chrome.
- The download page and its demo stage, owned by elements/download.
- The installed-app docs workbench, a separate dense work surface owned by elements/docs-vault-view.
