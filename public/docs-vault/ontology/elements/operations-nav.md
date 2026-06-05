---
slug: elements/operations-nav
kind: element
title: Operations Nav
domain: onboarding-ux
relates: [capabilities/project-ontology-indexing, elements/locale-switch, elements/ontology-sub-nav]
---

`src/widgets/operations-nav/ui/OperationsNav.tsx` renders the shared top navigation for Context Atlas work surfaces: Source Vault, Ontology, and Topology.

The nav keeps workspace return, primary work-surface switching, source-mode status, language switching, app settings, and the ontology sub-nav in one compact chrome layer. Static hosted mode routes the demo badge to the macOS download, while the installed app can route it to the local vault picker.

`AppSettingsMenu` turns the top-right gear into an actual settings dialog-like panel instead of a single-purpose theme toggle. It groups display mode, language, Source Vault, and AI agent connection verification entry points so users can distinguish app preferences from MCP runtime proof without hunting across separate buttons.

The settings trigger is labeled, not only an icon, and the same settings affordance is reachable from the mobile status row. This keeps display/language/source-vault/MCP checks discoverable when the top chrome is compressed.

The settings panel is wider than the original dropdown and declares a dialog role. It now uses an internal LNB-style tab list so `Connection`, `Agent`, and `App` settings are scanned as separate sections instead of one long mixed panel. The default tab shows setup/direct-MCP/fallback/cache proof, the Agent tab holds first-call copy and client proof locations, and the App tab holds display, language, Source Vault, and verification navigation.

The settings panel is centered inside a padded fixed overlay with outer overflow hidden. The dialog keeps a bounded viewport-relative width and height, while each selected tab panel owns the vertical scroll. Opening settings therefore does not create a page-level scrollbar, the LNB stays stable, and the panel preserves top/right/bottom/left breathing room on small and desktop windows.

The settings panel is controlled by React state rather than native `details` toggling alone. It moves focus into the panel when opened, returns focus to the gear when dismissed, and closes via the close button, Escape, or a transparent backdrop action so the macOS app behaves like a predictable settings surface instead of a lingering dropdown. That backdrop catches outside clicks before they collapse or select the ontology content underneath.

The settings panel also shows the MCP first calls an agent should run (`codex mcp list`, `tools/list`, `agent_brief`, `workspace_brief`, `health`) plus the CLI fallback verification command. It separates direct MCP proof from fallback proof: direct proof requires the current Codex or Claude session to expose `tools/list` with 24 tools, `index_project`, and callable `query_ontology`; `pnpm cli:mcp-verify docs/ontology --timeout-ms 15000` only proves the local server and vault are healthy when the agent session has not loaded the tools.

The Agent tab now exposes the project ontology indexing checkpoint directly: `index_project({"rootPath":"/Users/jinan/side-project/oh-my-ontology"})` for live MCP sessions and `node cli/src/index.mjs index /Users/jinan/side-project/oh-my-ontology --vault docs/ontology --json --threshold 2` for a side-effect-free CLI plan. The UI keeps `--apply` framed as a human-reviewed write step rather than a default command.

The connection tab includes a compact decision-order rail: config presence only proves the server can be started, `tools/list` with 24 tools proves the server inventory is current, the current agent namespace must show `query_ontology` before the UI calls it direct MCP proof, and a stale namespace should use CLI fallback plus agent reload before claiming live attachment.

The settings panel includes a compact client-proof guide derived from the MCP Inspector, Codex, Claude, Cursor, and VS Code setup patterns: each client has a configuration surface, but the trustworthy proof is the current session's tool inventory and a sample first call. The UI names where to check each client so a human does not mistake a valid config file or CLI fallback check for live agent attachment.
