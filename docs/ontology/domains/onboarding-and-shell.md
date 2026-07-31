---
slug: domains/onboarding-and-shell
kind: domain
title: "Onboarding, Distribution & App Shell"
display_ko: 온보딩·배포·앱 셸
display_en: "Onboarding, Distribution & App Shell"
capabilities: [capabilities/app-update, capabilities/first-run-starter, capabilities/guided-tour, capabilities/locale-switch, capabilities/macos-download-link]
elements: [elements/src/views/download, elements/src/views/first-run, elements/src/views/gateway-doc, elements/src/views/home, elements/src/views/root-entry, elements/src/widgets/app-nav-rail, elements/src/widgets/app-settings-menu, elements/src/widgets/bottom-tab-bar, elements/src/widgets/docs-quick-drawer, elements/src/widgets/gateway-chrome, elements/src/widgets/public-quick-actions]
---

## 정의
공유 링크 → 설치된 앱 → 연결까지의 첫 5분 경로(다운로드 결정, 첫 실행 투어, 로케일, 자동 업데이트)와 그 주위의 상시 내비게이션 셸.

## 근거
- README.md — "One download installs both surfaces. The macOS app carries a compiled MCP server inside its own bundle."
- AGENTS.md — Routes ("`/` is decided by who is asking", "Seventeen routes, all [locale] prefixed by next-intl")

## 포함 / 제외
- 포함: 첫 실행, 가이드 투어, 다운로드 결정, 앱 업데이트, 로케일 전환, 내비 셸
- 제외: 볼트 데이터소스 자체(local-vault-management)

## 확신도
medium-high (0.85) — README + AGENTS.md 직접 인용