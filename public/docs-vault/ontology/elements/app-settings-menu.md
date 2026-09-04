---
uid: 3b3f8e42-62a7-43ec-8371-20815fa2851b
slug: elements/app-settings-menu
kind: element
title: App Settings Menu
display_ko: 앱 설정 메뉴
domain: domains/onboarding-and-shell
path: src/widgets/app-settings-menu
created_by: "agent:unknown"
---

App settings menu widget.

## Evidence

- Primary implementation: `src/widgets/app-settings-menu/ui/AppSettingsMenu.tsx#AppSettingsMenu`
- Supporting implementation: `src/widgets/app-settings-menu/ui/AiConnectionPanel.tsx#AiConnectionPanel`
- Focused test: `src/widgets/app-settings-menu/ui/AppSettingsMenu.test.tsx#routes the hosted browser vault action to the app download page`
- Focused test: `src/widgets/app-settings-menu/ui/AppSettingsMenu.test.tsx#keeps the installed desktop app vault action on the native local picker path`

## Includes

- The settings menu surface: AI connection panel, app update settings, and locale switch in one popover/sheet.
- Routing the vault action differently for a hosted browser session (to the download page) versus an installed desktop app (to the native local picker).
- Presenting vault validation summaries and guided-tour replay entry points from settings.

## Excludes

- Executor install and MCP connection configuration, which moved to elements/agents-destination (2026-08-20).
- The actual local-folder picker flow itself, owned by `src/features/docs-vault-local`.
- Workspace/category/status taxonomy editing, owned by the taxonomy feature.
