---
title: FEATURES — ontology-atlas
doc_type: index
status: current
area: product
---

# FEATURES — ontology-atlas

This page is the index of what a person can use in Ontology Atlas. It is for
anyone looking for the file that describes a surface or a destination: each
row names its route and links the feature file that owns its behaviour. Routes
are owned by [`ARCHITECTURE.md`](ARCHITECTURE.md), the product thesis by
[`PRODUCT-DIRECTION.md`](PRODUCT-DIRECTION.md#the-atlas-product-thesis), and
command and tool contracts by their READMEs. When a feature file and the code
disagree, the code wins; a feature file's history is its Git log
(`pnpm doc:history -- <path>`).

The cream-hooded planet traveler is the shared mascot across brand and in-app surfaces. Its waiting and verified-work poses remain tied to their existing activity states; see [Brand](design/brand.md).

The folder entry uses a static welcome portrait, and the missing-page screen
uses a curious map-search portrait in its existing icon slot. These expressions
leave the screen's labels and actions authoritative. Walking, reading and
completion artwork share the same traveler proportions and equipment.

## Surfaces

| Surface | Entry | Reference |
|---|---|---|
| Desktop app (macOS; Windows x64 beta) | Installed local workbench over a folder on disk | [`DESKTOP-MACOS.md`](DESKTOP-MACOS.md), [Download](features/download.md) |
| CLI | `node cli/src/index.mjs <command>` from a source checkout | [`cli/README.md`](../cli/README.md); the command list is `node cli/src/index.mjs --help` |
| MCP | JSON-RPC server an agent registers against a vault | [`mcp/README.md`](../mcp/README.md); the tool list is the server's `tools/list` answer |
| Website | Static export; `/` is the gateway until a vault is loaded | [Gateway](features/gateway.md) |

Meaning review previews a nonblank authored description or a complete opening
prose paragraph within 320 characters. The full-document action exposes the
remaining sections and boundaries, including when no preview is eligible.

The optional companion game and related personal-record screens are retired.
Existing local saves remain untouched; no replacement viewer or export is provided.

Direct model conversations reject malformed response structures with a bounded
`invalid-provider-response` diagnostic. No tool call from that response executes;
the existing retry flow remains available for cloud and local endpoints.

## Destinations

The desktop rail's order and hrefs come from
`src/widgets/app-nav-rail/ui/AppNavRail.tsx` and
`src/shared/config/destinations.ts`; the rail itself is described in
[`app-nav-rail.md`](features/cross-cutting/app-nav-rail.md).

| Destination | Route | Feature file |
|---|---|---|
| Map | `/` (with a loaded vault), `/topology` | [`features/map/`](features/map/README.md), [first run](features/first-run.md), [gateway](features/gateway.md) |
| Harness | `/architecture` | [`harness.md`](features/harness.md) |
| Library | `/library` (`/docs` is its ontology-tab compatibility entry) | [`features/library/`](features/library/workspace.md) — local Wiki questions, cited ACP reports, document export, Ontology bookmarks, and optional Jev advice |
| Automations | `/automations` | [`automations.md`](features/automations.md) |
| Insights | `/ontology/insights` | [`analysis.md`](features/analysis.md) |
| Projects | `/projects`, `/project/*` | [`projects.md`](features/projects.md) |
| Agents | `/agents` (tabs: `src/views/agents/lib/agents-tab-state.ts`) | [`agents.md`](features/agents.md) |
| Git | `/git` | [`git.md`](features/git.md) |
| Download | `/download` | [`download.md`](features/download.md) |
| Guide | `/guide`, `/guide/[segment]` | [`guide-and-changelog.md`](features/guide-and-changelog.md) |
| Changelog | `/changelog` | [`guide-and-changelog.md`](features/guide-and-changelog.md) |
| Redirects | `/ontology`, `/ontology/edit`, `/ontology/studio`, `/mcp` | [`compatibility-redirects.md`](features/compatibility-redirects.md) |

## Web and app capabilities

Frontmatter readers preserve quoted mapping keys and nested quoted strings.
Local field edits retain unrelated source; MCP rewrites refuse malformed data
loss and allow explicit whole-field repair when ownership is unambiguous.

Decided in `docs/DECISIONS.md`; the enforceable version is
`.claude/rules/surfaces.md`. It is one codebase and one build — the app loads
the same static export in a WebView — so this is a capability table, not a
feature-parity backlog. Desktop capabilities ship without a web equivalent,
on purpose. What the web owes instead is an honest degradation: why it cannot
work here, and where it can.

| Capability | Web (Chromium) | Desktop app (macOS · Windows x64 beta) | Why they differ |
|---|---|---|---|
| Open the map with no install | ✅ | ✅ | the web's first job — gateway |
| Open your own markdown folder | ✅ File System Access API | ✅ absolute path | up to 100,000 tracked entries, with truncation reported beyond the entry or depth limit; Firefox and non-FSA browsers degrade to a notice + download link |
| Read / edit / create nodes in that folder | ✅ | ✅ | same parser, same schema, same files |
| Remember the folder between visits | ❌ pick it again | ✅ | web keeps an FSA handle in its own IndexedDB; a convenience cache, not the source of truth |
| Resume a single folder on launch | ❌ the browser needs a click for permission, and the chooser says so | ✅ opens it directly | File System Access permission has to come from a gesture, so the web presses something either way |
| Choose between known folders on launch | ✅ | ✅ | two or more known folders open a centered, content-sized chooser with Open folder and Create new beside the list heading; the list grows with its contents and scrolls internally only when space runs out; names wrap and paths keep their full value on hover; a folder the browser refused keeps its row with recovery/removal actions, while folders that no longer exist fold into one quiet line at the end of the list, reviewed in a dialog (in place in the rail switcher) that lists each path and forgets one or all of them only when pressed; constrained height or larger text folds optional guidance into an accessible help dialog so the list stays usable; one folder resumes directly |
| See which folder is open, and leave it | ✅ | ✅ | the folder's name sits at the top of the rail on every destination and opens the switcher; each row carries the folder's contents, its last opening, and whether it opens now |
| Map entry feedback | ✅ | ✅ | sidebar and G M map entry mark Map in the rail at once and fade the page to the map's canvas before navigating; the preparation scene appears only when preparation outlasts that fade, the first canvas draw releases the cover, and another destination or the return action can cancel the pending entry |
| Explore overlooked areas | ❌ reason + app link; recorded map stays usable | macOS local evidence reader; Windows stays unmeasured | selected scope + explicit bound-folder confirmation; native re-selection recovers missing source access without rebinding or scanning automatically; no agent or service needed |
| Work offline | ❌ | ✅ | |
| Git history and snapshots | ❌ degraded card + `ontology-atlas snapshot` | ✅ | a browser has no right to run git on your machine |
| API keys / in-app **agent** chat | ❌ **and will not be built** | ✅ native credential store | keys in browser storage leak to a single XSS, and vendors name the direct-call header `…-dangerous-direct-browser-access` |
| Write agent config (`.mcp.json`) into the vault | ⚠️ folder writes work, but there is no absolute path to record | ✅ | MCP registration needs a real path |
| In-app updates | ❌ | ✅ | the daily check can be turned off in Settings → About; Check for updates still works |

**Windows**: an unsigned x64 beta carries the same local folder and MCP
surface as the desktop app. `/download` states the SmartScreen unknown-publisher
and managed-PC risk before the executable CTA. Chrome or Edge remains the
install-free fallback when that warning or an organization policy is a blocker;
the web still does not offer BYOK or MCP registration.

## Topic files

Destinations are one file each under `features/`; the map and the Library are
a folder each with one file per topic
([`features/map/`](features/map/README.md), `features/library/`). Surfaces that
appear on every page are under [`features/cross-cutting/`](features/cross-cutting/README.md).
Data sources ([`data-sources.md`](features/data-sources.md)), the MCP server
([`mcp-server.md`](features/mcp-server.md)) and keyboard shortcuts
([`keyboard.md`](features/keyboard.md)) have one file each. Start a new one with
`pnpm doc:new -- --type=feature --area=<area> --slug=<slug>`.
