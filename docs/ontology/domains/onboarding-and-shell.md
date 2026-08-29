---
uid: 465b06f3-67fa-4e94-97c9-593a9a45cc23
slug: domains/onboarding-and-shell
kind: domain
title: "Onboarding, Distribution & App Shell"
display_ko: 온보딩·배포·앱 셸
display_en: "Onboarding, Distribution & App Shell"
capabilities: [capabilities/app-update, capabilities/desktop-download-decision, capabilities/first-run-starter, capabilities/guided-tour, capabilities/locale-switch]
elements: [elements/app-nav-rail, elements/app-settings-menu, elements/bottom-tab-bar, elements/docs-quick-drawer, elements/download, elements/first-run, elements/gateway-chrome, elements/gateway-doc, elements/home, elements/native-tray-control, elements/public-quick-actions, elements/root-entry]
created_by: human
---

## Definition
The first five-minute path from shared link → installed app → connection (download decision, initial run tour, locale, automatic updates) and the always-available navigation shell surrounding it.

## Evidence
- README.md: "One download installs both surfaces. The macOS app carries a compiled MCP server inside its own bundle."
- AGENTS.md: Routes ("`/` is decided by who is asking", "The current routes are all [locale] prefixed by next-intl")

## Inclusions / Exclusions
- Inclusions: First run, guided tour, download decision, app update, locale switch, inner shell
- Exclusions: The vault data source itself (local-vault-management)

## Confidence
medium-high (0.85): Direct quotes from README + AGENTS.md
