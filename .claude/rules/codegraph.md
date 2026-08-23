---
paths:
  - "src/**"
  - "app/**"
  - "mcp/**"
  - "cli/**"
  - "scripts/**"
  - "src-tauri/**"
  - "tests/**"
---

# CodeGraph — first tool for structural code questions

> Conditionally loaded when code is opened. `AGENTS.md` carries the always-loaded
> trigger summary. Ignore this entire rule when the client has no CodeGraph.
> The tool is `colbymchenry/codegraph`; several unrelated products share the name.
> Trust its status output, not a version-number rule.

## What it knows

- CodeGraph is a deterministic tree-sitter/Rust index, not an LLM summary. When
  it is wrong, the parser missed syntax; first ask whether the question belongs
  to its structural domain.
- It knows symbols, imports, calls, references, verbatim symbol source, impact,
  and covering tests.
- It does not know i18n strings, comments, Markdown, generated JSON, Git history,
  CSS token values, or interface field names. Measured example:
  `touchedNodeIds` was invisible to query/explore while `rg` found it directly.
- Source returned by `explore` counts as read. Do not reopen it merely to
  understand it. Read again only when the editing harness requires it before an
  edit.

## Routing

| Situation | With CodeGraph | Without CodeGraph |
|---|---|---|
| Start in an unfamiliar area | `codegraph explore` with exact symbols or file names | `rg` plus a targeted read |
| Symbol name unknown | `codegraph query`, then `explore` | `rg` |
| Rename, delete, or change a signature | `callers`/`impact` plus one `rg` pass for comments and docs | exhaustive `rg` |
| Tests fail or test scope is unclear | `codegraph affected <files...>`, cross-checked with `pnpm checks:changed` | `pnpm checks:changed` |
| Trace X to Y | explore both exact names together | reconstruct the chain with targeted search |

Pass symbol names, not prose questions. Exact input produces exact output.

- Bad: `codegraph_context("how is the gateway decided")`
- Good: `codegraph explore isGatewaySurface nav-destination.ts`

The good form returns the definition, AppShell consumers, and covering route
contract in one measured call.

## Four failure modes

1. **A prose query broadened retrieval.** Discard mixed, irrelevant results. Find
   the exact name with `codegraph query`, then retry. If no exact target exists,
   the question is not for CodeGraph.
2. **The index is stale.** Watch for the warning banner or inspect `Pending
   Changes` in `codegraph status`. Read only the pending files directly, or run
   `codegraph sync` after a large out-of-session branch change.
3. **An empty result was treated as proof of absence.** Strings, config values,
   generated data, vault Markdown, test assertion text, and test IDs require
   native search. “No result” outside CodeGraph's domain proves nothing.
4. **Native search repeated a valid structural result.** This doubles context
   without adding evidence. Retry CodeGraph with a more precise identity; switch
   tools only for material it cannot index.

## Freshness

The watcher normally updates the index within seconds after a save. Run a manual
sync only when it was absent during a large pull or branch change. If status
reports an incompatible extraction version or inconsistent graph, run
`codegraph index`. A full index here measured about one second for 1,719 files.

## Worktrees

Indexes are not shared across worktrees (upstream issue #155). A mismatched index
prints “index belongs to a different git working tree” rather than silently
answering. Run `codegraph init .` inside that worktree (about four seconds here;
`.codegraph/` is ignored). If results under `.claude/worktrees/**` look wrong,
check status first because watchers in ignored paths have failed silently
upstream.

## Telemetry

CodeGraph enables anonymous telemetry by default and queues it at
`~/.codegraph/telemetry-queue.jsonl`. Atlas's no-silent-collection promise governs
our product, not third-party tools, but the state must be visible. The owner—not
an agent—decides whether to run `codegraph telemetry off`.
