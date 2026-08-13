# ontology-atlas-mcp

> The MCP server for a repo-native AI-agent memory layer. It lets Claude Code,
> Cursor, Codex, and other MCP clients read, query, and maintain the markdown
> ontology vault stored beside the code.

The vault is still plain markdown. The graph-database-like behavior comes from
`compile_ontology` and `query_ontology`, which build and query a deterministic
runtime graph artifact without introducing a backend database. During one MCP
server session, repeated `query_ontology` calls reuse the compiled artifact
while the vault document signature is unchanged, so agent run orders avoid
recompiling the same graph over and over.

Kind selection and relation meaning are not redefined in this tool manual. The
single public contract is
[`docs/ONTOLOGY-ATLAS-SPEC.md` §2](../docs/ONTOLOGY-ATLAS-SPEC.md#2-the-five-authorable-node-kinds-and-reserved-reader-kind).
One current support boundary matters when using MCP: `broader:` is validated
frontmatter and the app renders it as `is_a`, but neither name is accepted by
the public relation query/write enums. Read the node and its `mtime`, then use a
guarded full-array `patch_concept` and `validate_vault`; do not invent
`add_relation(type:"is_a")`.

## SDK and protocol baseline

As of 2026-07-29, this package targets the **v2 SDK** —
`@modelcontextprotocol/server@2.0.0` (+ `@modelcontextprotocol/core`). Upstream
split the monolithic `@modelcontextprotocol/sdk` into `core` / `server` / `node`
on 2026-07-27 alongside the `2026-07-28` specification, and v2 is now the stable
release line. v1 moved to a long-lived `v1.x` branch receiving bug and security
fixes for at least six months.

**The wire protocol did not move.** v2 ships the *same* supported-version list as
v1 — measured:
`["2025-11-25","2025-06-18","2025-03-26","2024-11-05","2024-10-07"]`,
`LATEST = 2025-11-25`. The `2026-07-28` spec's `server/discover` and stateless
envelope exist only in v2's type definitions, not in its negotiation constants.
So this migration buys **the vessel, not the cargo**: when the SDK does implement
`2026-07-28`, the move is a version bump instead of a package rewrite.

**Old clients still connect** — verified by driving a v2 server over stdio with a
`2024-11-05` `initialize`: it negotiates that version and answers `tools/list`
and `tools/call` normally. Claude Code and Codex are unaffected.

Keep the dependency exact, not a broad range, so release builds do not drift
across SDK behavior during install.

This server currently exposes a local stdio MCP surface, not a local HTTP
server. That keeps it outside the SDK DNS-rebinding advisory scope for
unauthenticated localhost HTTP transports, while still using the standard
JSON-RPC lifecycle expected by Claude Code, Cursor, Codex, and other MCP
clients.

MCP design contracts this package treats as release-critical:

- `tools/list` must expose strict JSON Schemas (`additionalProperties:false`)
  and tool annotations (`title`, `readOnlyHint`, `destructiveHint`,
  `idempotentHint`, `openWorldHint:false`).
- Tool results must include `structuredContent`; when text JSON is also present,
  the verify helpers compare both payloads for parity.
- Read tools must stay side-effect free. Write tools must keep explicit
  `expected_mtime`, dry-run, `confirm`, `overwrite`, and `force` safety gates.
- Every destructive dry-run exposes the same machine decision fields:
  `previewReady`, `canConfirm`, `wouldChange`, and `blockedReasons[]`. Agents
  should use those fields instead of interpreting the tool-specific legacy
  `ok` value.
- Tool descriptions and initialize instructions must describe security,
  recovery, and destructive-write boundaries plainly enough for an agent to
  recover from strict-input errors without guessing.
- Remote or HTTP transports require a separate security review for
  authentication, DNS rebinding protection, origin/host validation, and
  least-privilege tool scopes before being added.

## Quick start

### 1. Register with an agent

The server reaches you through two channels: the installed macOS app, which
carries a compiled copy of this server inside its own bundle, and a source
checkout. npm publishing is retired (`docs/DECISIONS.md`, 2026-07-27), so
there is no `npx` channel.

**App-bundled (primary).** Open your vault folder in the app and press the
connect button. It writes exactly this, with your vault's real absolute path
already filled in — you do not have to install Node, this package, or anything
else:

```json
{
  "mcpServers": {
    "ontology-atlas": {
      "command": "/Applications/Ontology Atlas.app/Contents/MacOS/ontology-atlas-mcp",
      "args": [],
      "env": {
        "OATLAS_VAULT": "/absolute/path/to/vault"
      }
    }
  }
}
```

The binary keeps serving while the app is closed. It lives on disk, and the
agent client spawns it once per session.

**Source checkout (fallback).** Where the app is not installed — a Linux box, a
CI runner, or a clone you are developing in — point `node` at the checkout:

```json
{
  "mcpServers": {
    "ontology-atlas": {
      "command": "node",
      "args": ["/absolute/path/to/ontology-atlas/mcp/src/index.js"],
      "env": {
        "OATLAS_VAULT": "/absolute/path/to/vault"
      }
    }
  }
}
```

From a checkout, the local CLI writes both agent config files for you:

```bash
node cli/src/index.mjs init ./ontology
```

That creates the starter markdown vault plus ready-to-use MCP config files:

- `.mcp.json` for Claude Code / Cursor
- `.codex/config.toml` for Codex

Add `--quick-start` to scaffold and prepare a review from the current repository
in the same run. The cold-start CLI never writes semantic ontology nodes: an
exact `constructionQualification:v1` packet, human acceptance, and unchanged
released `writePlan` are required through the MCP lifecycle. If bootstrap or
MCP startup fails, the command keeps the scaffold and configs, returns nonzero,
labels them unverified, and prints exact diagnose/retry commands; a successful
quick start reports review-ready, not semantically complete.

Open either the codebase root or the vault folder in the agent and restart it.
The generated root config points at `./ontology`; the vault-local config uses
`OATLAS_VAULT=.` so the folder stays portable.

For an existing vault, run `node cli/src/index.mjs agent-setup ./ontology --write`
from the codebase root. It checks or creates only `.mcp.json` and
`.codex/config.toml`. With `--write`, parseable files atomically merge or rebind
only the single `ontology-atlas` entry while preserving unrelated servers,
sections, and comments. Invalid JSON, duplicate Atlas TOML sections, and
incomplete section pairs remain untouched and receive merge templates for
manual review.

Settings and `agent-setup` count only those two active client configs. The
`.mcp.json.example` file is a copy/merge template, not a third connection.
Ready means the config has one supported executable launch shape and the
expected vault coordinates; after restarting the client, run `mcp-verify` to
prove the server actually boots and exposes the current tool inventory.

Codex also stores MCP servers globally. Register the bundled binary:

```bash
codex mcp add ontology-atlas --env OATLAS_VAULT=/absolute/path/to/vault -- "/Applications/Ontology Atlas.app/Contents/MacOS/ontology-atlas-mcp"
```

…or the source checkout:

```bash
codex mcp add ontology-atlas --env OATLAS_VAULT=/absolute/path/to/vault -- node /absolute/path/to/ontology-atlas/mcp/src/index.js
```

If `OATLAS_VAULT` is not set, the current working directory is used as the vault root.

### Other MCP clients (generic stdio registration)

Claude Code, Cursor, and Codex are the only clients `init`/`agent-setup` write
config for, but **any MCP client that speaks stdio JSON-RPC can register this
server** — opencode, a custom agent harness, or anything else. Only the
config file's *name and location* differ; the `command` / `args` / `env`
triple is the same shape shown in the snippets above, standalone:

```json
{
  "command": "/Applications/Ontology Atlas.app/Contents/MacOS/ontology-atlas-mcp",
  "args": [],
  "env": {
    "OATLAS_VAULT": "/absolute/path/to/vault"
  }
}
```

(source checkout: swap `"command"` for `"node"` and `"args"` for
`["/absolute/path/to/ontology-atlas/mcp/src/index.js"]`.)

#### Read-only registration (`OATLAS_READ_ONLY`)

When the registrant is **not** the vault owner — a shared dashboard, a review
bot, an external tool that only needs to *read* the graph — add
`"OATLAS_READ_ONLY": "1"` to the `env`:

```json
{
  "command": "/Applications/Ontology Atlas.app/Contents/MacOS/ontology-atlas-mcp",
  "args": [],
  "env": {
    "OATLAS_VAULT": "/absolute/path/to/vault",
    "OATLAS_READ_ONLY": "1"
  }
}
```

In read-only mode the server advertises **only the 19 read tools** in
`tools/list` (the 16 write tools — `add_concept`, `add_concepts`,
`add_relation`, `add_relations`, `patch_concept`, `rename_concept`,
`merge_concepts`, `delete_concept`, `absorb_document`, `git_snapshot`,
`finalize_project_meaning`, `connect_project_source`, and
`disconnect_project_source` — disappear), and any
direct call to a write tool is rejected even if the client cached an older
tool list. This is the trust-charter-aligned surface for third-party
registration: a read consumer gets zero paths to the user's disk. Accepted
truthy values: `1`, `true`, `yes`, `on` (case-insensitive); anything else
leaves the full read+write surface intact.

Steps for a fourth client:

1. Find where your client registers MCP servers (its docs likely mention
   "MCP server", "stdio transport", or "tool provider").
2. Register a server named `ontology-atlas` using the command/args/env above.
   Prefer an absolute `OATLAS_VAULT` path — some clients don't spawn the
   server from your project root, and a relative path would then resolve
   against the wrong directory.
3. Restart the client so it re-reads its config.
4. Verify the registration independently of your client:
   `node /absolute/path/to/ontology-atlas/cli/src/index.mjs mcp-verify /absolute/path/to/vault`
   drives the server directly through the full initialize → tools/list → tools/call lifecycle
   and prints a pass/fail line per tool plus one verdict line — this
   confirms the server/vault side works no matter which client you're
   registering it with.

### Source-checkout verification

When editing this MCP package from the monorepo, prefer the focused root checks
before escalating to the full integration suite:

```bash
pnpm test:contracts
pnpm test:mcp:unit
pnpm integration:mcp:surface
pnpm integration:mcp:repo-analysis
pnpm integration:mcp:graph
pnpm integration:mcp:vault-read
pnpm integration:mcp:read
pnpm integration:mcp:write
pnpm integration:mcp:readme
pnpm test:mcp:docs
pnpm test:mcp:registration
pnpm test:mcp:dogfood
pnpm test:mcp:dogfood:timeout
pnpm test:mcp:maintenance
pnpm test:mcp:package
pnpm test:mcp:suggestions
pnpm test:mcp:verify
pnpm test:mcp:verify:first-contact
pnpm test:mcp:verify:timeout
pnpm integration:cli:compile
pnpm dogfood:compile
pnpm dogfood:compile-fix
pnpm test:dogfood:args
pnpm test:dogfood:script-refs
pnpm test:dogfood:compile-fix
pnpm dogfood:health
pnpm dogfood:agent
pnpm dogfood:agent-graph-db-pack
pnpm dogfood:graph-db
pnpm dogfood:agent-setup-gate
pnpm dogfood:agent-fallbacks
pnpm dogfood:brief
pnpm dogfood:growth
pnpm dogfood:maintenance
pnpm dogfood:status
pnpm test:dogfood:status
pnpm test:dogfood:graph-db
pnpm dogfood:verify
pnpm dogfood:test
pnpm cli:mcp-verify docs/ontology --timeout-ms 15000
pnpm cli:mcp-verify -- --help
```

`integration:mcp:surface` narrows the JSON-RPC `tools/list`, `initialize`, and
`tools/call` server surface. `integration:mcp:repo-analysis` narrows code-to-vault analysis
handler contracts. `integration:mcp:graph` narrows graph artifact/query handler contracts.
`integration:mcp:vault-read` narrows list/get/find/path/orphans/validate vault read contracts.
`integration:mcp:read` narrows `query_concepts` and shared read/query validation
contracts without duplicating graph or repo-analysis subsets.
`integration:mcp:write` narrows write tool handler contracts.
`integration:mcp:readme` runs the documented
first-contact read-only MCP flow only. `test:mcp:unit` runs the MCP core parser, vault, compiler, query,
import-analysis, ignore-file, and JSON-RPC line helper unit contracts without
spawning the full integration suite; when `pnpm checks:changed` prints a direct
`pnpm exec node --test mcp/src/<name>.test.mjs` command, run that first for the
smallest matching MCP core check. `test:mcp:docs` checks README and dogfood ontology documentation drift.
`test:mcp:registration` checks only the tracked source-checkout `.mcp.json`,
`.mcp.json.example`, and `.codex/config.toml` templates.
`test:mcp:dogfood` covers the dogfood helper's structuredContent output,
indexed `compile_ontology` gate, tools/list inventory names + annotation coverage, batch writer
row-label guidance summary, vault warning / `validate_vault` problem gates,
first-contact health summary / advisory / next-action gates, `workspace_brief.nextActions[].sample`
shape drift, maintenance_plan malformed payload and work-queue formatter drift,
initialize tool-inventory + safety/recovery guidance gate, destructive dry-run request/gate
contract, help output, unsupported-argument rejection, strict relation filter
rejection, strict add_relation type-preflight rejection + no-write metadata
evidence, strict closest-value summary, stderr warning filtering, and gate
contract without running the live MCP walk.
`test:mcp:dogfood:timeout` narrows that to dogfood argument rejection,
timeout parsing, missing response labels, and retry help.
`test:mcp:maintenance` narrows maintenance_plan filter enums, ready/missing
cursor handling, resume-cursor behavior, dogfood work-queue shape gates, and
bucket / next-action formatter checks.
`test:mcp:package` checks package-script, CLI entrypoint, dependency, and
tarball contract drift without running unrelated UI or E2E gates.
`test:mcp:suggestions` covers strict enum / argument suggestion behavior.
`test:mcp:verify` covers the MCP verify helper contract, including
missing/extra/duplicate/invalid `tools/list` names, without spawning the
full integration suite. `test:mcp:verify:first-contact` narrows that to
initialize tool-inventory + safety/recovery guidance, unknown-tool recovery, read-smoke request
inventory, destructive dry-run / `patch_concept` conflict guard helper gates,
vault warning / `validate_vault`, first-contact health summary / advisory / next-action gates, and
`workspace_brief.nextActions[].sample` shape drift.
`test:mcp:verify:timeout` narrows verify timeout parsing, startup failure
retry guidance, usage, empty-vault fail-fast, and retry diagnostics.
`integration:cli:compile` narrows CLI compile / `--fix` canonicalization
contracts without running unrelated CLI routes.
`dogfood:compile` prints the dogfood vault `compile_ontology` summary JSON
snapshot without running the full installed-style MCP verify walk.
`dogfood:health` prints the dogfood vault fail-closed `health` JSON gate
without running the full installed-style MCP verify walk.
`dogfood:agent-graph-db-pack` prints the dogfood vault shell-pasteable graph DB pack
without running the full installed-style MCP verify walk.
`dogfood:graph-db` runs the dogfood vault graph DB pack runtime gate without
running the full installed-style MCP verify walk.
`dogfood:agent-setup-gate` prints the dogfood vault machine-readable agent setup gate with `ok` and `performanceOk` so agent automation can separate broken setup from slow local fallback latency.
`dogfood:brief` prints the dogfood vault `workspace_brief` JSON snapshot
without running the full installed-style MCP verify walk.
`dogfood:growth` prints the dogfood vault `growth_plan` JSON snapshot
without running the full installed-style MCP verify walk.
`dogfood:maintenance` prints the dogfood vault `maintenance_plan` JSON snapshot
without running the full installed-style MCP verify walk.
`dogfood:status` always runs health + workspace-brief + agent-brief + maintenance, prints `[dogfood:status] health:N · workspace-brief:N · agent-brief:N · maintenance:N`, preserves the first failing exit before escalating, and prints failed-child focused follow-ups (`pnpm dogfood:health`, `pnpm dogfood:brief`, `pnpm dogfood:agent`, or `pnpm dogfood:maintenance` + `pnpm test:mcp:maintenance`) before the `pnpm dogfood:verify` follow-up hint on failure.
`test:dogfood:status` checks that always-run shortcut contract without the full dogfood suite.
`test:dogfood:graph-db` checks the graph DB pack runner contract without invoking the live CLI pack.
Use `OATLAS_TEST_NAME_PATTERN` with `pnpm integration:mcp` when the touched MCP
integration case has a different name. For Node's `--test-name-pattern`, use
`pnpm exec node --test --test-name-pattern "..." mcp/src/integration.test.mjs`
instead of appending the flag after `pnpm integration:mcp --`. From the repo root,
focused integration subset and `test:mcp:*` shortcuts use
`scripts/run-focused-node-test.mjs` so typoed patterns fail when they match 0
tests instead of silently passing as all skipped, and signal-killed `node --test`
subprocesses report the signal plus target path. The wrapper requires an
explicit pattern and at least one test target; use `node --test` directly for an
intentional full run. Node test option values such as `--test-concurrency 1`
or `--test-timeout 1000` are not counted as targets, and a missing split option
value cannot leak the following option value into the target list. Focused runs
with TAP summaries end with `matched=N` before file-level `tests=N`, even when a
matched test fails, so the exact scoped test count is visible without
subtracting skipped tests. File setup/import failures are reported separately as
`setupFailures=N` instead of inflating the matched-test count.
`pnpm dogfood:compile` is the shortest dogfood vault compiler snapshot.
`pnpm dogfood:compile-fix` runs dogfood `compile --fix`, fails if canonicalization leaves a docs/ontology diff, tells you to run `pnpm docs-vault:build`, and ends successful runs with `[dogfood:compile-fix] docs/ontology unchanged`.
`pnpm test:dogfood:args` checks shared dogfood shortcut argument helpers without invoking any gate.
`pnpm test:dogfood:script-refs` checks help text and package script body `pnpm ...` references against root package scripts plus focused filter parsing and wrapper summaries.
`pnpm test:dogfood:compile-fix` checks that idempotence guard without the full dogfood suite.
`pnpm dogfood:health` is the shortest dogfood vault health gate.
`pnpm dogfood:agent-graph-db-pack` is the shortest dogfood vault graph DB pack snapshot.
`pnpm dogfood:graph-db` is the shortest dogfood vault graph DB pack runtime gate.
`pnpm dogfood:agent-setup-gate` is the shortest dogfood vault machine-readable setup gate with `ok` and `performanceOk`.
`pnpm dogfood:brief` is the shortest dogfood vault first-contact snapshot.
`pnpm dogfood:growth` is the shortest dogfood vault growth candidate snapshot.
`pnpm dogfood:maintenance` is the shortest dogfood vault maintenance queue snapshot. Use
`pnpm dogfood:status` for the cheap human-readable health + first-contact + agent handoff + maintenance queue;
it still prints the brief, agent handoff, and maintenance after health fails, preserves the first failing exit,
and prints failed-child focused follow-ups before the `pnpm dogfood:verify`
follow-up hint on failure. Use
`pnpm dogfood:compile-fix -- --help` / `pnpm dogfood:status -- --help`
for shortcut usage without running those gates; unsupported shortcut arguments fail
with exit 2 before starting the underlying checks, and close `--help` typos include
a `Did you mean --help?` hint. Use
`pnpm dogfood:verify` for the full installed-style dogfood vault gate, or
`pnpm dogfood:test` only when the dogfood helper itself needs the full
regression suite beyond the focused `test:mcp:dogfood` gate. Use
`pnpm cli:mcp-verify docs/ontology --timeout-ms 15000` when you need
the explicit CLI wrapper arguments without changing into `mcp/`; use
`pnpm cli:mcp-verify -- --help` only for the help flag.

### 2. Restart the agent

The server connects over stdio. The agent should now show the server's current
tool inventory under the `ontology-atlas` namespace. Use `tools/list` for the
exact names and `mcp-verify` for live parity proof.

### 3. Call the tools

```
"List every capability node in this project."
→ mcp__ontology-atlas__list_concepts({ kind: 'capability' })

"What elements does capabilities/mcp-server depend on?"
→ mcp__ontology-atlas__get_concept({ slug: 'capabilities/mcp-server' })
```

## Current tool contracts

### Node identity contract

Every `kind:` document has two identifiers:

- `uid` is the immutable lowercase UUIDv4 identity. The writer mints it once;
  callers do not supply it. Exact read selectors, handoff/provenance, compiler
  indexes, and interop `urn:uuid:<uid>` use it.
- `slug` is the mutable, human-readable current address. Markdown relations,
  file paths, URLs, graph edge endpoints, and slug-oriented tools keep using it.

`list_concepts` and all node summaries return both `{ uid, slug }`.
`get_concept` accepts exactly one of `{ slug }` or `{ uid }`; `get_concepts`
accepts exactly one of `slugs[]` or `uids[]`. UID misses never use fuzzy
suggestions. Rename and reclassify preserve UID. Merge preserves the target UID
and records the source UID plus prior absorbed identities in merge-owned
`merged_uids`; old UIDs then resolve to the survivor. Generic patch cannot edit
either identity field. Writers do not deliberately recycle a deleted UID, but
this version has no tombstone ledger, so deletion removes exact lookup and a
current-vault validator cannot prove manual historical non-reuse. Use merge
when old-UID resolution must survive.

This boundary is deliberate: UID is not a filename, URL token, relation value,
display number, or React/canvas node ID. Slug remains the inspectable address on
those surfaces.

For `add_concept` / `add_concepts`, `path` is one canonical repo-relative
implementation entrypoint for a capability or element. `elements` contains only
real element-node slugs; a raw file path is evidence, not a graph child.

| Tool | What it does |
|---|---|
| `connection_info` | First-call connection proof: resolved vault/repository roots, resolution sources, same-root warning, restart requirement, server identity, read-only mode, and the actually advertised `toolCount` / `toolNames` / deterministic `toolsetHash`. An explicit `OATLAS_REPO_ROOT` wins; otherwise the server discovers the active vault's Git top-level and falls back to process cwd only outside Git. Run it before repository analysis or writes; compare the inventory after upgrades to catch a stale client process that needs restart. |
| `git_status` | Read-only, vault-scoped Git status: HEAD/branch, changed vault files, outside-vault counts, staged-outside warnings, detached-HEAD and merge/rebase/cherry-pick/revert risk. NUL-delimited porcelain parsing preserves Unicode and whitespace paths. Never initializes, stages, commits, or pushes. |
| `git_history` | Read-only, newest-first commit history scoped to the active vault pathspec. Returns bounded hashes, subjects, authored timestamps, `limited` / `hasMore`, shallow-repository state, and `historyComplete` while excluding commits that touched only files outside the vault. `limit` defaults to 20 and is capped at 100. Never initializes, fetches, pulls, commits, or pushes. |
| `git_snapshot` | Local vault checkpoint with a mandatory dry-run/`confirm:true` flow and exact `expectedHead` concurrency guard. Runs vault validation; blocks validation errors, detached HEAD, and in-progress Git operations; returns the shared destructive-preview decision contract; commits only the vault pathspec; preserves outside staging; and never pushes. |
| `remove_relation` | Removes one exact typed edge and its matching `relation_notes` rationale. Dry-run by default; `confirm:true` writes. Supports `expected_mtime` and is idempotent when already absent. |
| `replace_relation` | Atomically replaces one relation target/type and moves or replaces its rationale in the same source-file write. Dry-run by default; `confirm:true` writes. Supports `expected_mtime`. |
| `reclassify_concept` | Atomically changes a node's kind and optional slug/domain while rewriting backlinks. Preserves custom prose, replaces only generated starter prose for the old kind, requires a domain for capability/element targets, and is dry-run by default with `confirm:true` to write. |
| `list_concepts` | Lists every node in the vault (any `.md` with a `kind:` frontmatter). Options: enum-validated `kind` (project/domain/capability/element/document/vault-readme; typos fail with nearest-value hints instead of empty lists), `domain` (filter by frontmatter `domain:` slug — combine with `kind` for "all capabilities under auth" in one call), `since` (mtime-based incremental sync — only nodes with `mtime > since` ms; pair with the `mtime` returned in earlier responses for "what changed since I last looked"; strict `>` so re-passing the prior max does not double-fetch), `summary` (opt-in — when true, each row includes a prose `summary` (max 200 chars, heading/표/코드/리스트/인용 skip — same `extractSummaryExcerpt` helper as `get_concept` / `find_evidence`) so agents get list + previews in one call instead of N follow-up `get_concept` calls; default off to keep payload small; a row whose body holds more than the summary shows carries `summaryTruncated: true` and the response carries `summaryHint`), `offset` (zero-based deterministic slug order; resume with `pagination.nextOffset`), `limit` (default 100, max 500). The response always includes `returned`, `limited`, and `pagination: { offset, limit, total, returned, hasMore, nextOffset }`; follow every page until `hasMore` is false before calling the census complete. Every node row includes permanent `uid`, current `slug`, and `mtime` (ms), so callers can retain stable identity across renames and sort/filter "what changed recently" without a follow-up `get_concept` call. **R11+**: when the vault has frontmatter corruption or whole-vault graph-reference drift, response includes `vaultWarnings: { errorCount, warningCount }` so AI agents can flag it to the user. |
| `get_concept` | Fetches one node by exactly one permanent `uid` or current `slug` (no extension), and returns both identity fields with frontmatter + body + graph neighbors. UID misses are exact and never fuzzy; slug misses retain near-slug and referenced-only recovery. **`body` (2026-08-01): `'excerpt'` (default) or `'full'`.** `excerpt` returns the first prose paragraph only (heading / 표 / 코드블록 / 리스트 / 인용 skip, max 800 chars); `full` returns the entire markdown body as `body` and omits `excerpt` so the same text is not billed twice. Every response carries `bodyInfo: { mode, totalChars, returnedChars, truncated, omittedChars?, hint? }` — **truncation is never silent**, and when it happens the `hint` is the exact follow-up call. Use `full` whenever the answer depends on what the node says (the construction rules put definition / evidence / confidence / scope in the body, and the excerpt cannot reach them) + graph `neighbors` (`domains` / `domain` / `capabilities` / `elements` / `dependencies` / `relates` / `contains` / `describes`) + `outgoingEdges[]` (`{to, via}`) + `mtime` (ms — pass to subsequent `patch_concept` / `delete_concept` as `expected_mtime` to detect concurrent external edits). **R11+**: response includes `warnings: [...]` when this doc has frontmatter issues, graph-array canonicality drift, or dangling outgoing graph references. **Ask-to-Grow**: when a slug doesn't resolve, the error's `structuredContent.growthHint` carries a did-you-mean near-slug or an `add_concept` scaffold. When the slug is a **referenced-only concept** (the vault names it in a relation key but no document defines it — this is most of what the map draws), the error instead carries `referencedBy: [{slug, via}]` and a growthHint that says which docs cite it and how to materialize it at exactly that slug. Copying a name off the map and getting a flat "not found" was the single most expensive mismatch between the screen and the agent. |
| `get_concepts` | **R+** Batch reader — accepts exactly one of `slugs[]` or `uids[]` (max 50; max 20 with `body: 'full'`), returns `concepts[]` with both `uid` and current `slug` plus the same per-row shape as `get_concept` (frontmatter + `excerpt`\|`body` + `bodyInfo` + neighbors + mtime + warnings?). `body` takes the same `'excerpt'` / `'full'` values as `get_concept` and applies to every row. Output order matches the selected input array. Missing or invalid rows return `{ uid|slug, ok: false, error }` rather than aborting the batch, so later valid identities still resolve. Replaces N×`get_concept` round-trips when an agent already has K specific identities (e.g. from `list_concepts` / `find_path` / `find_orphans`) and needs full bodies for all of them. |
| `find_evidence` | Partial-match search by `title` — scans frontmatter title/capabilities/elements as well as body content. Each match row includes `uid, slug, kind, isNode, title, domain, mtime, matchedIn, score, excerpt` (same identity shape as `list_concepts` / `find_backlinks` / `find_orphans` / `query_concepts` plus the `excerpt` is a prose preview, max 200 chars, heading/표/코드/리스트/인용 skip — same `extractSummaryExcerpt` helper as `get_concept`) so agents see *what the matching doc says* without a follow-up get_concept call. When the body holds more than the excerpt shows, the row carries `excerptTruncated: true` + `bodyChars` and the response carries a `bodyHint` naming the `get_concepts({ body: 'full' })` call that returns the rest — the matched text can sit past the excerpt, so a silent cut here hides the very thing that matched. Matches are **ranked** by relevance `score` (title match > frontmatter ref > body, + a title token-overlap tiebreaker), then by **whether the doc is a graph node**, then slug; pass `limit` for the top-N. **A vault holds ordinary markdown too** — meeting notes, memos and drafts have no `kind:` and are not graph nodes, which is by design. Every row carries `isNode`, non-nodes rank below nodes *of equal relevance* (a note whose title matches exactly still outranks a node the query only brushed in body text), the response carries `nonNodeHint` when any slipped in, and `nodesOnly: true` filters them out. Before this, body matches all scored the same 0.3 and the remaining tiebreak was slug alphabetical — in a 3,000-note vault the top five hits were all memos and no node appeared at all (2026-08-08 measured). Inclusion is unchanged (a node matches iff a substring hit, exactly as before) — ranking only reorders. **Ask-to-Grow**: when `matches` is empty, the response includes `growthHint` — near-titled vault node(s) found by token overlap, or an `add_concept` scaffold when nothing close exists. |
| `finalize_project_meaning` | Post-write boundary for one project's accepted competency Markdown. Call it only after the concept/relation writes, `validate_vault`, and a complete compile; pass `projectSlug` and the project node's current `expected_mtime`. The server derives the body digest, project graph hash, source fingerprint, and witness inventory itself. Inventory source claims include canonical node `path:` fields plus exact backticked `Evidence` / `Paths` rows inside the single persisted `## Competency answers` section; arbitrary prose paths are not claims, and every admitted path must still resolve in the bounded source receipt. It then writes only a small receipt to `.ontology-atlas/project-meaning.json`. It never stores raw answers, witness text, an absolute/private source root, or remote coordinates. The flat response includes categorical `meaningAssessment`; `ok: true` means the receipt was written, **not** that source currentness or project meaning is verified. Each call refreshes `measuredAt`, so the tool is intentionally non-idempotent. |
| `connect_project_source` | Binds one project node to the local code folder it describes, measures it with the same bounded probe the macOS app uses, and writes the source receipt. This is the tool `nextAction: connect_source` (and `repair_source_binding` / `measure_source` / `remeasure_source`) has always been asking for. Omit `rootPath` and the server infers it — the git repository enclosing the vault wins, otherwise the nearest ancestor folder carrying a project manifest. **Dry-run by default**: without `confirm: true` you get the proposed folder, the inference confidence, and how many declared source claims actually resolve inside it, and nothing is written. Declared claims are canonical node `path:` fields, raw path-shaped element roles, and exact persisted competency `Evidence` / `Paths` rows; ordinary body prose never becomes a witness. Re-running with a different `rootPath` replaces the binding. Blocks on an incomplete project scope (a receipt that cannot stamp a project graph hash could never detect later ontology drift) and refuses to overwrite a malformed sidecar unless `repair: true`. The absolute root lives only in the gitignored `.ontology-atlas/project-sources.json`; it never enters the receipt, the markdown, or any handoff. |
| `disconnect_project_source` | Removes one project's source binding and receipt — the reversal of `connect_project_source`, for a folder bound by mistake or a measurement you want to stop trusting. Dry-run by default; `confirm:true` writes. Other projects' bindings are untouched and no ontology markdown changes; the diagnosis returns to `source_unbound` / `connect_source`. |
| `find_backlinks` | Finds every node that points to a given `slug`. Inspects all frontmatter array keys (capabilities / elements / dependencies / relates / …) plus body wikilinks/markdown links. Each match row includes `uid`, current `slug`, `kind`, `title`, `domain`, and `mtime` (same shape as `list_concepts`) — agents can retain stable referrer identity and sort/filter "which referrer is in domain X" or "which referrer was touched recently" without follow-up `get_concept` calls. |
| `find_neighbors` | **R+** One-hop graph neighborhood around a node. Accepts `slug`, optional `direction` (`outgoing` / `incoming` / `both`, default both), optional enum-validated `types` relation filter (`depends_on` is normalized to stored `dependencies`; typos fail with nearest-value hints), `includeNodes`, and `limit`. Returns canonical `edges[]` (`{direction, from, to, via, ref, resolved}`) plus neighbor node summaries carrying `{uid, slug}` so agents can retain stable node identity while inspecting a local graph subview without combining `get_concept` + `find_backlinks` manually. |
| `find_path` | Shortest path between two slugs (BFS, undirected). Returns `{ from, to, hops, nodes, edges, hopCount, found }` where `nodes[i] = { uid, slug, kind, title, domain? }`, `edges[i] = { from, to, via }`, and `via` is the frontmatter key (`domains` / `domain` / `capabilities` / `elements` / `dependencies` / `relates` / `contains` / `describes`) that linked the pair — so the agent sees stable identity, the current path, and why the nodes connect. Option: `maxHops` (default 5, max 20). **Ask-to-Grow**: when `found:false`, the response includes `growthHint` — an `add_concept` example when an endpoint doesn't resolve, or an `add_relation` example when both endpoints exist but no path connects them. |
| `list_kinds` | Vault kind census: `{ total, byKind: { capability: N, ... }, referencedOnlyTotal, conceptsIncludingReferenced }`. `total`/`byKind` count **documented** nodes (a `.md` with `kind:`). `referencedOnlyTotal` counts concepts the vault names in a relation key but no document defines yet — the web map/insights draw those too, so `conceptsIncludingReferenced` (= `total + referencedOnlyTotal`) is the number the screen shows. Reporting both is how the two entrances stop disagreeing about the same vault (2026-07-26: screen said 296, this tool said 96, and nothing explained the gap). |
| `find_orphans` | **v0.5** Finds isolated nodes — docs that no other node references through graph frontmatter (`domains` / `domain` / `capabilities` / `elements` / `dependencies` / `relates` / `contains` / `describes`). Options: enum-validated `kind` (filter) and `excludeKinds` (skip, default `['project', 'vault-readme']`; pass `[]` to include every kind); typos fail with nearest-value hints. Each orphan row includes `uid`, current `slug`, `kind`, `title`, `domain`, and `mtime` (same shape as `list_concepts` / `find_backlinks`) — agents can retain stable identity and sort/filter "old orphans in domain X" without follow-up `get_concept` calls. Useful as a starting point for cleanup or auditing unused nodes. |
| `query_concepts` | **v0.6** Typed filter DSL — `kind=X AND has(Y) AND NOT ...`. Saved-filter / smart-list use case. `kind` values and `has(...)` graph keys are enum-validated with nearest-value hints, and `has(depends_on)` is canonicalized to `dependencies`, so typos do not silently return empty match sets. `limit` defaults to 100 and is capped at 500. Each match row includes `uid, slug, kind, title, domain, capabilities, elements, mtime` (same shape as `list_concepts` / `find_backlinks` / `find_orphans`) so agents retain stable identity and sort/filter staleness without follow-up calls. **Ask-to-Grow**: when `total=0`, the response includes `growthHint` — flags a referenced `kind`/`domain` with 0 nodes in the real vault census, or a generic loosen-the-filter nudge otherwise. |
| `compile_ontology` | **R+** Compiler-style graph artifact for database-like use. Compiles the whole vault into deterministic `nodes[]`, canonical `edges[]`, alias tables, graph issues, graph-array canonicalization actions, stable semantic `graphHash`, `maxMtime`, and optional query indexes (`out`, `in`, `byKind`, `byDomain`, `edgeById`, `aliasToSlug` with `includeIndexes:true`). Canonicalization action `keys` are schema-bound to relation-array frontmatter keys, and action `frontmatter` is relation-array-only so agents can distinguish safe reordering patches from arbitrary frontmatter mutation. Use before advanced reasoning, export, caching, or non-developer graph views. side effect 0. <br>**Large-vault opts (R+):** `summary: true` returns counts + `graphHash` + `byKind`/`byDomain` aggregates (no arrays) — cheap polling for cache invalidation. `nodesLimit`/`nodesOffset` and `edgesLimit`/`edgesOffset` slice arrays with `nodesPagination` / `edgesPagination` meta (`{offset, limit, total, returned, hasMore, nextOffset}`); page-size limits are capped at 500. 100+ 노드 vault 에서 토큰 한도 초과 회피. |
| `query_ontology` | **R+** Graph-engine query over the compiled artifact. Operations: `neighbors` (local graph neighborhood), `path` (one compiled-edge route with aligned `nodes[]` summaries), `all_paths` (bounded simple paths between two nodes with per-path `nodes[]` summaries plus `limit` / `searchBudget` / `exhaustive` / `truncatedByBudget` / `totalPathsExact` metadata and `evidence` guidance), `query_plan` (EXPLAIN-style cost/index estimate plus `execution.shouldRun`, `nextStep`, filter-preserving `suggestedQuery`, filter-aware `estimate.totalMatches` for `match_nodes` / `match_edges`, and safer narrowed payload guidance before a target operation), `centrality` (PageRank-style core-node ranking plus bridge/authority/hub lists), `communities` (label-propagation clusters), `similar_nodes` (duplicate/overlap candidates before writes), `explain_relation` (direct edges + shortest path + shared-neighbor explanation), `reachability` (transitive graph closure from a start node), `pattern_walk` (explicit relation-sequence paths), `impact` (incoming by default: what depends on this?), `blast_radius` (impact grouped by kind/domain with cross-domain edge risk), `subgraph` (bounded N-hop graph slice), `builder_context` (persisted Workshop focus URL, bounded graph neighborhood, `canvasPosition` plus `expected_mtime`, and low-level MCP write handoff; the operation/response field name remains for client compatibility, unsaved UI drafts are explicitly excluded, and the emitted canonical `focusParam` is accepted as the next call's `slug` for round-trip handoff), `overview` (counts, relation distribution, hubs), `schema` (`kind → relation → kind` patterns), `facets` (filter/dashboard aggregates), `match_nodes` (graph DB-style node rows with degree filters plus a `followUp` packet for the first returned row: `node_profile`, incoming/outgoing `match_edges`, `blast_radius`, and CLI fallback commands), `match_edges` (graph DB-style edge pattern rows plus a `followUp` packet for the first returned real edge: `explain_relation`, `path`, `relation_check`, and CLI fallback commands), `node_profile` (single node detail dashboard), `domain_profile` (domain detail dashboard), `domain_matrix` (domain-to-domain coupling), `project_scope` (project-contained graph slice), `project_map` (domain-by-domain project map), `relation_check` (schema-aware preflight before `add_relation`), `components` (connected graph islands), `lineage` and `containment_tree` (project/domain/capability containment), `cycles` (directed dependency-cycle checks, bounded by `searchBudget` with `exhaustive` / `truncatedByBudget` / `totalCyclesExact` — a budget-truncated zero does **not** mean acyclic), `topological_order` (prerequisite-first dependency ordering), `recommend_relations` (safe domain-containment suggestions), `growth_plan` (side-effect-free ontology expansion candidates), `maintenance_plan` (ordered post-write graph cleanup/repair actions with stable action `id`, cursor resume via `afterActionId`, ready pages with `cursor.found=true` / `cursor.reason=null`, cursor miss `reason`, executable graph-array canonicalization, count-safe summary fields, `byPhase` / `bySeverity` / `byKind` remaining-queue buckets, `executable` flags, current-page `nextExecutableAction` / `nextReviewAction`, and `executableOnly` / `phases` / `severities` / `kinds` filters; `phases`, `severities`, and `kinds` are enum-validated), `agent_brief` (Claude Code/Codex handoff prompt, structured `businessOntologyLens` with the business-first `outcome` → `domain` → `capability` → `element` read order, structured `graphDbQueryPack` for graph DB-style node scan / edge scan / graph facets / domain coupling / path evidence / business questions, structured `cliFallbackCommands[]` for connector-less sessions, recipes, graph entrypoints, playbook `evidence[]` and `stopWhen[]` checklists, `traversalStrategy` for plan-first bounded path evidence, write guardrails including post-change `health` / `cycles` / `growth_plan` / `maintenance_plan` / `validate_vault`, `relation_check` decision guide, `resultContracts` for interpreting `all_paths` completeness and `match_nodes` / `match_edges` followUp evidence, and read-first write policy; `business_questions` runs outcome facets, domain node scans, domain coupling, capability node scans, and capability→element evidence edge scans so agents answer outcome / boundary / capability claim / implementation evidence questions before treating paths or APIs as ontology roots; `agent-brief --graph-db-pack` and the UI copyable CLI pack include intent, evidence-rule, and proof-checklist comments so connector-less sessions see that scan rows are candidates until `totalMatches`/`limited`/row count, node or edge follow-up detail, and `evidence.pathsComplete` are cited), `workspace_brief` (first-contact status + next actions), and `health` (one-shot graph integrity dashboard; raw `components` are still reported, but vault README-only components are ignored for actionable health/nextActions). `match_nodes.kind` and `match_edges.fromKind` use the ontology node-kind enum; `match_edges.type` uses the relation-type enum; `match_edges.toKind` also accepts `external` and `unresolved` target kinds. `match_edges.filters`, `match_edges.edges[].relationType`, `followUp.focusEdge.relationType`, and `query_plan(match_edges).normalized` include public names such as `depends_on` alongside canonical frontmatter `types` or `via` values such as `dependencies`, so CLIs and agents can show user-facing relation names without losing executable graph keys. `node_profile.edges.incoming/outgoing.byRelationType` and edge `relationType` expose public names such as `depends_on` for node detail views; `domain_matrix.filters.relationTypes`, `connections.rows[].byRelationType`, and connection examples do the same for coupling views, while canonical `types`, `via`, and `byRelation` stay available for graph-key callers. The UI semantic coupling matrix and CLI node deep dive can be rerun from Claude Code, Codex, or terminal fallbacks with the same user-facing names. Typoed values return nearest-value hints instead of empty result sets. `health` / `workspace_brief` / `agent_brief` can tune their internal probes with `componentLimit`, `cycleLimit`, `recommendationLimit`, `orderLimit`, `nodeLimit`, `dependencyTypes`, and `componentTypes`; `agent_brief` forwards the same probe tuning into its embedded readiness checks. Accepts canonical slugs or unique aliases. Use for graph-database-like answers without pulling the full compile payload. side effect 0. |

> **Impact truth contract.** `impact` and `blast_radius` follow declared
> `depends_on` only. Structural relations are rejected and belong to
> `reachability`/`subgraph`. `blast_radius.risk` and completeness remain
> `unknown` until relation-level source receipts exist; each returned edge is
> `review_required` or `declared_with_rationale`, never silently source-backed.

`agent_brief` also exposes guide metadata under `docs.workflowGuide`, the setup mode chooser under `docs.modeComparison`, the graph scan proof steps under `docs.graphScanProofChecklist`, and the business-first read order under `businessOntologyLens`, so agents can read the same mode, proof, and outcome → domain → capability → element contracts without parsing Markdown or prompt prose.

For the selected project, `agent_brief.projectSource` also exposes the versioned,
categorical code-evidence view saved by the installed app in
`.ontology-atlas/project-sources.json`: `status`, `currentness`, `measuredAt`,
`topGap`, `nextAction`, `bindingCardinality`, and a validated public `receipt`.
This is evidence about declared capability/element code locations at a recorded
measurement, not a numeric confidence score and not proof that the whole repository
is correct. `receipt.sourceKind` is either `git` or `folder`; `git` means the chosen
source is a Git worktree, not that a GitHub account or remote is connected. The
private absolute `rootPath` stays in the local binding envelope and
is never returned; the public receipt contains only the source identity/revision/
fingerprint and source-relative witness paths.

A fresh MCP process locally repeats the installed app's bounded source probe against
that human-bound private root. If source kind, identity, revision, and fingerprint all
match the saved receipt, it reports `current`; if any differ, it fails closed as
`review_required` / `source_changed` and asks the app to remeasure. The root and raw
inspection inventory never cross the public MCP boundary. A permission, filesystem,
or Git failure preserves the last valid receipt but reports
`currentness:"unavailable"`: unavailable means “could not recheck,” not “known stale.”
MCP also reports `stale` when a complete current project graph hash differs from the
receipt; a bounded/unknown graph scope does not invent ontology drift. `projectSource`
augments the handoff and does not replace `agent_brief.readiness`.

`health`, `workspace_brief`, and `agent_brief` also attach whole-vault
validation. A validator warning/failure inserts an actionable
`vault_validation` next action; when validation alone downgrades readiness,
`agent_brief.readiness.score` is lowered too, avoiding a contradictory
`needs_attention` status with a perfect score.

`agent_brief.meaningAssessment` is the selected project's categorical meaning
contract: `verified_current`, `review_required`, `needs_evidence`, or `invalid`,
with separate structure, competency, and source dimensions. It fails closed
when a receipt, witness, graph hash, or source-currentness check is missing or
inconsistent; no numeric confidence is synthesized. Pass `project` to
`query_ontology({ operation: "agent_brief", project: "..." })`, or use
`ontology-atlas agent-brief <vault> --project SLUG`, to select one project in a
multi-project vault.

Source currentness and competency provenance have different repair actions.
When the source receipt itself is stale, the gap remains
`source_changed` and the action is `remeasure_source`. When source is already
`verified_current` / `current` but the stored competency receipt cites an older
source fingerprint, the source dimension stays current while the overall
assessment fails closed as `review_required`; the gap is
`competency_source_changed` and the action is `reevaluate_competency`.

When current graph/source evidence can narrow an incomplete `abilities` or
`evidence` answer, `agent_brief.nextActions[0]` is
`review_competency_repair` and points to `agent_brief.meaningRepair`
(`meaningRepair:v1`). The packet keeps four facts separate: what the project
Markdown currently declares, typed-containment candidates that are ready only
for human semantic review, canonical-path candidates supported by the current
source receipt, and unresolved targets. It never upgrades a candidate to
`answered`, never writes or finalizes automatically, and never exposes a
private source root or raw inspection inventory. The typed workflow reuses
`get_concepts`/`get_concept` → explicit human approval →
`patch_concept(expected_mtime)` → `validate_vault` →
`compile_ontology({summary:true})` → reread →
`finalize_project_meaning(expected_mtime)`. Non-current source, provenance
change, incomplete scope/receipt, validation or compile errors, human
non-approval, unresolved evidence promoted to answered, and mtime conflict are
hard stops. If those prerequisites are unavailable, the packet is present as
`status:"blocked"` and does not replace the existing source/health action queue.
The first workflow step already materializes one stable, deduplicated union of
`projectSlug`, sorted domain slugs, and sorted capability slugs named anywhere
in both questions' `review` buckets, including `witnessCapabilities`. It emits
literal `get_concepts({slugs:[...], body:"full"})` calls in deterministic
batches of at most 20, the public full-body tool limit; a 27-target review is
therefore executable as 20+7 without agent-authored batching or omissions.
`derivation.slugs:"project_and_all_review_targets"` remains on the workflow
step only as audit metadata. CLI/MCP verification rejects a missing, duplicate,
reordered, oversized batch or a repair packet over 5 KiB.

Semantic document discovery is bounded before content enters the packet: the
combined `docs/`·`site/`·`website/` walk stops at 200 Markdown files or 1,000
directory entries, generic semantic files stop at 256 KiB before read, broken
links are diagnosed, and a real directory is visited once even when an
in-repository symlink points to it.

For direct `apps/*` / `packages/*` workspaces, static `package.json` contracts
with both a name and description plus package `README.md` files may compete for
that same six-document packet. Atlas considers at most 48 direct members per
conventional root, reads no package scripts or dependencies, and keeps this as
reviewable evidence rather than automatic business meaning. Repository-escaping
package paths stay out.

| `validate_vault` | **R+** Validate every doc in the vault, return `{ scanned, problems: [{slug, issues}], summary: { problemFiles, errorFiles, warningFiles, byCode }, pathDrift }`. The public `outputSchema` is the machine-owned canonical issue-code set and restricts both `issues[].code` and `summary.byCode`; identity errors include missing/invalid UID, invalid or non-canonical merge history, and duplicate UID claims. `pathDrift` = vault→code path drift: frontmatter `path:` / `elements:` source paths missing on disk, resolved against `repoRoot` (input param, default active resolved repository root from `connection_info`) → `{ repoRoot, checked, nodesScanned, pathsChecked, drifts: [{slug, kind, key, missingPath, suggestedPath?}], hint }`. **`checked: false` (2026-08-01) means nothing was measured** — the vault is not inside a git repository and no `repoRoot` was given, so the repository it describes is unknown and any number would be noise rather than drift; `drifts` is then empty because it was not looked at, not because it is clean; ontology-slug refs are never flagged; fix via `patch_concept` or remove the stale entry. `suggestedPath` (optional, Track A #3) appears when exactly one existing repo source file shares the missing file's basename — a likely reconcile target ("the source moved here"); ambiguous (>1) or absent matches yield no suggestion. One round-trip whole-vault health check — use for first-contact before writes, before / after a batch write, or to surface issues. Replaces the K-roundtrip pattern of `list_concepts` then per-doc `get_concept` (whose `warnings: [...]` is per-file). |
| `analyze_repo_structure` | **R16** Analyze a code repository (default active resolved repository root) and propose ontology node candidates from package metadata, README evidence, and source layout. **side effect 0** — vault NOT modified. Emits schema-folder-prefixed flat slugs while source locations stay in `path`/evidence, so candidates match the starter layout and CLI `add` defaults. Semantic evidence includes `trust` and `riskFlags` for instructions, future/negated claims, and deprecated state. Root `ARCHITECTURE.md` plus classified Markdown under bounded `docs/`, `site/`, and `website/` discovery can enter the existing six-document portable packet; archive-like directories and repository-escaping symlinks stay out. A root Rust package `Cargo.toml` contributes one bounded `role:"package-contract"` row containing only allowlisted `[package]` identity/description and `[features]` names/mappings. Its separate `configurationEvidence` packet covers a root package or repo-contained literal direct workspace members: bounded feature declarations plus exact literal `cfg`/`cfg_attr` feature predicate path/line, form, polarity, source role, and raw predicate. It does not evaluate predicates, execute build scripts/macros, infer `use`/`mod`, claim runtime impact, or permit a relation write. Python cold starts likewise accept `README.rst`, a non-executed root `setup.py` with only static `name` / `description` / `python_requires` literals, and top-level packages identified by `__init__.py` as implementation elements. For Python packages it exposes at most 12 implementation boundaries that participate in observed imports as element/path candidates. Direct module/package boundaries remain the base; up to two exact nested security/policy/risk endpoints may reserve slots so risk ownership is not buried in a large import payload. Unused files are not mirrored, ambiguous flat slugs fail closed, and omitted lower-ranked boundaries are reported in `skipped`. A complete proposal may additionally select at most four exact TypeScript, JavaScript, or Python file endpoints already exposed by the observed import graph when they materially improve change navigation; this never adds those files to the analyzer's automatic candidate list. Package contracts, package folders, configuration predicates, and import endpoints are evidence, never automatic domains, capabilities, or semantic relations. Repository-escaping symlinks—including package-internal symlink parents—files over 256 KiB, malformed contracts, and unsupported workspace members are skipped or reported rather than guessed. A call may include the complete project/domain/capability/element/typed-relation `proposal`; `proposalValidation` checks definitions, citations, risk controls, domain/path placement, relation endpoints/types/rationales, confidence, and five typed competency answers. A TS/JS/Python `depends_on` backed by an admitted boundary or selectively proposed exact endpoint must match the observed module/file import direction or validation fails. Each answer carries `answered` / `partial` / `visible-gap` status plus concept, relation, evidence, and path witnesses. Unsupported `answered` claims fail closed; every honest warning becomes an exact `requiredGapId`. The first valid proposal call returns only a deterministic non-writing `reviewPlan`, `planDigest`, `planRevision`, authoritative current `sourceDigest`, and eight-phase `constructionLifecycle`; `canWrite` stays false and `writePlan` is absent. A separately identified evaluator must execute the approved CQs, current claim/citation checks, all seven quality axes, complete source-hidden task, and cold-start or prior-CQ regression. After the user sees the exact plan and gaps, declared human acceptance is bound to the returned digest/revision/gap ids in a `constructionQualification:v1` packet. Only an unchanged second call whose packet is admissible returns `writeEligibility:"executable"`, `canWrite:true`, and a `writePlan` exactly equal to the reviewed rows. Declared approval is provenance, not identity authentication or a truth certificate. The detailed lifecycle packet stays in the MCP response/agent transcript; persisted truth remains the existing project competency body plus finalizer receipt, so past exact gap approval is not reconstructed after restart. Write relations only after every released concept row succeeds, then validate, compile, connect the source, and finalize project meaning. Detects FSD vs generic layout. |
| `infer_imports` | **R17** Walk TS/JS files plus root and `src`/`source`-layout Python packages and parse imports → file-level + module-level dependency evidence. **side effect 0**. Structured `coverage` names supported languages and extensions. If a root Cargo manifest is detected, it reports Rust `use`/`mod`/macro dependency scanning as unsupported; zero edges means only `no_supported_static_import_edges_observed`, never “this Rust repo has no dependencies.” Python support is deliberately static and bounded: it reads `import` / `from ... import`, package-relative and parenthesized multiline statements as text, marks imports nested under an explicit `TYPE_CHECKING` guard as type-only, ignores import-shaped docstring content, and never imports or executes repository code. Every file receipt carries `sourceRole` (`production|test|unknown`) and `importUsage` (`value|type_only|unknown`); explicit JS/TS type imports and Python `TYPE_CHECKING` imports are type-only, while `value` means “not explicit type-only syntax”, not proven runtime execution. Internal imports collapse to folder-prefixed module edges with `count`, `kindCounts`, whole-edge `sourceRoleCounts` / `importUsageCounts`, their joint `productValueCount`, and up to five exact file-edge `evidence` receipts (`evidenceLimited` says whether more exist). Non-source assets never become ontology endpoints, test filenames collapse to their production endpoint, and nested `sourceFolders` scopes retain repository-relative slug semantics. Unless `reconcile:false`, missing vault edges carry `rationale_review_required`, not `proposedAction`: import direction is source evidence, not a self-approving semantic dependency. When an implementation path is known, pass `{focusPath:"source/feature-manager.tsx"}` (or `reviewMode:"focus"`) before requesting full: Atlas returns exact incoming/outgoing file-edge receipts, counts, and a cursor in pages of at most 100 without requiring a vault. Focus output is bounded static source evidence, not runtime blast radius or semantic `depends_on`. Omit `reviewMode` for size-safe automatic delivery: an estimated full MCP result at or below 128 KiB preserves the complete response; a larger reconciled result returns exactly one compact `nextRelationReview:v1` packet plus a `delivery` receipt and stateless cursor. Set `{reviewMode:"next"}` to request that bounded packet explicitly. `{reviewMode:"full"}` preserves the complete shape, but a result over 128 KiB additionally requires `allowLargeResponse:true`; without that second confirmation Atlas returns the measured size and the bounded alternative instead of a multi-megabyte result. An oversized omitted call with `reconcile:false` or no loadable vault likewise fails with both recovery choices. Every compact candidate carries its own `absentEndpoints`; when one is missing, `nextCalls` is empty and `questionEligibility` is `blocked_missing_vault_endpoints`. `endpointModelling.analysisCall` refreshes evidence only and says explicitly that it creates no endpoint; `proposalValidation` names the complete `rootPath + proposal` contract and returns source-bound endpoint drafts whose kind and meaning remain human decisions; `resumeCall` reopens the queue only after an accepted plan is written. It never calls `get_concepts` / `relation_check` on a missing slug and never infers a business kind or definition from the path. Once an accepted endpoint plan is written, restart the queue and only then use the normal two-concept semantic review. When `productValueCount` is zero, keep test/type evidence visible but do not frame that import alone as a product `depends_on` approval question; require separate product meaning evidence. Otherwise inspect both concepts, explain why the meaning-level dependency holds, ask the user, then write one explicit `add_relation(..., why)` call. `index_project` explicitly confirms its complete internal import result so its existing plan semantics do not depend on the delivery default. |
| `index_project` | **R+** One read-only project ontology indexing checkpoint for large repos. Combines `analyze_repo_structure`, `infer_imports`, and `validate_vault` into counts, phases, validation status, and review actions. It preserves the full Rust `configurationEvidence` packet and import `coverage` boundary instead of hiding them behind counts. `plan.conceptDelta` separates raw candidates into existing, ambiguous-alias review, and genuinely new buckets. **side effect 0** — it never writes markdown. CLI `index --apply` is a fail-closed compatibility wrapper: it returns `approval_required` and writes 0 until the exact qualified MCP lifecycle returns an unchanged `writePlan`; inferred imports and Rust configuration predicates remain review-only and are never auto-promoted to `depends_on`. |
| `add_concept` | Creates a new `.md` node. Required: `slug`, `kind`, `title`. Optional: `domain`, `capabilities`, `elements`, `body`. **R14**: frontmatter is normalized per kind (project gets `domains/capabilities/elements: []`; capability gets `elements: []`; capability/element should set `domain` — missing extras come back in `warnings`). If an existing node already has the same title (normalized), a near-duplicate `warning` is added so the agent can `patch_concept` instead of forking a duplicate (the #1 growing-vault failure mode); batch `add_concepts` skips this scan for throughput. Graph arrays are canonicalized as sets (trimmed, deduped, sorted) on creation/import. Body defaults to a kind-specific starter only when omitted; an explicit empty string is preserved. Throws if the slug already exists. Changed writes return compact `postWriteMaintenance` so agents can immediately continue graph cleanup; the compact block preserves `operation:"maintenance_plan"`, `sideEffect:false`, `filters`, `limited`, cursor metadata, `byPhase` / `bySeverity` / `byKind` remaining-queue buckets, current-page next action pointers, and compact action rows with `score` and executable `proposedAction`. |
| `add_concepts` | **R+** Batch writer — accepts `{concepts: [{slug, kind, title, ...}, ...]}` (max 50), returns `{concepts: [{slug, ok: true, filePath, warnings?} | {slug, ok: false, error, errorCode?, ...repairFields}, ...]}` plus one compact `postWriteMaintenance` when at least one row changes the vault. Invalid-only batches return no row-level write metadata and no top-level `postWriteMaintenance`. Compact maintenance includes `byPhase` / `bySeverity` / `byKind` queue buckets, row `score`, executable `proposedAction`, and current-page next action pointers. Each row processed independently — existing-slug / invalid-kind / missing-required / non-object row shape / unknown row fields surface as `ok:false` rows whose `error` includes the `concepts[n]` row label; row failures also carry structured repair fields such as `errorCode`, `rowName`, `conflictSlug`, `firstSeenAt`, `receivedField`, `unknownFields`, `allowedFields`, and `receivedFields` when applicable. Single unknown-field rows include `receivedField` plus one-row `unknownFields`; multi unknown-field rows report every unknown field with nearest hints and `Received fields: ...`; the rest still land. Order preserved. Pre-checks duplicate slugs *within the input batch* and fails the later row with a `concepts[n] duplicate slug in input batch; first seen at concepts[m]` error plus structured `rowName` / `firstSeenAt`. A row whose normalized *title* matches an earlier landed row in the same batch still lands but carries a near-duplicate `warning` (patch the earlier node instead of forking the same concept) — no vault scan, in-batch comparison only. **No atomic rollback** — for all-or-nothing semantics use single `add_concept` calls. Use after `analyze_repo_structure` / `infer_imports` (or any bootstrap flow) when the agent has K accepted candidates. |
| `add_relation` | Adds an edge between two slugs. `type`: `depends_on` (→ dependencies), `relates`, `contains`, `describes`, `domains`, `capabilities`, `elements`, or `domain` (inline parent). `broader`/`is_a` is deliberately not in this enum; use the guarded `patch_concept` path linked above. **P6**: `why` (≤300자) is required for every new `depends_on` and optional for other relation types; it is stored with the edge in the **same write** under `relation_notes`. Existing legacy `depends_on` edges without a rationale remain readable and idempotent, but are `review_required` debt. 근거 없는 엣지는 마인드맵 선이지 온톨로지 주장이 아니다; 토폴로지 엣지 팝오버가 이 근거를 그대로 보여준다. Invalid relation `type` is rejected before endpoint slug resolution with a closest-value hint plus structured `valueName` / `receivedValue` / `suggestion` / `allowedValues`, and no `changed`, `alreadyExists`, or `postWriteMaintenance` write metadata. Direct slugs, unique tail aliases, and frontmatter `slug:` aliases are resolved to the canonical file slug before write. Array-backed types are stored as canonical sets (trimmed, deduped, sorted); `domain` is idempotent when already equal and otherwise refuses to replace an existing domain without `patch_concept`. **R11**: optional `expected_mtime` on the source slug for conflict detection. Changed writes return compact `postWriteMaintenance` with `byPhase` / `bySeverity` / `byKind` queue buckets, action `score`, executable `proposedAction`, and current-page next action pointers so agents can immediately continue graph cleanup. |
| `add_relations` | **R+** Batch edge writer — accepts `{relations: [{from, to, type, why?}, ...]}` (max 50). `type` is one of `depends_on`, `relates`, `contains`, `describes`, `domains`, `capabilities`, `elements`, or `domain`; `why` is required for each new `depends_on` row and optional otherwise, then stored atomically with the edge in `relation_notes`. Use it only for already-reviewed semantic edges. An `infer_imports.moduleEdge` is not accepted merely because an import exists: inspect its exact evidence, both concepts, and direction; supply semantic rationale and obtain human approval first. Rows remain independently idempotent and may partially fail; no atomic rollback. |
| `patch_concept` | Updates an existing node's frontmatter (per-key patch — `null` deletes optional keys) and/or body. Graph arrays patched through this tool must be clean string arrays and are canonicalized as sets (deduped, sorted); core scalar fields are strict too (`kind` must stay one of project/domain/capability/element/document, `domain`/frontmatter `slug` must be clean strings when present, and `body` must be a string). Use this when you need to *modify* a slug that `add_concept` would reject as duplicate. **R11**: optional `expected_mtime` for conflict detection — pass the `mtime` from `get_concept`; throws `VaultConflictError` if the file has been modified externally since you read it. Changed writes return compact `postWriteMaintenance` with `byPhase` / `bySeverity` / `byKind` queue buckets, action `score`, executable `proposedAction`, and current-page next action pointers. |
| `delete_concept` | **v0.4 ⚠ DESTRUCTIVE** Permanently deletes a node. Two-stage safety: ① without `confirm:true`, runs as a dry-run (with a backlinks preview); ② if backlinks exist, throws unless `force:true`. The response captures the deleted frontmatter + body so you can recover from mistakes. **R11**: optional `expected_mtime` for conflict detection. Confirmed deletes return compact `postWriteMaintenance` with `byPhase` / `bySeverity` / `byKind` queue buckets, action `score`, executable `proposedAction`, and current-page next action pointers. |
| `rename_concept` | **v0.7 ⚠ MULTI-FILE** Atomically renames a slug — moves the .md file, updates the moved file's `slug:` key, and rewrites every backlink (frontmatter array entries, inline string keys like `domain`, body links `[[oldSlug]]` / `(oldSlug.md)`). Tail-only references (`mcp-server` for `capabilities/mcp-server`) are also redirected. Without `confirm:true`, runs as a dry-run with a full update preview; each `backlinkUpdates.updates[]` row includes the referrer `slug`, `title`, changed frontmatter keys, and `bodyChanged`. Throws if `newSlug` already exists unless `overwrite:true` is passed. Replaces the manual loop of `find_backlinks` + N `patch_concept` calls. **R11**: optional `expected_mtime` for the source slug. Confirmed renames return compact `postWriteMaintenance` with `byPhase` / `bySeverity` / `byKind` queue buckets, action `score`, executable `proposedAction`, and current-page next action pointers. |
| `merge_concepts` | **v0.7 ⚠ DESTRUCTIVE MULTI-FILE** Folds `fromSlug` into `intoSlug` — every backlink to `fromSlug` is redirected, then `fromSlug.md` is deleted. The survivor keeps `intoSlug`'s UID and records the source UID plus prior absorbed identities in canonical `merged_uids`; prose and non-identity frontmatter are not auto-merged (use `patch_concept` after if you want to combine descriptions). Without `confirm:true`, runs as a dry-run; each `backlinkUpdates.updates[]` row includes the referrer `slug`, `title`, changed frontmatter keys, and `bodyChanged`. For confirmed writes, pass both `expected_mtime` from `fromSlug` and `expected_into_mtime` from `intoSlug` to prevent either concurrent edit from being overwritten. Confirmed merges return compact `postWriteMaintenance` with `byPhase` / `bySeverity` / `byKind` queue buckets, action `score`, executable `proposedAction`, and current-page next action pointers. |
| `absorb_document` | **Slice 0 ⚠ DESTRUCTIVE (source-file rewrite)** — the "absorption tool". Converts a CLAUDE.md/AGENTS.md-style markdown file into typed vault nodes so a tech lead's existing agent-instruction file stops needing dual maintenance. Splits the file by `##` sections; rule/policy/decision sections become `kind: document` nodes with a `role: policy` frontmatter extra, architecture/component sections are reported as element/capability *suggestions only* (never auto-written), and sections matching an injection-suspect pattern (Tier 1 — instruction-hijack phrasing, shell/SQL fragments) are excluded from absorption regardless of category. Without `confirm:true`, runs as a dry-run (classification plan only, no writes). The preview reports `outsideRepo`; if the canonical source path is outside `repoRoot`—including an inside-repo symlink that resolves outside—`canConfirm:false` until the caller explicitly supplies `allowOutsideRepo:true` after reviewing the absolute path. With `confirm:true`, absorbed sections are written, the source file is backed up to `<file>.pre-absorb.bak`, and rewritten into a slim pointer that reproduces every non-absorbed section verbatim. Throws instead of overwriting an existing backup. CLI equivalent: `ontology-atlas absorb <file...> [--write]`. Only ever reads a **local** markdown file — for wiki exports (Confluence/Notion/on-prem wikis) a separately-registered third-party MCP reads the page first and the result is saved as a local file before calling this tool; see the `/ontology-absorb-confluence` skill. |

All nine destructive tools (`git_snapshot`, relation remove/replace, rename,
reclassify, merge, delete, and absorb) return the same preview contract. A
valid dry-run has `previewReady:true`; `wouldChange` distinguishes a real
mutation from a no-op; `canConfirm` is true only when the exact reviewed call
can proceed; `blockedReasons[]` gives every remaining safety gate. Confirmed
responses reset the preview decision fields because they are no longer plans.

`add_concept` and `add_concepts` also accept an optional repository-relative
`path` and preserve it in frontmatter as implementation evidence. The same
path is checked by `validate_vault` against the configured repository root.

`query_ontology({operation:"cycles"})` keeps the slug path in each
`cycles[].nodes` array and also returns aligned `cycles[].nodeSummaries`
(`slug` / `kind` / `title` / `domain?`) so agents can read a dependency cycle
without issuing follow-up `get_concept` calls.

Read/query numeric options are intentionally strict. `tools/list` exposes the same
integer / minimum / maximum constraints that the runtime enforces for
`list_concepts.limit`, `find_neighbors.limit`, `find_path.maxHops`,
`query_concepts.limit`, `compile_ontology` pagination, and `query_ontology`
limit/depth/iteration/health controls, so MCP clients and agents can correct invalid
arguments before the tool call instead of relying on silent fallback. The
top-level `tools/call.arguments` value defaults to `{}` when omitted; null,
arrays, and scalar values are rejected by the MCP SDK or the server before tool
dispatch. Unknown top-level argument keys are rejected too, and `tools/list`
marks each input schema with `additionalProperties:false`, so typos like
`lmit` do not silently fall back to default behavior. Query limits above 500
and traversal caps above 20 are rejected instead of silently clamped by the
graph engine.
Unknown tool names fail closed too. The runtime keeps the `unknown_tool`
structured error code, adds the nearest tool-name hint when one is available
(for example `Did you mean "list_concepts"?`), and prints the allowed tool list
so an agent can repair a misspelled `tools/call.params.name` without an extra
`tools/list` round trip. The same repair data is present in
`structuredContent` as `receivedTool`, `suggestion`, and `allowedTools`, so MCP
clients do not need to parse the human-readable error text.
Unknown argument errors likewise include `toolName`, `receivedArgument`,
`unknownArguments`, `receivedArguments`, `suggestion`, and `allowedArguments`
when those fields apply, so single-argument and multi-argument typos can share
one structured repair path.
Row-level unknown field errors follow the same pattern: single-field errors
include both `receivedField` and a one-row `unknownFields` array, while
multi-field errors include every offending field plus nearest hints.
Invalid enum / filter / type values include the same structured repair shape
as `valueName`, `receivedValue`, `suggestion`, and `allowedValues`, so clients
can correct `operation:"overveiw"` without scraping the text form.
Missing node errors include `missingSlug`, `similarSlugs`, `recoveryTools`, and
optional `createTool`, so clients can choose between lookup, search, or
`add_concept` without parsing prose.
**Ask-to-Grow (R+)**: `get_concept` and `query_ontology({operation:"node_profile"})`
attach a `growthHint` (`{reason, suggestion, exampleCall}`) to the error's
`structuredContent` when the slug doesn't resolve — a did-you-mean near-slug
example, or an `add_concept` scaffold when no similar slug exists — derived
only from the real vault slug set, never invented. `find_path` (`found:false`),
`query_concepts` (`total:0`), and `find_evidence` (`matches:[]`) attach the
same `growthHint` shape directly on the (successful, non-error) response body,
so an unanswered question becomes an actionable vault-growth signal instead of
a dead end.
Slug conflict errors include `conflictSlug`, `recoveryTools`, and optional
`overwriteOption`, so clients can choose `patch_concept`, `rename_concept`, or
an explicit overwrite retry without scraping prose.
String-array options are strict too: relation filters such as
`find_neighbors.types` / `query_ontology.types`, `query_ontology.pattern`,
`maintenance_plan` filters, and analysis scan lists such as
`infer_imports.sourceFolders` / `ignore` reject non-string array items instead
of silently dropping them; blank, whitespace-padded, and null-byte items are
rejected at the MCP boundary as well. `list_concepts.kind` and `query_concepts`
validate `kind` values before scanning the vault, so `kind:"capabilty"` and
`kind=capabilty` fail with `capability` hints instead of returning empty result
sets. `query_concepts` also validates `has(...)` graph keys before scanning, so
`has(capabilties)` fails with a `capabilities` hint. `find_neighbors.types` is relation-type
enum validated before slug resolution, so `types:["depend_on"]` fails with a
`depends_on` hint instead of returning an empty neighborhood. `find_orphans.kind`
and `find_orphans.excludeKinds` are node-kind enum validated too, so
`kind:"capabilty"` fails with a `capability` hint instead of returning an empty
cleanup list. `maintenance_plan.phases` is additionally
limited to `validate` / `repair` / `link` / `materialize` / `review`, and
`maintenance_plan.severities` is limited to `fail` / `warn` / `info`, so typoed
agent work-queue filters cannot silently return an empty plan. `maintenance_plan.kinds`
is limited to `inspect_compile_issue` / `break_dependency_cycle` /
`canonicalize_graph_arrays` / `resolve_dangling_reference` /
`add_missing_relation` / `materialize_external_element` / `unassigned_node` /
`empty_domain` / `separate_evidence_from_concept` / `fold_bulk_siblings` /
`retire_unearned_node` / `capability_without_evidence` for the same reason.
`separate_evidence_from_concept` and `fold_bulk_siblings` come from the write-path
node-eligibility gate (2026-07-31 council) and only ever appear on a write response:
a path sitting in a meaning slot, and siblings a single machine batch created under
one parent. `capability_without_evidence` (2026-08-01 field trial, clarified
2026-08-02) is a capability with neither a canonical repo-relative `path:` entrypoint
nor an `elements:` relation to a real implementation-role node. A raw file path in
`elements:` is a category error, not a graph child. It is `review` / `info` and
**never blocks a write** (construction rule 5): it is raised once at creation by the
write gate and then continuously by the vault-wide scan until the capability points
at code or a real element concept.
`health` / `workspace_brief` / `agent_brief` relation filters expose the same enum schema for
`dependencyTypes` and `componentTypes` (`domains` / `domain` / `capabilities` /
`elements` / `dependencies` / `depends_on` / `relates` / `contains` /
`describes`), so clients can catch typos like `depend_on` before the call.
Scalar string options follow the same boundary across read and write tools:
slugs, repo paths, filters, titles, relation types, query targets, and cursor
ids reject blank, whitespace-padded, or null-byte values before graph
resolution, repo walking, or disk writes. `tools/list` exposes the same
`minLength` and pattern hints for those scalar strings and strict string-array
items so MCP clients can catch bad calls before sending them.
For `query_ontology({ operation: "relation_check" })`, relation `type` is
validated before endpoint slug resolution, so typoed values such as
`depend_on` still return the nearest-value hint even in empty or project-less
vaults where the requested endpoints do not exist. A clean `relation_check`
also returns `matchingEdges`, reverse-direction `inverseEdges`, nearby schema
patterns, and a `recommendation` decision (`skip_existing`, `review_inverse`,
`safe_to_add`, or `review_new_schema`). When the edge does not already exist it
includes a ready-to-run `proposedAction` for non-dependency relation types. A
new `depends_on` is different: schema compatibility is not meaning approval,
so it returns `proposedAction:null` plus `approvalGate.writeAllowed:false` and
requires an observable-ability explanation, semantic rationale, explicit human
approval, and nonblank `why` before the writer call.
Boolean options are also validated explicitly, including read/query flags and
destructive write safety switches such as `confirm`, `overwrite`, and `force`.
Write conflict guards are strict as well: every `expected_mtime` field must be
a non-negative finite number, so malformed values cannot silently disable the
concurrent-edit check.
Batch arrays expose the same runtime cap as schema too: `get_concepts.slugs`,
`get_concepts.uids`,
`add_concepts.concepts`, and `add_relations.relations` all advertise
`maxItems: 50`.
`query_ontology.targetOperation` also exposes the supported `query_plan`
targets as an enum so clients can offer valid choices instead of discovering
the subset through failed calls. The enum is sourced from the graph engine's
runtime allow-list, so schema and execution stay aligned when query support
changes. `query_ontology.operation` follows the same shared enum contract and
is rejected at the MCP boundary when omitted or unknown, instead of falling
through to an empty result. `query_plan` responses also include an `execution`
block with `shouldRun`, `nextStep`, `suggestedQuery`, and, when the plan should
be narrowed, a `saferQuery` the agent can run instead of guessing lower-cost
arguments. `centrality` plans use a PageRank-specific estimate with
`iterations`, resolved edge count, dangling node count, and `rankingWorkUnits`
instead of a generic aggregate scan, so coupling-audit agents can explain
ranking cost before running graph centrality. For `all_paths`, `limit` and
`searchBudget` are schema-advertised too, so agents can cap path enumeration
and inspect `evidence.status`, `evidence.pathsComplete`, `exhaustive`, and
`truncatedByBudget` before treating returned paths or `totalPaths` as complete
evidence.

## Interop — export to a standard graph format

The vault is markdown, but the graph it encodes is portable. `ontology-atlas
export` compiles the vault (the same deterministic `compile_ontology` artifact
an agent reads) and serializes it to a standard interchange format on **stdout**:

```bash
node $ATLAS/cli/src/index.mjs export [vault] --format jsonld    # RDF 1.1 JSON-LD (default)
node $ATLAS/cli/src/index.mjs export [vault] --format graphml   # XML graph (Gephi / Cytoscape)
node $ATLAS/cli/src/index.mjs export [vault] --format json      # raw compile artifact, unchanged
```

The payload goes to stdout and status to stderr, so it pipes cleanly into other
tools. Node identity is the stable `urn:uuid:<uid>`, used as both the JSON-LD
`@id` and the GraphML node id. The readable slug remains an explicit property,
and resolved edge endpoints are mapped from slug to the target UID URN. Edge
`via` keys become `oatlas:` predicates (JSON-LD) / a `via`
attribute (GraphML). The CLI and MCP serializer stay byte-identical through
`interop-format`, lock-stepped by
`tests/contract/interop-format.contract.test.ts`. The retired web ERD builder
is not an export surface.

### Loading recipes

```bash
# Gephi / Cytoscape — open the .graphml directly:
node $ATLAS/cli/src/index.mjs export docs/ontology --format graphml > atlas.graphml

# Neo4j — GraphML via APOC (apoc.import.graphml), from the browser or cypher-shell:
node $ATLAS/cli/src/index.mjs export docs/ontology --format graphml > /import/atlas.graphml
#   CALL apoc.import.graphml('atlas.graphml', {readLabels: true})

# NetworkX (Python):
#   import networkx as nx; G = nx.read_graphml('atlas.graphml')

# rdflib / any triplestore / Protégé — JSON-LD is RDF 1.1:
node $ATLAS/cli/src/index.mjs export docs/ontology --format jsonld > atlas.jsonld
#   import rdflib; g = rdflib.Graph(); g.parse('atlas.jsonld', format='json-ld')
```

### The interop contract (read this before wiring a pipeline)

- **An export is a snapshot, not a live link.** Re-run `export` to refresh.
- **`graphHash` is the version.** The `--format json` artifact carries the
  compiler's `graphHash`; identical hashes mean identical graphs. Key your
  downstream cache/diff on it.
- **Rename and reclassify preserve the URN.** They change the readable address
  while preserving `uid`, so already-emitted identity remains stable. Merge
  preserves the survivor URN and records absorbed UIDs in `merged_uids`.
- **Invalid identity fails closed.** Missing, malformed, or duplicate primary
  and merged UID claims abort compilation/export instead of emitting a partial
  graph or quietly deriving identity from a slug.
- **External / dangling refs are omitted.** An interop snapshot only emits
  edges whose endpoints are both real vault nodes; it never mints phantom
  nodes for unresolved element paths.

## Frontmatter shape per kind (R14)

When `add_concept` writes a new `.md`, the frontmatter is normalized by
`mcp/src/schema.mjs` so the AI agent and the CLI always emit the same shape.
Empty arrays are kept (not stripped) so a human can see the slot and fill it
later.

| kind | required | always emitted | strongly expected | optional |
|---|---|---|---|---|
| `project` | `uid`, `slug`, `kind`, `title` | `domains: []`, `capabilities: []`, `elements: []` | — | merge-owned `merged_uids`, `display`, `display_<locale>`, `description`, `status`, `dependencies`, `relates`, `created_by` |
| `domain` | `uid`, `slug`, `kind`, `title` | `capabilities: []` | — | merge-owned `merged_uids`, `display`, `display_<locale>`, `description`, `depends_on`, `relates`, `broader`, `created_by` |
| `capability` | `uid`, `slug`, `kind`, `title` | `elements: []` | `domain` | same as `domain`, plus `path` |
| `element` | `uid`, `slug`, `kind`, `title` | — | `domain` | same as `domain`, plus `path` |
| `document` | `uid`, `slug`, `kind`, `title` | — | — | merge-owned `merged_uids`, `display`, `display_<locale>`, `describes`, `relates`, `created_by` |

“Strongly expected” fields don’t throw — they come back in the response under
`warnings`, and the validator (`mcp:validate`) flags them with the
`missing-expected-field` issue code so users see them in the workbench banner
without breaking pre-existing vaults.

`uid` is different: it is a hard invariant for every `kind:` node, including
`vault-readme`. Missing/invalid UID, invalid `merged_uids`, and any primary or
merged UID collision are errors. Generic `patch_concept` cannot change `uid` or
edit `merged_uids`; only `merge_concepts` may extend identity history.

This is the vault format v2 breaking boundary. For a UID-less v1 vault, run
`pnpm vault:migrate 2026-08-02-add-node-uids --vault <dir>` from the source
checkout first (dry-run), then repeat with `--write`. The migration preserves
valid identities and rejects malformed or duplicate primary/merged claims
before the first file write.

### `created_by` — who authored the node (2026-07-31)

An **optional** field with exactly two shapes: `human`, or `agent:<name>`
(the agent name is the one the local activity log already records — the
`.ontology-atlas/agent-activity.json` heartbeat).

**Absence means unknown. It never means `human`.** Provenance is stamped at
write time by the path that proves the actor, and nothing derives it after the
fact — no backfill, no "no log entry ⇒ a person did it", no git blame (the
committer is a person even when an agent wrote the frontmatter). A node with
no `created_by` is a node whose origin nobody recorded, and the tools say so by
saying nothing. There is no validator warning for the missing field, because
its absence is not a defect.

Where the stamp comes from, per path:

| Path | Stamp |
|---|---|
| `add_concept` · `add_concepts` · `absorb_document` | `agent:<heartbeat agent>`, or `agent:unknown` when no heartbeat names it |
| The web workbench composer (`/ontology/studio`, direct save) | `human` |
| The in-app agent panel's **Apply** | `agent:<provider>` — the draft's author is the model; a person's approval click is not authorship |
| `ontology-atlas add` / `import` (CLI) | *nothing* — the CLI cannot prove who is at the keyboard |

`patch_concept` **preserves** an existing `created_by` and refuses to set one:
editing a node is not authoring it, and a field an agent could rewrite would be
a claim rather than a fact.

Read it back with `get_concept` (full frontmatter), and select on it with
`query_concepts` — this is what makes "show me only what a person wrote" a
single call:

```jsonc
query_concepts({ filter: "created_by=human" })
query_concepts({ filter: 'kind=capability AND created_by="agent:codex"' })
```

Quote any value containing `:` — the filter tokenizer reads bare words without
colons. Nodes with no stamp match neither side; that is what unknown means.

### `display` — the optional short-name override (2026-07-23)

Every kind also accepts an optional `display` field, right after `title` in
`preferredOrder`. It exists for nodes whose real `title` carries a long
parenthetical qualifier — e.g. `title: CLI Developer Entry (54 commands —
vault + MCP verify + ...)`. The topology canvas label, INDEX panel row, node
popover header, and full-detail header all render the *display name*, not
the raw `title`:

1. `display:` if set — takes precedence over everything.
2. Otherwise the part of `title` before its first ` (` — most long titles
   already follow "Short Name (long qualifier)", so this alone shortens them
   with zero authoring effort.
3. Otherwise `title` unchanged.

This derivation (`deriveDisplayTitle`, `src/shared/lib/derive-display-title.ts`)
is display-only — search and matching (`find_neighbors`, `matchOntologyNodes`,
the in-app palette) always match against the full `title`, so shortening the
label never narrows what a query can find. Most nodes never need to set
`display` explicitly; add it only when the automatic paren-split still leaves
a name too long or picks the wrong prefix.

### `display_<locale>` — per-locale display names (2026-07-24)

The same node can read natively in every language the vault serves. Pass
`labels` to `add_concept` / `add_concepts`, or set the keys directly with
`patch_concept`:

```jsonc
add_concept({
  slug: "domains/payment",
  kind: "domain",
  title: "결제",                       // stays the search/matching source
  labels: { ko: "결제", en: "Payments" } // → display_ko / display_en
})
```

The renderer resolves the screen locale at the insight boundary
(`use-ontology-insight.ts`): `display_<screen locale>` wins, then `display`,
then `title`. Nothing about search changes — matching is always against the
full `title`, so a localized label never narrows what a query can find.

**Fill every locale the vault serves.** A single-locale `labels` object comes
back as an advisory warning (`labels only has "en" — add the other locale …`)
because the missing side silently falls back to the raw `title` for those
readers. The in-app composer enforces the same rule for humans: the field for
the current screen language is required, and the other language is offered
right beside it.

### Element slug — flat only (R15's "two valid patterns" is retired)

A slug is the node's **name**, flat under its kind folder: `elements/<role-name>`
(`elements/jwt-token`, `elements/topology-map-v2`). The file's location lives in
`path:`, never in the slug. Path-style slugs (`elements/src/features/auth`) are
**rejected at every write door** (`add_concept` / `add_concepts` /
`rename_concept` / `reclassify_concept` / CLI `add`) by `flatSlugIssue()` in
`schema.mjs`.

Why the R15 stance ("pick flat or path-style per what the element is") was
overturned (2026-08-01, `docs/DECISIONS.md` 「슬러그는 평평한 식별자다」): node
identity is resolved by the slug *tail* on three surfaces — the web derivation,
the unique-tail slug lookup this server documents for `get_concept`, and deep
links. Path-style slugs collide the moment two files share a basename, and the
graph silently merges distinct nodes. Measured on the regenerated dogfood vault:
`elements/src/{entities,views,widgets}/docs-vault` rendered as **one** node and
four relations disappeared from the screen. "The path is self-documenting" is
what `path:` is for — a path is evidence of a concept, not the concept (the same
sentence the 2026-07-31 construction rules apply to titles and `elements:`
references).

A vault's **own** folder nesting outside the schema kind folders
(`services/auth/api.md` in an imported vault) is not this gate's business —
local-first means the user's disk layout is respected; real tail collisions
there surface as the compiler's `ambiguous-alias` warning.

The same schema is mirrored at `cli/src/lib/schema.mjs`. A contract test
(`tests/contract/vault-schema.contract.test.ts`) keeps the two in lock-step;
if you change one, mirror the other.

## Local verification (UX-3)

### One-line verify CLI

```bash
cd mcp && npm install
# From the repo root, prefer the CLI wrapper for the dogfood vault:
pnpm dogfood:compile
pnpm dogfood:compile-fix
pnpm test:dogfood:script-refs
pnpm test:dogfood:compile-fix
pnpm dogfood:health
pnpm dogfood:agent
pnpm dogfood:agent-graph-db-pack
pnpm dogfood:graph-db
pnpm dogfood:agent-setup-gate
pnpm dogfood:agent-fallbacks
pnpm dogfood:brief
pnpm dogfood:growth
pnpm dogfood:maintenance
pnpm dogfood:status
pnpm test:dogfood:graph-db
pnpm dogfood:verify
pnpm cli:mcp-verify docs/ontology --timeout-ms 15000
# Inside mcp/, the package-local verifier has the same smoke scope:
OATLAS_VAULT=../docs/ontology npm run verify
npm run verify -- ../docs/ontology
npm run verify -- --vault ../docs/ontology
npm run verify -- ../docs/ontology --timeout-ms 15000
npm run verify -- --help
pnpm --filter ./mcp verify -- ../docs/ontology --timeout-ms 15000
pnpm --filter ./mcp verify -- --help
# Larger/slower vaults can raise the child-process wait window:
OATLAS_VERIFY_TIMEOUT_MS=15000 OATLAS_VAULT=../docs/ontology npm run verify
```

When both are present, an explicit positional vault or `--vault` argument takes
precedence over `OATLAS_VAULT`.
`npm run verify -- --help` and `pnpm --filter ./mcp verify -- --help` print the same first-contact scope; the direct verifier normalizes the leading pnpm separator before parsing flags. Filtered package invocations run from `mcp/`, so the repo dogfood vault is `../docs/ontology`; missing vault paths fail before server startup and empty vault folders fail before later read smokes with that recovery hint.
The scope includes
direct read smokes for `list_concepts` project probe / `get_concept` /
`get_concepts` / `find_evidence` / `find_backlinks` / `query_concepts` /
limited `query_concepts` / `analyze_repo_structure` / `infer_imports` /
`index_project` / `find_neighbors` / `find_path` / `find_orphans`,
strict unknown-tool / unknown-argument / invalid-enum rejection with structured
`errorCode` values (`unknown_tool` / `unknown_argument` / `invalid_arguments`), enum-validated
`maintenance_plan` filters, stale `patch_concept.expected_mtime` rejection with
`vault_conflict`, batch row isolation for non-object row shape,
unknown row field inputs with single-field structured repair plus all offending fields reported, reader/writer 50-row batch cap
rejection with `invalid_arguments`, invalid `add_relations` type hints, and duplicate
`add_concepts` slugs with `concepts[n]` / `relations[n]` error labels, and
maintenance_plan cursor handling (ready page +
missing `afterActionId`): the ready page must keep `cursor.found=true`,
`cursor.reason=null`, and the missing cursor still reports `cursor.found=false`,
reason, empty page, `cursor.nextAfterActionId=null`, and `cursor.hasMore=false`.
Ready pages also verify cursor metadata: `nextAfterActionId` must match the last
returned action, and `hasMore` must match the remaining page state.
When the ready page has at least one action, verify sends a valid
`afterActionId` resume request from the first returned action id and fails if
the resumed page repeats that cursor action or `remainingActions` does not
advance.
Ready pages also verify `nextExecutableAction` /
`nextReviewAction` point only at the first executable/review action in the
current returned page, including the action id, executable flag, `phase`, `kind`,
and `severity`.
This help path does not start the MCP server.

A successful run looks like this. **The transcript states no vault-derived
counts, slugs, or graph hashes** — those change the moment anyone adds a node,
so a number printed here would be wrong by the next commit and nobody would
notice. `<N>` / `<slug>` mark the places your own run fills in; the numbers that
*are* written out (tool inventory, batch caps, smoke coverage) are fixed by the
verifier itself and change only when the tool contract changes.

```

[ontology-atlas-mcp verify]

· step 1 — parser smoke test
✓ result: 7 passed, 0 failed
· step 2 — server boot + tools/list + list_concepts/project probe/get_concept/get_concepts/find_evidence/find_backlinks/query_concepts/limited query_concepts/analyze_repo_structure/infer_imports/index_project/find_neighbors/find_path/find_orphans/list_kinds/destructive dry-runs (vault=/path/to/docs/ontology, timeout=20000ms)
✓ initialize OK — server ontology-atlas-mcp@0.13.0
✓ initialize instructions — tool inventory plus first-contact safety and recovery guidance present
✓ tools/list 35/35 (35/35 titled; 19/19 read; 16/16 write; 9/9 destructive; 3/3 idempotent; 35/35 local-only) — absorb_document · add_concept · add_concepts · add_relation · add_relations · analyze_repo_structure · compile_ontology · connect_project_source · connection_info · delete_concept · disconnect_project_source · finalize_project_meaning · find_backlinks · find_evidence · find_neighbors · find_orphans · find_path · get_concept · get_concepts · git_history · git_snapshot · git_status · index_project · infer_imports · list_concepts · list_kinds · merge_concepts · patch_concept · query_concepts · query_ontology · reclassify_concept · remove_relation · rename_concept · replace_relation · validate_vault
✓ tools/list inventory names — missing/extra/duplicate/invalid checks passed
✓ tools/list schema contract — strict arguments + annotations + graph-query enums + graph kind enums/descriptions + write relation enums + health tuning + post-write maintenance + project-meaning receipt/assessment schemas
✓ strict arguments — unknown tool argument rejected at runtime
✓ strict arguments — multiple unknown tool arguments reported together
✓ strict tool names — unknown tool rejected with closest-name hint
✓ add_concepts — non-object, single/multi unknown-field repair, Received fields, duplicate-slug rows isolated with input indexes, and invalid-only batches return no write metadata
✓ add_relations — non-object, single/multi unknown-field repair, Received fields, invalid-type rows isolated with input indexes and closest-value hints, and invalid-only batches return no write metadata
✓ batch caps — get_concepts/add_concepts/add_relations reject 51 rows with invalid_arguments
✓ destructive dry-runs — rename_concept · merge_concepts · delete_concept previewReady/canConfirm contract without write-maintenance
✓ absorb_document dry-run — outside-repo temp fixture explicitly opted in, classified (policy + architecture sections), and not written
✓ patch_concept conflict guard — stale expected_mtime rejected with vault_conflict
✓ strict enums — invalid query operation rejected with closest-value hint
✓ strict maintenance filters — invalid phase/severity/kind rejected at runtime (phases=validate/repair/link/materialize/review; severities=fail/warn/info; kinds=inspect_compile_issue/break_dependency_cycle/canonicalize_graph_arrays/resolve_dangling_reference/add_missing_relation/materialize_external_element/unassigned_node/empty_domain/separate_evidence_from_concept/fold_bulk_siblings/retire_unearned_node)
✓ strict relation filters — invalid dependencyTypes rejected with closest-value hint
✓ strict find_neighbors filters — invalid relation types rejected before slug resolution with closest-value hint
✓ strict find_orphans filters — invalid kind/excludeKinds rejected with closest-value hints
✓ strict list_concepts filters — invalid kind rejected with closest-value hint
✓ strict query_concepts filters — invalid kind/has-key rejected with closest-value hints
✓ strict relation_check — invalid type rejected before endpoint resolution with closest-value hint and structured repair
✓ strict add_relation — invalid type rejected before endpoint resolution with structured repair and no write metadata
✓ strict graph filters — invalid match_nodes.kind/sort, match_edges.type, and recommend_relations.kind rejected with narrowed diagnostics
✓ strict graph edge kind filters — invalid match_edges.fromKind/toKind rejected with closest-value hints
✓ maintenance cursor — missing afterActionId reported (afterActionId not found in filtered maintenance actions; phase none; severity none; kind none; executable none; review none)
✓ maintenance cursor — ready page stable (<N> remaining actions; phase none; severity none; kind none; executable none; review none)
· maintenance cursor — resume skipped (ready page has no actions)
✓ list_concepts — vault total <N> nodes (vaultRoot /path/to/docs/ontology)
✓ get_concept — <project slug> (<N> outgoing edges)
✓ get_concepts — 2 ok rows, 1 partial row
✓ find_evidence — <N> evidence results for "project"
✓ find_backlinks — <project slug> (<N> backlinks)
✓ query_concepts — <N> query results / <N> total query results
✓ query_concepts limited — 1 query result / <N> total query results (limited true)
✓ analyze_repo_structure — <framework> (<N> domain candidates, <N> capability candidates, <N> element candidates)
✓ infer_imports — <N> files scanned, <N> module edges (<from>-><to> x<N> (static:<N>/dynamic:<N>), …, +<N> more)
✓ index_project — <N> concept candidates, <N> import relations, validation 0 problem files
✓ find_neighbors — <smoke slug> (<N>/<N> edges, limited false)
✓ find_path — <smoke slug> → <project slug> (<N> hops, <N> edges)
✓ find_orphans — 0 orphans (root/sentinel defaults excluded)
✓ list_kinds — <N> nodes (capability:<N>, domain:<N>, element:<N>, project:<N>, vault-readme:<N>)
✓ validate_vault — <N> files, 0 problem files
✓ project probe — 1 project node
✓ workspace_brief — healthy (<N> nodes, <N> next actions, <N> health checks, growth actions:<N> external:<N> ignoredExternal:<N>)
✓ agent_brief — healthy (ready 100/100, 3 entrypoints, 5 first calls, 6 graph DB pack items, 4 playbooks, 3 write guardrails, 3 result contracts)
✓ workspace_brief_tuned — healthy (<N> nodes, <N> next actions, <N> health checks, growth actions:<N> external:<N> ignoredExternal:<N>; dependencyTypes=dependencies; componentTypes=domains/domain/capabilities/dependencies; nodeLimit=3)
· workspace_brief_tuned non-blocking advisory nextActions — components/health_check:info:<N> - The scoped ontology graph has disconnected actionable islands.
✓ health — healthy (issues:0, unresolved:0, cycles:0, <N> checks: compile_issues:pass:0, unresolved_edges:pass:0, dependency_cycles:pass:0, relation_recommendations:pass:0, components:pass:<N>, +<N> more)
✓ health_tuned — healthy (issues:0, unresolved:0, cycles:0, <N> checks: compile_issues:pass:0, unresolved_edges:pass:0, dependency_cycles:pass:0, relation_recommendations:pass:0, components:info:<N>, +<N> more; dependencyTypes=dependencies; componentTypes=domains/domain/capabilities/dependencies)
· health_tuned non-blocking advisory checks — components:info:<N> - The scoped ontology graph has disconnected actionable islands.
✓ compile_ontology — graph <graph hash> (<N> nodes, <N> edges, issues 0)
✓ compile_ontology page — 1/<N> nodes, 1/<N> edges
✓ compile_ontology indexes — out <N>, in <N>, edgeById <N>, aliases <N>, edges <N>/<N>/<N>
✓ overview — graph <graph hash> (<N> nodes, <N> edges, hubs <N>)
✓ overview query_plan — aggregate_scan (medium, nodes <N>, edges <N>)
✓ project_map query_plan — aggregate_scan (medium, nodes <N>, edges <N>)
✓ neighbors — <smoke slug> (<N>/<N> edges, limited false)
✓ path — <smoke slug> → <project slug> (<N> hops, <N> edges)
✓ all_paths — <smoke slug> → <project slug> (<N>/<N> paths, budget 1000, expanded <N>, exhaustive true, evidence partial)
✓ project_scope — <project slug> (<N> nodes, internalEdges <N>)
✓ read census consistency — <N> nodes across list_kinds/list_concepts/compile_ontology/overview, <N> kinds
✓ structuredContent — direct 16/16, write 5/5 (batch row-isolation 2/2, batch no-write metadata 2/2, destructive dry-run 3/3), maintenance 2/2 (resume skipped: no actions), graph 13/13

All passed. Register `.mcp.json` with your MCP client and restart to use the
verified runtime inventory.

```

On failure, it tells you which step blocked progress and prints a diagnostic message. The
verify path exercises and gates the same first-contact graph diagnosis an agent should run:
`tools/list`, `list_concepts`, a project-node `list_concepts` probe,
`get_concept`, `get_concepts`, `find_evidence`, `find_backlinks`,
`query_concepts`, limited `query_concepts`, `analyze_repo_structure`,
`infer_imports`, `index_project`, `find_neighbors`, `find_path`, `find_orphans`,
`list_kinds`, `validate_vault`,
`query_ontology({operation:"workspace_brief"})`, tuned
`query_ontology({operation:"workspace_brief"})`,
`query_ontology({operation:"health"})`, and tuned
`query_ontology({operation:"health"})`, plus `compile_ontology({summary:true})`
and paginated `compile_ontology({nodesLimit:1, edgesLimit:1})`,
`compile_ontology({nodesLimit:1, edgesLimit:1, includeIndexes:true})`,
`query_ontology({operation:"overview"})`, and
`query_ontology({operation:"query_plan", targetOperation:"overview"})` /
`query_ontology({operation:"query_plan", targetOperation:"project_map"})`,
plus actual `query_ontology({operation:"neighbors"})`,
`query_ontology({operation:"path"})`, and
`query_ontology({operation:"all_paths"})`, and
`query_ontology({operation:"project_scope"})` smoke calls.
The indexed compile smoke verifies index shape, count alignment, edge membership,
known-slug references, and resolved/external/unresolved edge breakdowns.
It also requires every exercised direct read, write row-isolation smoke,
destructive dry-run smoke, maintenance cursor, and
`query_ontology` graph-query response to include `structuredContent`, and
compares that payload with the text JSON payload, so agents can consume MCP
results without reparsing text. Successful verify output summarizes the
direct-read, write, maintenance-cursor, and graph-query `structuredContent` coverage
that was enforced in the run.
Destructive dry-run smoke calls `rename_concept`, `merge_concepts`, and
`delete_concept` against live vault slugs without writing, and fails if the
preview is missing, its `previewReady` / `canConfirm` / `wouldChange` /
`blockedReasons` decision fields contradict one another, or it includes
`changed` or `postWriteMaintenance`. The independent absorption smoke marks its
temporary outside-repository fixture with `allowOutsideRepo:true`, then verifies
the same decision contract without confirming a write.
The `tools/list` gate also checks that every tool rejects unknown arguments via
`additionalProperties:false`, that every tool exposes the expected
`annotations.title` display name, `annotations.readOnlyHint` read/write split,
`annotations.destructiveHint` for destructive multi-file/delete tools, and
`annotations.openWorldHint:false` for the local vault-only boundary. It also checks `annotations.idempotentHint`
for retry-safe relation writers (`add_relation` / `add_relations`), and that required `query_ontology.operation` plus
the `query_ontology.operation` / `query_ontology.targetOperation` enums match
the graph engine's runtime allow-lists. It also checks the `list_kinds`
`outputSchema` and matching `structuredContent` census payload, the `validate_vault`
`outputSchema` and matching `structuredContent` health payload, the `list_concepts`
`outputSchema` and matching `structuredContent` node table payload, the `get_concept`
`outputSchema` for single-node detail payloads, the `get_concepts`
`outputSchema` and matching `structuredContent` batch payload, the `find_evidence`
`outputSchema` and matching `structuredContent` evidence-match payload, the `find_backlinks`
`outputSchema` and matching `structuredContent` backlink-match payload, the `find_neighbors`
`outputSchema` and matching `structuredContent` local-neighborhood payload, the `find_path`
`outputSchema` and matching `structuredContent` shortest-path payload, the `find_orphans`
`outputSchema` and matching `structuredContent` orphan-list payload, the `query_concepts`
`outputSchema` and matching `structuredContent` typed-filter payload, the `compile_ontology`
`outputSchema` and matching `structuredContent` graph-summary / full-artifact payload, the `analyze_repo_structure`
`outputSchema` and matching `structuredContent` bootstrap-candidate payload, the `infer_imports`
`outputSchema` and matching `structuredContent` import-graph payload, the `add_concept`,
`add_relation`, and `patch_concept` single writer `outputSchema` contracts, the `add_concepts`
and `add_relations` batch writer `outputSchema` row contracts, the `rename_concept`,
`merge_concepts`, and `delete_concept` destructive writer dry-run/confirm `outputSchema`
contracts, plus the shared four-field destructive preview schema on all nine
destructive tools and `absorb_document.allowOutsideRepo`, the installed batch
input schemas for the same 50-row cap used by `get_concepts`, `add_concepts`,
and `add_relations` at runtime, the `find_orphans.kind` / `find_orphans.excludeKinds`
node-kind enum schemas and root/sentinel default description, plus write-safety schemas for
`expected_mtime` conflict guards, destructive-tool `confirm` dry-run switches,
`rename_concept.overwrite`, and `delete_concept.force`. It also verifies write
tool descriptions keep compact `postWriteMaintenance` bucket summaries
(`byPhase` / `bySeverity` / `byKind`), action `score`, executable
`proposedAction`, and current-page next action pointer guidance, so
installed MCP clients can infer cleanup priority and next write intent from
`tools/list` alone.
The `initialize.instructions` gate fails if first-contact guidance loses the
read-only diagnosis flow, `expected_mtime`, `rename_concept` existing
`newSlug` / `overwrite: true` safety, or `delete_concept.force` / dangling
referrers safety. It also gates strict-input typo recovery guidance, including
unknown argument rejection plus nearest argument/value hints such as
`Did you mean "limit"?` and `Did you mean "overview"?`. Unknown-argument
errors also include `Received arguments: ...` so an agent can repair the exact
submitted key set instead of guessing from allowed fields alone. Invalid enum
errors expose `valueName`, `receivedValue`, `suggestion`, and `allowedValues`
in `structuredContent` for the same reason. Missing node errors expose
`missingSlug`, `similarSlugs`, `recoveryTools`, and optional `createTool`.
Slug conflict errors expose `conflictSlug`, `recoveryTools`, and optional
`overwriteOption`.
Batch repair
guidance is gated as well: duplicate `add_concepts` input slugs must surface
`concepts[n] duplicate slug in input batch; first seen at concepts[m]` in
first-contact instructions, so an agent knows which later row to remove or
rename before retrying. Maintenance work-queue
guidance is gated too: `initialize.instructions` must mention enum-validated
`maintenance_plan` filters, ready cursor pages with `cursor.found=true` plus
`cursor.reason=null`, and unknown `afterActionId` cursor misses with
`cursor.found=false` plus `cursor.reason`.
The dogfood walk reuses the same initialize-instruction gate, so the live
agent simulation fails when first-contact guidance loses the read-only flow,
strict input hints, or relation-filter enum guidance.
The verify path also makes runtime negative calls with `list_concepts.lmit`,
`list_concepts.lmit` plus `list_concepts.summry`,
`query_ontology.operation="overveiw"`, typoed `maintenance_plan.phases`, and
typoed `maintenance_plan.severities` / `maintenance_plan.kinds`,
and fails unless the server rejects them with the closest argument/value hint,
reports multiple unknown tool arguments together, or returns the allowed
maintenance filter enum. Successful verify output prints the
accepted `phases` / `severities` / `kinds` enum lists beside the strict-filter
runtime smoke, so installed logs show which work-queue contract was tested.
It also calls `add_concepts` and `add_relations` with non-object rows,
unknown row fields, an invalid `add_relations` type, and duplicate `add_concepts` slugs, and fails unless those
inputs return row-level `ok:false` results whose errors include the failing
input index, all offending unknown fields, and closest-value hints for invalid relation types, instead of a
top-level tool error, without `postWriteMaintenance`.
The single-row `add_relation` negative smoke uses missing endpoints plus a
typoed relation type and must fail on the type enum before slug resolution, so
installed logs prove the failed write stayed preflight-only.
It also calls
`maintenance_plan.afterActionId="maint_missing"` and fails unless the response
reports `cursor.found=false`, the cursor miss reason, zero remaining actions,
`cursor.nextAfterActionId=null`, `cursor.hasMore=false`, and no next actions. A companion ready-page smoke calls `maintenance_plan`
without `afterActionId` and fails unless the response keeps the stable cursor
shape, including `cursor.found=true`, explicit `cursor.reason=null`,
`startIndex=0`, `remainingActions`, cursor `nextAfterActionId`/`hasMore`
alignment, and next-action pointers. Those pointers
must match the current page action `id`, `executable`, `phase`, `kind`, and
`severity`. Both cursor
smokes also validate the maintenance summary counts (`totalActions`,
`filteredActions`, `remainingActions`, `executableActions`, `reviewActions`)
and their count relationships, plus the `byPhase` / `bySeverity` / `byKind`
bucket totals against `remainingActions`, so installed verify catches
work-queue drift before an agent follows stale cleanup guidance. Successful
verify logs print the same bucket summary and current-page executable/review
next-action summary so agents can see the next cleanup shape without re-parsing
the JSON payload.
`project_scope` is a hard gate when the vault has a `kind: project` node. The
verify path probes `kind: project` directly before graph smoke, so containment
checks are not skipped just because the project node was outside the first
`list_concepts` sample. The probe also verifies that returned rows are
`kind: project` and that its total matches `list_kinds.byKind.project`. Valid project-less vaults skip that one
containment-specific check while still gating `neighbors` and `path`. Empty
vault folders fail immediately after the `list_concepts` census with a
populated-vault recovery hint, so the verifier does not report a green MCP
wiring check against the wrong folder. The `path` smoke also validates hop/edge alignment, so an installed
package cannot report a usable path when the edge payload no longer explains the
hop sequence.
`get_concepts` reuses up to two slugs from `list_concepts` plus one missing slug
so batch success rows and partial rows are verified during installation checks. `list_concepts` vault warnings,
`list_kinds` / `compile_ontology` / `overview`
census shape/count mismatches, `validate_vault` problem files, failing health checks, or fail-severity
`workspace_brief.nextActions` fail the command; advisory `needs_attention` states still print so starter vaults can
verify before cleanup. Missing or malformed first-contact diagnosis payloads
such as top-level `status`, `workspace_brief.nextActions`,
`workspace_brief.health.checks`, `health.checks`, tuned `workspace_brief.health.checks`, and tuned `health.checks` also fail the command instead of being treated as clean; top-level diagnosis `status` must be `healthy` or `needs_attention`, every
`workspace_brief.nextActions` row must include non-empty `id` and `kind` plus
`severity` in `info` / `warn` / `fail`, and every health check row must include
non-empty `id` plus `status` in `pass` / `warn` / `fail` / `info`; optional
`count` fields must be non-negative integers before they are printed. When
`workspace_brief.nextActions[].sample` includes executable examples, installed
verify also checks `add_missing_relations` samples are `add_relation` calls with
`from` / `to` / `type`, and `materialize_external_elements` samples are
`add_concept` calls for `kind:"element"`, while `resolve_dangling_references`
samples must keep the `resolve_dangling_reference` row shape with score and reason.
Non-blocking `workspace_brief.nextActions` are printed as a short
advisory list with action label, severity, optional count, and message. The
`workspace_brief` / `workspace_brief_tuned` success lines include the
`workspace_brief.health.checks` count plus `growth actions/external/ignoredExternal`
counts. Tuned diagnosis lines also print
`dependencyTypes=dependencies; componentTypes=domains/domain/capabilities/dependencies`
so scoped dependency and project/domain/capability connectivity warnings are
not confused with the full-graph component count. The
`health` / `health_tuned` lines include the `issues/unresolved/cycles/checks`
summary plus check `id:status:count` coverage that the verify gate validated. The default wait window is 8 seconds; set
`OATLAS_VERIFY_TIMEOUT_MS` to a positive integer millisecond value if your vault
is large or on a slow filesystem. Real timeout failures suggest the same
retry shape, and invalid timeout values fail before the server starts and print
the received value plus a concrete retry example, for example
`npm run verify -- --timeout-ms 15000`. When the verifier is called with an
explicit vault, timeout retry hints preserve that vault, for example
`npm run verify -- --vault <path> --timeout-ms 15000`; the repo-root CLI wrapper
uses the same pattern with `ontology-atlas mcp-verify --vault <path>
--timeout-ms 15000`. After timeout the verifier sends `SIGTERM` and then
`SIGKILL`; set `OATLAS_VERIFY_KILL_GRACE_MS=N` only when that post-timeout cleanup
window needs explicit tuning. Server startup failures before `initialize` keep stderr
diagnostics and include the same vault-preserving retry example. If the server
terminates by signal before first-contact completes, verify reports that signal
separately from timeout and startup failures.

### Manual verification (reference)

```bash
# parser smoke
node src/parser.test.mjs

# Real server over stdin/stdout JSON-RPC
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_concepts","arguments":{"limit":5}}}' \
  | OATLAS_VAULT=../docs/ontology node src/index.js
```

## First call after registering with Claude Code (sample prompt)

After you add `.mcp.json` / `.codex/config.toml` and restart the agent, try the following with your LLM:

> **First exploration — confirm the vault's ontology is visible**
> 1. Call `mcp__ontology-atlas__list_kinds` to confirm the kind census.
> 2. Call `mcp__ontology-atlas__list_concepts` to list every node in the vault.
> 3. Call `get_concept({ slug: "project" })` to see the root node's frontmatter and neighbors.
> 4. Call `find_neighbors({ slug: "capabilities/mcp-server" })` to inspect the local graph around that capability.
> 5. Call `validate_vault({})` to check frontmatter and graph-reference integrity before writing.
> 6. Call `query_ontology({ operation: "agent_brief", project: "project-slug" })` when you want a project-scoped Claude Code/Codex handoff: readiness, categorical fail-closed `meaningAssessment`, `businessOntologyLens` for the business-first outcome → domain → capability → element read order, graph entrypoints, recommended MCP calls, `graphDbQueryPack` (`facets` / `schema` / `match_nodes` / `match_edges` / `domain_matrix` / `centrality` / `all_paths` / `explain_relation` plus `business_questions` outcome / domain-boundary / capability-claim node scans / implementation-evidence edge scans with `query_plan` gates), `graph_traversal` (`schema` / `all_paths` / `pattern_walk` / `project_map`), `traversalStrategy` (`plan_before_enumeration` / `bounded_path_evidence` / `containment_cross_check`) for performance-aware traversal, write guardrails, `relationDecisionGuide` for relation preflight decisions, `resultContracts` that require `all_paths` callers to report completeness fields and `match_nodes` / `match_edges` callers to report `totalMatches`, `limited`, and `followUp` details before treating scan rows as evidence, and read-first write policy in one response. Use `query_ontology({ operation: "workspace_brief" })` when you only need the first-contact graph diagnosis.
> 7. Call `query_ontology({ operation: "overview", limit: 5 })` to confirm graph-query summaries work without fetching the full compile artifact.
> 8. Call `query_ontology({ operation: "query_plan", targetOperation: "overview" })` and `query_ontology({ operation: "query_plan", targetOperation: "project_map" })` before heavier graph exploration so the agent sees the cost/index contract across more than one operation.

If those read-only calls respond cleanly, the agent can see the vault and its
graph health. Once an agent starts *committing* its analysis of your codebase
through the server's verified runtime inventory, the human + AI co-authoring
loop is officially open.

## Design principles

- **stdin/stdout JSON-RPC** — Claude Code spawns the server as a child process. stdout is *protocol-only*; logs go to stderr.
- **Synchronous fs** — MCP call frequency is low enough that async overhead isn't worth it.
- **Frontmatter preservation** — `add_relation` keeps the existing frontmatter intact and only patches the relevant array key (idempotent — duplicates respond with `alreadyExists: true`).
- **Vault-node sandbox** — every ontology `slug` write is vault-relative.
  `absorb_document` is the sole source-file rewrite exception: it backs up the
  source first, defaults to the repository boundary, resolves symlinks before
  checking that boundary, and requires `allowOutsideRepo:true` for an external
  canonical path.

## Status

- 0.12.0 current safety contract — all nine destructive tools expose
  `previewReady` / `canConfirm` / `wouldChange` / `blockedReasons`; external or
  symlink-escaped `absorb_document` confirmation requires
  `allowOutsideRepo:true`.
- Slice 0 (PRODUCT-PLAN-2026-07.md) — 25 tools. Added `absorb_document` — converts a CLAUDE.md/AGENTS.md-style markdown file into typed `document`/`role: policy` vault nodes (dry-run by default, `confirm:true` to write), reports architecture/component sections as suggestions only, and flags injection-suspect sections (Tier 1) for exclusion. CLI equivalent: `ontology-atlas absorb`.
- 0.10.0 — 23 tools. Added `get_concepts`, `add_concepts`, `add_relations`, `validate_vault`, `find_neighbors`, `compile_ontology`, and `query_ontology` (`neighbors` / `path` / `all_paths` / `query_plan` with executable run/narrow advice / `centrality` / `communities` / `similar_nodes` / `explain_relation` / `reachability` / `pattern_walk` / `impact` / `blast_radius` / `subgraph` / `overview` / `schema` / `facets` / `match_nodes` / `match_edges` / `node_profile` / `domain_profile` / `domain_matrix` / `project_scope` / `project_map` / `relation_check` / `components` / `lineage` / `containment_tree` / `cycles` / `topological_order` / `recommend_relations` / `growth_plan` / `maintenance_plan` / `agent_brief` / `workspace_brief` / `health`); current split was 15 read + 8 write in that release.
- 0.7.1 — 16 tools. Added `instructions` field on initialize response — Claude Code / Cursor see kind hierarchy + workflow + write-tool dry-run pattern + `expected_mtime` conflict guard guidance on connect, no per-session trial-and-error.
- Current initialize instructions also surface destructive-write safety: `rename_concept` refuses an existing `newSlug` unless `overwrite: true`, and `delete_concept` needs `force: true` only after accepting dangling referrers.
- Current initialize instructions also state that tool schemas are strict, unknown arguments are rejected with a nearest-argument hint, invalid enum values surface a nearest-value hint when possible, row-level repair fields include `rowName` / `receivedField` / `unknownFields` / `allowedFields` / `receivedFields` / `firstSeenAt`, `add_relations` unknown type row errors include a closest-value hint such as `Did you mean "depends_on"?`, and `add_concepts` duplicate input slugs report `concepts[n] duplicate slug in input batch; first seen at concepts[m]`, so typo and batch repair are explicit at first contact.
- Runtime `unknown_tool` errors include the closest tool-name hint, such as `Did you mean "list_concepts"?`, plus the allowed tool list.
- 0.7.0 — 14 tools (8 read + 6 write). Added `rename_concept` and `merge_concepts` (graph-level write — atomic backlink redirect across all referrers).
- 0.6.0 — 12 tools (8 read + 4 write). Added `query_concepts` (typed filter DSL).
- 0.5.0 — 7 read + 4 write. Added `find_orphans`.
- 0.4.0 — 10 tools (6 read + 4 write). Added `delete_concept` (dry-run + backlinks guard).
- 0.3.0 — 9 tools. Added `find_path` (BFS) and `list_kinds` (census).
- 0.2.0 — 7 tools.
- 0.1.0 — 5 tools.

## Troubleshooting

- **Tools don't show up**: Restart the agent. Validate `.mcp.json` syntax with `jq . .mcp.json`; for Codex, inspect `.codex/config.toml` or `codex mcp list`.
- **Vault appears empty**: Try an absolute path for `OATLAS_VAULT`, or run `pwd` to confirm the actual working directory.
- **`Doc already exists`**: `add_concept` won't overwrite an existing file. Edit the file directly, or use `patch_concept` to update frontmatter or body in place.
