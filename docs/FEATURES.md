---
title: FEATURES — ontology-atlas
doc_type: index
status: current
area: product
---

# FEATURES — ontology-atlas

> Complete inventory of features users can **actually use right now**. This page
> keeps the overview; each destination and cross-cutting surface has its own file
> under `features/`, so a change to one surface edits one file.
> When this inventory and the code disagree, the code wins (section 8). A
> feature file's history is its Git log (`pnpm doc:history -- <path>`).

---

## 0. At a glance

> **Mission v4**: "One codebase, one ontology, that people and their AI agents keep current together."
> **Current framing**: a local-first codebase ontology workbench that records what a codebase builds, why it is structured that way, and what a change will affect. Product meaning stays linked to implementation evidence; people judge plain Markdown and Git diffs, and AI agents use the same typed graph.
> **Human value emphasis (2026-09-13)**: keep understanding and judging the system as agents change its code. Current task-aware context and meaning-write review expose recorded meaning, evidence, and unknowns. Complete task-bound Meaning Diff, reliable unfamiliar-repository construction, and measured repeat-use benefits remain development work, not additional shipped features. [Product thesis](PRODUCT-DIRECTION.md#the-atlas-product-thesis).
> **Operating model**: single-user tool. Local-first vault. No login, no backend. **4 surfaces (desktop app · CLI · MCP · Website)** — daily heavy-lift ontology work happens in the installed app / CLI / MCP; on the hosted website, `/` is the gateway until a vault is loaded, then routes to the topology map, while `/topology` remains the explicit map address and `/download` carries the current release path.
> **Brand split**: **Ontology Atlas** is the user-facing desktop app / website brand and release asset identity. `ontology-atlas` remains the repo, CLI binary, and MCP package name.
> **Brand identity**: one pixel mascot spans favicon, OS icons, PWA/OG, README,
> rail, and loading. Its in-app WALK → READ → SUCCESS motion appears only from
> verified Agent Work Visibility state; it never replaces topology kind marks.
> The macOS app also carries a static menu-bar template with localized Open/Quit
> actions for the existing window. It does not claim background work, and no
> Windows notification-area surface ships from macOS-only evidence.

The product is not a general-purpose ontology editor or a code index. It is a
codebase ontology workbench. Its core user-visible loop is `init -> bootstrap ->
MCP-backed agent answer -> agent sync proposal -> git diff review -> better next
agent task`.

| Surface | Entry | Audience |
|---|---|---|
| **Desktop app** (macOS · Windows x64 beta) | signed/notarized macOS DMG or unsigned Windows beta NSIS → installed local workbench; first run opens the compatible `/docs/?intent=local` vault setup entry; primary workbench routes `/topology`, `/architecture`, `/library`, `/ontology/insights`, `/projects`, `/agents`, and `/mcp`; `/git` remains a contextual workbench route | daily visual ontology work — pick a local vault folder, inspect reviewed architecture, edit markdown-backed nodes/relations, reopen recent vaults without visiting the hosted site |
| **CLI** (R12 / R14 / R15+ · 62 commands) | `init / agent-setup / agent-files / agent-activity / add / import / list / find / validate / mcp-verify / query / compile / export / constellations / constellation` (vault basics + existing-vault Claude/Codex config repair + read-only agent-file map/drift readout + explicit live activity heartbeat + installed MCP health/graph-query smoke + deterministic graph compile + standard-format interop export + saved task-scope recovery) · `index / analyze / analysis / infer-imports / architecture / bootstrap / preflight / snapshot` (autonomous ingest, project ontology indexing, reviewed architecture conformance, commit preflight, and vault-scoped git snapshot commits) · `backlinks / orphans / path / explain / all-paths / reachability / relation-check / relate / rename / merge / delete` (graph CRUD + direct/path/common-neighbor explanation + bounded traversal + transitive closure + write preflight + write) · `match-nodes / match-edges / domain-matrix / facets / schema / pattern-walk / project-map / overview / hubs / blast-radius / cycles / components / topological-order / health / agent-brief / workspace-brief / growth / maintenance / node / similar` (graph deep dive — `query_ontology` ops, including graph DB-style node/edge scans, relation dashboard facets, relation schema patterns, explicit traversal and project maps, connected island checks, prerequisite ordering, relationship explanation, domain coupling matrix, agent handoff, and growth/maintenance queues) | developer terminal — vault scaffold, daily exploration, bulk import, MCP sanity check, live agent activity handoff, architecture pre/post checks, commit-time vault impact preview, graph deep dive (same authority as AI agent via MCP) |
| **MCP** (R5 / R7 / R11 / R14 / R16 / R17) | current runtime read/write inventory over JSON-RPC (`tools/list`; prove with `mcp-verify`) | AI agent (Claude Code, Codex, Cursor) — explicit vault/repo root proof · read for context · write back findings · vault-scoped Git status/local snapshots · safe relation removal/replacement and concept reclassification · bootstrap/index projects · finalize project competency receipts · compile/query/validator-backed health and fresh categorical meaning assessment |
| **Website** | GitHub Pages static export / `/` + `/topology` + `/download` | With no active vault, `/` is the gateway; with a loaded local vault it is the topology map, as is explicit `/topology`. `/download` is the product intro + current release download path. Library remains local-first; desktop-only file abilities degrade in place while browser-supported reading and editing remain available. |

Multi-project vaults use explicit selection at the agent boundary:
`ontology-atlas agent-brief --project SLUG` forwards the same project identity
as `query_ontology({ operation: "agent_brief", project: SLUG })`.

When that brief finds incomplete `abilities` or implementation `evidence` against
a current source receipt, `meaningRepair:v2` gives the agent a compact human-review
manifest. The existing `query_ontology` tool's `meaning_repair_review` operation
then serves the complete typed candidates as provenance-bound pages of at most
20 targets and 5 KiB each, with matching full-body read calls and an opaque next
cursor. It stays read-only: every page and target mtime must be checked before
human approval, and Atlas still never patches or finalizes meaning automatically.

```
input (humans + AI agents)     parse           store              output
        │                       │                │                │
        ▼                       ▼                ▼                ▼
  .md in vault  →          frontmatter   →  user disk      →  Topology (/, /topology) map + INDEX
  (frontmatter)                              (vault)           Topology contextual write + review
  + architecture-profile/v1                                  Architecture (/architecture) intent + conformance handoff
  + AI agent (MCP)                                            Library → Ontology (/library?tab=ontology)
                                                              Insights (/ontology/insights) maintenance board
                                                              compatibility redirects (/ontology, /ontology/edit, /ontology/studio)
```

### Web and app do not promise the same screens (2026-07-27)

Decided in `docs/DECISIONS.md`; the enforceable version is
`.claude/rules/surfaces.md`. It is one codebase and one build — the app loads
the same static export in a WebView — so this is a capability table, not a
feature-parity backlog. **Desktop capabilities ship without a web equivalent,
on purpose.** What the web owes instead is an honest degradation: why it cannot
work here, and where it can.

| Capability | Web (Chromium) | Desktop app (macOS · Windows x64 beta) | Why they differ |
|---|---|---|---|
| Open the map with no install | ✅ | ✅ | the web's first job — gateway |
| Open your own markdown folder | ✅ File System Access API | ✅ absolute path | Firefox and non-FSA browsers degrade to a notice + download link |
| Read / edit / create nodes in that folder | ✅ | ✅ | same parser, same schema, same files |
| Remember the folder between visits | ❌ pick it again | ✅ | web keeps an FSA handle in its own IndexedDB; a convenience cache, not the source of truth |
| Resume a single folder on launch | ❌ the browser needs a click for permission, and the chooser says so | ✅ opens it directly | File System Access permission has to come from a gesture, so the web presses something either way |
| Choose between known folders on launch | ✅ | ✅ | two or more known folders open a centered, content-sized chooser with Open folder and Create new beside the list heading; the list grows with its contents and scrolls internally only when space runs out; names wrap and paths keep their full value on hover; a folder the browser refused keeps its row with recovery/removal actions, while folders that no longer exist fold into one quiet line at the end of the list, reviewed in a dialog (in place in the rail switcher) that lists each path and forgets one or all of them only when pressed; constrained height or larger text folds optional guidance into an accessible help dialog so the list stays usable; one folder resumes directly |
| See which folder is open, and leave it | ✅ | ✅ | the folder's name sits at the top of the rail on every destination and opens the switcher; each row carries the folder's contents, its last opening, and whether it opens now |
| Map entry feedback | ✅ | ✅ | sidebar and G M map entry show a live preparation scene before navigation; the first canvas draw releases it, and another destination or the return action can cancel the pending entry |
| Work offline | ❌ | ✅ | |
| Git history and snapshots | ❌ degraded card + `ontology-atlas snapshot` | ✅ | a browser has no right to run git on your machine |
| API keys / in-app **agent** chat | ❌ **and will not be built** | ✅ native credential store | keys in browser storage leak to a single XSS, and vendors name the direct-call header `…-dangerous-direct-browser-access` |
| Write agent config (`.mcp.json`) into the vault | ⚠️ folder writes work, but there is no absolute path to record | ✅ | MCP registration needs a real path |
| In-app updates | ❌ | ✅ | |

**Windows today**: an unsigned x64 beta carries the same local folder and MCP
surface as the desktop app. `/download` states the SmartScreen unknown-publisher
and managed-PC risk before the executable CTA. Chrome or Edge remains the
install-free fallback when that warning or an organization policy is a blocker;
the web still does not offer BYOK or MCP registration.

---

## Feature inventory

> The route inventory itself is `docs/ARCHITECTURE.md` — the files below describe what
> each surface *does for a user*, not how many there are.

Destinations are one file each under `features/`; the map and the Library, which
change most often, are a folder each with one file per topic
([`features/map/`](features/map/README.md), `features/library/`). Surfaces that
appear on every page are under [`features/cross-cutting/`](features/cross-cutting/README.md).
Data sources, the MCP server and keyboard shortcuts have one file each. Start a new
one with `pnpm doc:new -- --type=feature --area=<area> --slug=<slug>`.

---

## 8. Source-of-truth files

When this doc and code disagree, code wins. Trust:
- `package.json`
- `next.config.ts`
- `app/[locale]/layout.tsx`

For per-route truth: open the corresponding `src/views/*` file. Each route has comments explaining mode-aware fallbacks, deep-link sync, and edge cases.
