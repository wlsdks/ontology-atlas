---
slug: elements/operations-nav
kind: element
title: Operations Nav
domain: onboarding-ux
relates: [capabilities/agent-config-onboarding, capabilities/project-ontology-indexing, elements/locale-switch, elements/ontology-sub-nav]
---

`src/widgets/operations-nav/ui/OperationsNav.tsx` renders the shared top navigation for Ontology Atlas work surfaces: Source Vault, Ontology, and Topology.

The nav keeps workspace return, primary work-surface switching, source-mode status, language switching, app settings, and the ontology sub-nav in one compact chrome layer. Static hosted mode routes the demo badge to the macOS download, while the installed app can route it to the local vault picker.

On ontology surfaces the source-mode badge uses the compact form: it says only `Vault` / `저장소` while the tooltip and accessible label keep the vault name and document count. The Korean first-viewport chrome intentionally uses 저장소 / 로컬 온톨로지 저장소 for the source surface and active local mode badge. Individual markdown files can still be documents inside the product, but the always-visible app shell should frame the selected folder as the ontology store that backs graph reads, graph verification, and agent handoff. The badge uses a neutral folder glyph instead of a colored dot so it reads as the current source vault, not as live agent activity or a status alarm. `/ontology` already has its own source-concept, hierarchy-row, and relation counts, so repeating the full source summary in the global chrome made the first screen read like a document dashboard. Non-ontology surfaces keep the full count because there the badge is still the primary source summary.

`AppSettingsMenu` turns the top-right gear into an actual settings dialog-like panel instead of a single-purpose theme toggle. It groups display mode, language, Source Vault, and AI agent connection verification entry points so users can distinguish app preferences from MCP runtime proof without hunting across separate buttons.

The settings trigger is labeled, not only an icon, and the same settings affordance is reachable from the mobile status row. This keeps display/language/source-vault/MCP checks discoverable when the top chrome is compressed.

The settings panel is a large centered workbench, not a narrow dropdown. It declares a dialog role, is bounded at `max-w-[64rem]` and `max-h-[48rem]`, and uses an internal LNB-style tab list with a `13rem` desktop navigation column so `General`, `MCP/Agents`, `Vault`, `Appearance/Language`, and `Verification` settings can be read as separate sections. `src/widgets/operations-nav/ui/OperationsNav.test.tsx` locks this contract so future UI work does not collapse production settings back into a cramped popover.

The settings panel is centered inside a padded fixed overlay with outer overflow hidden. The dialog keeps a bounded viewport-relative width and height, while each selected tab panel owns the vertical scroll. Opening settings therefore does not create a page-level scrollbar, the LNB stays stable, and the panel preserves top/right/bottom/left breathing room on small and desktop windows.

The settings panel is controlled by React state rather than native `details` toggling alone. It moves focus into the panel when opened, returns focus to the gear when dismissed, and closes via the close button, Escape, or a transparent backdrop action so the macOS app behaves like a predictable settings surface instead of a lingering dropdown. That backdrop catches outside clicks before they collapse or select the ontology content underneath.

The MCP/Agents tab shows the first calls an agent should run (`codex mcp list`, `tools/list`, `agent_brief`, `workspace_brief`, `health`) plus the CLI fallback verification command. It separates direct MCP proof from fallback proof: direct proof requires the current Codex or Claude session to expose `tools/list` with 24 tools, `index_project`, and callable `query_ontology`; `pnpm cli:mcp-verify docs/ontology --timeout-ms 15000` only proves the local server and vault are healthy when the agent session has not loaded the tools.

The MCP/Agents and Verification tabs now use the same five-state connection model so users do not need to understand MCP internals before deciding what to do:

- Connected: the current agent session can list 24 tools and call `query_ontology`.
- Setup only: config files exist, but there is no live `tools/list` proof yet.
- Restart needed: config exists but the current agent still has stale tool metadata.
- CLI fallback possible: `pnpm cli:mcp-verify docs/ontology --timeout-ms 15000` can prove local server and vault health while the agent session is refreshed.
- Not connected: setup or callable tools are missing and handoff should not be trusted yet.

The visible proof labels avoid raw ICU/JSON braces so `next-intl` can render them reliably: display text uses forms like `query_ontology · operation=agent_brief` and `index_project · rootPath=[codebase-root]`, while copy payloads can still include the exact JSON-shaped MCP calls an agent needs.

The MCP/Agents tab also exposes the project ontology indexing checkpoint directly: `index_project` for live MCP sessions and `node cli/src/index.mjs index [codebase-root] --vault docs/ontology --json --threshold 2` for a side-effect-free CLI plan. The UI keeps `--apply` framed as a human-reviewed write step rather than a default command. `[codebase-root]` is intentional: the app should not hardcode `/Users/jinan/side-project/ontology-atlas` because current local checkouts may still be named `oh-my-ontology` until the folder is safely renamed.

The same card now carries a meaning gate: report the business/product domain and capability first, then cite code rows as implementation evidence. This keeps the settings surface aligned with Atlas as a shared decision atlas for planners, marketers, decision-makers, developers, and agents, not only a developer plugin or source-file index.

The settings panel includes a compact client-proof guide derived from the MCP Inspector, Codex, Claude, Cursor, and VS Code setup patterns: each client has a configuration surface, but the trustworthy proof is the current session's tool inventory and a sample first call. The UI names where to check each client so a human does not mistake a valid config file or CLI fallback check for live agent attachment.

The Korean settings copy has its own regression guard in `scripts/validate-messages.test.mjs`. The visible proof labels avoid leaving generic English UI terms such as `Agent`, `Fallback`, `client`, or `namespace` in the decision surface. Product-specific commands like `tools/list` and `query_ontology` stay literal, but the user-facing judgment labels read as 에이전트, 대체 검증, 도구 목록, and 클라이언트 캐시 so the MCP connection panel does not look like an internal debug surface.

This element is linked to `capabilities/agent-config-onboarding` because the nav is where a user first asks, "Is Claude Code or Codex actually connected, or do I need fallback/restart?"
