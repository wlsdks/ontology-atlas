---
uid: 465b06f3-67fa-4e94-97c9-593a9a45cc23
slug: domains/onboarding-and-shell
kind: domain
title: "Onboarding, Distribution & App Shell"
display_ko: 온보딩·배포·앱 셸
display_en: "Onboarding, Distribution & App Shell"
capabilities: [capabilities/app-update, capabilities/desktop-download-decision, capabilities/first-run-starter, capabilities/guided-tour, capabilities/locale-switch]
elements: [elements/app-nav-rail, elements/app-settings-menu, elements/bottom-tab-bar, elements/docs-quick-drawer, elements/download, elements/first-run, elements/gateway-chrome, elements/gateway-doc, elements/home, elements/public-quick-actions, elements/root-entry]
created_by: human
---

## 정의
공유 링크 → 설치된 앱 → 연결까지의 첫 5분 경로(다운로드 결정, 첫 실행 투어, 로케일, 자동 업데이트)와 그 주위의 상시 내비게이션 셸.

## 근거
- README.md: "One download installs both surfaces. The macOS app carries a compiled MCP server inside its own bundle."
- AGENTS.md: Routes ("`/` is decided by who is asking", "The current routes are all [locale] prefixed by next-intl")

## 포함 / 제외
- 포함: 첫 실행, 가이드 투어, 다운로드 결정, 앱 업데이트, 로케일 전환, 내비 셸
- 제외: 볼트 데이터소스 자체(local-vault-management)

## 확신도
medium-high (0.85): README + AGENTS.md 직접 인용
