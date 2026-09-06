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
relation_notes: { capabilities/desktop-download-decision: "Comparing installers and their trust status in one place is where a visitor decides to install, and it offers the browser path when installing is blocked.", capabilities/first-run-starter: Someone who has chosen no folder yet meets the map through a bundled sample and is told to open their own folder to light the same map with their data., capabilities/guided-tour: "A new arrival is walked through the map and the core loop, demo clips included, before they know any of the surfaces.", capabilities/locale-switch: "The first screens have to be readable in the visitor's own language, and the locale prefix on every route keeps that choice across the shell.", elements/app-nav-rail: "The persistent desktop rail is the always-available way to reach every workbench destination, and it stays hidden until a real local vault exists.", elements/app-settings-menu: "Settings is where values are chosen, and it holds the AI connection, update checks, language, and the vault action that differs between browser and installed app.", elements/bottom-tab-bar: "Narrow screens need their own persistent navigation, and this bar resolves active state from the same registry as the desktop rail so the two cannot disagree.", elements/docs-quick-drawer: Jumping to a vault document from anywhere belongs to the always-available shell rather than to the /docs page., elements/download: "The /download page is what a shared link opens first, carrying the platform choices, the unsigned Windows warning, and the demo of what the product does.", elements/first-run: "After the download, the installed app offers only local create and open actions and reveals the workbench once a real vault exists.", elements/gateway-chrome: "An uninstalled web visitor needs one persistent nav and product identity across root, download, guide, and changelog, which the workbench rail deliberately does not carry.", elements/gateway-doc: "The guide and changelog give a visitor prose to read before installing, laid out for reading rather than for work.", elements/home: "The topology hub is where a person lands once a vault is loaded, and it holds the route-level selection and panel state around the map.", elements/native-tray-control: "The macOS menu-bar item reopens or quits the workbench, keeping the app reachable from outside its own window.", elements/public-quick-actions: "A visitor with no vault can still start or edit a project, and the current route travels with them as returnTo so they come back where they were.", elements/root-entry: "The root address branches on who is asking: the gateway on the web with no vault, First Run in the desktop shell, and the map once a vault is loaded." }
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
