---
slug: elements/app-settings-menu
kind: element
title: App Settings Menu
domain: onboarding-ux
relates: [elements/app-nav-rail, elements/locale-switch]
---

`src/widgets/app-settings-menu/ui/AppSettingsMenu.tsx` renders the app-wide settings panel: display mode, language, ontology workspace access, and AI agent connection verification, grouped as five tabs (General / MCP+Agents / Vault / Appearance / Verification) behind one gear trigger.

Before feat/rail-rollout (2026-07) this lived inside `OperationsNav`, the shared top tab bar for `/docs`, `/ontology`, `/topology`. That top bar and its inline ontology sub-nav (`Concept map` / `Edit relations` / `Verify graph` switcher) are now deleted — `elements/app-nav-rail` (`AppNavRail`) is the persistent left navigation on every route instead. The rail is too narrow to host this panel's wide popover, so `AppSettingsMenu` was extracted into its own widget and mounts directly in the header of the few pages that need it: the projects list, the builder, and insights — the same "zero feature loss" move that keeps `LiveActivityIndicator` (agent activity heartbeat) mounted next to it on those three pages.

The settings trigger is labeled, not only an icon. The panel is a large centered workbench, not a narrow dropdown: it declares a dialog role, is bounded at `max-w-[64rem]` and `max-h-[48rem]`, and uses an internal LNB-style tab list with a `13rem` desktop navigation column so `General`, `MCP/Agents`, `Vault`, `Appearance/Language`, and `Verification` settings read as separate sections. `src/widgets/app-settings-menu/ui/AppSettingsMenu.test.tsx` locks the hosted-vs-installed vault routing branch (`/download/` for the hosted browser vs. `/docs/?intent=local` for the installed macOS app) so future UI work does not regress that decision — the same test `pnpm test:desktop:runtime` runs.

The panel is centered inside a padded fixed overlay with outer overflow hidden. The dialog keeps a bounded viewport-relative width and height, while each selected tab panel owns the vertical scroll — opening settings never creates a page-level scrollbar. It is controlled by React state rather than native `details` toggling alone: it moves focus into the panel when opened, returns focus to the gear when dismissed, and closes via the close button, Escape, or a transparent backdrop action.

The MCP/Agents tab shows the first calls an agent should run (`codex mcp list`, `tools/list`, `agent_brief`, `workspace_brief`, `health`) plus the CLI fallback verification command. It separates direct MCP proof from fallback proof: direct proof requires the current Codex or Claude session to expose `tools/list` with 24 tools, `index_project`, and callable `query_ontology`; `pnpm cli:mcp-verify docs/ontology --timeout-ms 15000` only proves the local server and vault are healthy when the agent session has not loaded the tools.

The MCP/Agents and Verification tabs use a five-state connection model so users do not need to understand MCP internals before deciding what to do: Connected, Setup only, Restart needed, CLI fallback possible, Not connected. The visible proof labels avoid raw ICU/JSON braces so `next-intl` can render them reliably.

The MCP/Agents tab also exposes the project ontology indexing checkpoint: `index_project` for live MCP sessions and `node cli/src/index.mjs index [codebase-root] --vault docs/ontology --json --threshold 2` for a side-effect-free CLI plan, with `--apply` framed as a human-reviewed write step. The same card carries a meaning gate: report the business/product domain and capability first, then cite code rows as implementation evidence.

The Korean settings copy has its own regression guard in `scripts/validate-messages.test.mjs`. Visible proof labels avoid leaving generic English UI terms such as `Agent`, `Fallback`, `client`, or `namespace` in the decision surface.

This element is linked to `capabilities/agent-config-onboarding` because the settings panel is where a user first asks, "Is Claude Code or Codex actually connected, or do I need fallback/restart?"
