---
title: Architecture
tags: [architecture, infra, overview]
doc_type: authority
status: current
area: architecture
---

# Architecture

> 2026-07-27 update — the current architecture is a local-first, git-backed
> **meaning layer**: a folder of markdown files that records what each part of
> the product is, who owns it, what it depends on, and what proves it. People
> and AI coding agents read and write that same folder. Round 10 permanently
> removed every login and cloud-data screen. In today's route model, reading and
> contextual writing happen together on Topology, ACP writes pause in the same
> conversation for human review. The old `/ontology/studio`, `/ontology/edit`
> and `/ontology/insights` URLs only translate old links.
> Earlier cloud and retired-workbench design notes are in `docs/archive/`.

## High-level shape

```
┌────────────────────────────────────────────────────────┐
│ User                                                    │
│ ├─ /                       who is asking decides —     │
│ │                          gateway face in a plain     │
│ │                          browser, map or first run   │
│ │                          in the installed app        │
│ ├─ /topology               map + contextual write     │
│ ├─ /architecture           harness: setup ·           │
│ │                          architecture                │
│ ├─ /docs                   exact-document compatibility │
│ ├─ /library                sources + wiki + ontology     │
│ │                          + collections               │
│ ├─ /automations            ontology reviews + document │
│ │                          rounds + run history        │
│ ├─ /ontology               thin redirect → /topology   │
│ ├─ /ontology/edit          compatibility redirect      │
│ ├─ /ontology/studio        compatibility → topology    │
│ ├─ /ontology/insights      compatibility → map         │
│ ├─ /git                    vault Git workbench         │
│ ├─ /changes                source change briefing      │
│ ├─ /work-status            worktrees and the agent     │
│ │                          sessions holding them       │
│ ├─ /planning               selected project documents  │
│ ├─ /agents                 agents · MCP, two tabs      │
│ ├─ /mcp                    compatibility → /agents      │
│ ├─ /projects               project list                │
│ ├─ /project/fallback       project detail + editor     │
│ ├─ /download               gateway as an explicit link │
│ ├─ /sample                 read-only sample map        │
│ └─ /guide · /changelog     gateway reading (vault md)  │
├────────────────────────────────────────────────────────┤
│ App layer                                               │
│ ├─ Vite 8 + TanStack Router (file routes)              │
│ ├─ use-intl /[locale]/ (en, ko, ja, zh)                │
│ ├─ static folders: app (embedded) + site (prerendered) │
│ ├─ Tauri shell (the installed local workbench)          │
│ └─ TaxonomyProvider · ToastProvider · MotionProvider   │
├────────────────────────────────────────────────────────┤
│ Data sources (mode-aware)                               │
│ ├─ vault           Tauri native bridge → user disk      │
│ │                  (`src/entities/vault-session/`)     │
│ └─ no folder       the app's "no folder loaded" state  │
│                    (first run, restore, folder switch) │
└────────────────────────────────────────────────────────┘

       ↑ stdio JSON-RPC

┌────────────────────────────────────────────────────────┐
│ MCP server (mcp/, app version)                          │
│ ├─ read tools     connection/git proof · list/get/find ·│
│ │                  compile_ontology · query_ontology ·  │
│ │                  analyze_repo_structure · infer_imports│
│ │                  inspect_architecture                 │
│ └─ write tools    add_concepts · add_relations ·        │
│                    remove/replace relation · patch ·    │
│                    reclassify · delete/rename/merge ·   │
│                    absorb_document · git_snapshot ·     │
│                    finalize_project_meaning             │
│                                                         │
│ AI agent (Claude Code, Cursor, …) reads/writes the     │
│ same vault directory the user picked in /docs.         │
│ compile_ontology builds the deterministic artifact;     │
│ query_ontology answers graph-database-like questions    │
│ over that artifact without introducing a server DB.     │
└────────────────────────────────────────────────────────┘
```

There is no backend, no server database, no login provider. The user's markdown
folder — called the **vault** everywhere in this repo — is the single source of
truth. The app and the MCP server (used by the AI agent) read and write that
same folder. `cli/` holds one command, `node <checkout>/cli init`, which
scaffolds a vault and wires the checkout's MCP server into it; every other
read and write goes through the MCP server.

### MCP server modules (2026-09-12)

`mcp/src/index.js` is wiring: the two request handlers, one switch that routes a
tool name, and the transport. The public surface — every tool name, description,
schema and annotation — is `mcp/src/server/registry.mjs`, which lists the
per-family definitions in `server/tool-definitions/`, with their schema
fragments in `server/tool-schemas/` (one file per subject) and the `initialize` instructions in
`server/instructions.mjs`. Handlers live in `mcp/src/tools/` by workflow: reads,
git, the compiled graph, vault validation, repo analysis, project source,
concept writes, relation writes, the destructive lifecycle, and absorb, with
node identity in `tools/vault-nodes.mjs`, post-write maintenance in
`tools/result-attachments.mjs`, the concept and relation writes with their
refusals in `tools/writes/` and the agent-brief scope and meaning-readiness
facts in `tools/agent-brief/`. The full table is in
[`mcp/README.md`](../mcp/README.md#source-layout).

`scripts/records/check-decision-record.mjs` watches `server/registry.mjs` and `server/tool-definitions/`
alongside the entry point, because that is where a public-contract change now lands.

### Runtime module ownership

The public entrypoints remain stable while internal modules own narrower work:

| Entrypoint | Internal responsibilities |
|---|---|
| `src/views/home/ui/HomePage.tsx` | Composes typed domain controllers and surface components. `home/model/use-topology-*` owns graph projection, route/index navigation, authoring, source actions, selection, keyboard/tour state, and review actions; ACP hooks own startup and session orchestration. `TopologyCommandChrome`, `TopologyCanvasSurface`, `TopologyIndexSlot`, `TopologyInspectorSurfaces`, `TopologyAgentDock`, and overlay components own their respective JSX. |
| `src/widgets/ontology-map/ui/loop/use-topology-loop.ts` | Wires camera, world, realm, interaction, and presentation state to their lifecycle hooks. Ordered frame stages own dome projection (Neural's view), world motion, physics/camera, clusters, realms, reveal, visual state, and rendering; the light stage (`light/`) prepares before the presentation stage and renders after it on its own WebGL2 canvas, which draws light only, in Flat, for an event; Neural's stage (`neural-gl/`) hands the frame's `NeuralFrame` to a three.js painter loaded on first entry to Neural, or leaves it to the canvas painter. The frame scheduler owns request/cancel, idle/yield decisions, and context recovery. Stage factories capture stable dependencies once per effect and reuse frame result objects. Viewport lifecycle and opt-in instrumentation remain separate. |
| `src/widgets/ontology-map/dial/` | The Flat dial hosts the Flat overview, whose full map `flat-graph/` paints through `DialScene.graph`: the dial model and its `domain_matrix`-equal counts, rings by dependents, order and spatial memory, layout, links and stubs, labels, ledger, placement, fit, picking and the light source; `frame/` turns the world-space scene into pooled marks per frame and paints them. It owns Flat's paint only with no realm, lens, edge (`frame/frame.ts`); otherwise the Flat pass draws on the dial's positions. |
| `src/widgets/ontology-map/flat-graph/` | The full Flat map as an attention-lit force graph: deterministic ForceAtlas2 layout (`layout.ts`), in-session memory settled once per read (`scene.ts`), attention and its crossfade (`attention.ts`), name admission per zoom step (`names.ts`, its parts in `names/`: the sides a name may take, title blocks, lit-line and zoom-step geometry, candidate order and the admission itself), and the frame painter with pooled marks (`frame.ts`, its parts in `frame/`: shared frame state, star placement and pushes, name planning, the plan, paint and probes). The dial's world, picking and probes host it through `DialScene.graph`; scoped realms still use `dial/branches/`. |
| `src/widgets/ontology-map/ui/OntologyTreeMap.tsx` | The 3D view, a canvas of its own beside the hex board and outside the flat engine's loop. `model/tree-view/` turns nodes and edges into a preorder tree with bounded fan-out (`tree-model.ts`), places it once per graph (`tree-layout.ts`), fits one scale to the shape the tree sweeps through a turn (`tree-camera.ts`), cuts each frame to a mark budget nearest first (`tree-detail.ts`), and places names (`tree-names.ts`); `tree-view/tree-paint.ts` paints the frame from `tokens/read-tree-tokens.ts`; `ui/tree-view/` owns the pose, input, keyboard and the frame loop, which runs only while something changes. |
| `mcp/src/rust-feature-evidence.mjs` | Keeps the evidence entrypoint stable. `rust-feature-evidence/collect.mjs` owns bounded Cargo/workspace reads, source inventory and evidence receipts; `attributes.mjs` interprets literal Rust `cfg` and `cfg_attr` attributes without filesystem access. |
| `mcp/src/ontology-engine.mjs` | Composes public query methods. `artifact-context.mjs` builds indexes; `context-operations.mjs` owns graph lookups; planner, traversal, selection, scope, maintenance, brief, and health modules own their query families; `selection/` and `traversal/` split those families by the question they answer, each wired from `ontology-engine.mjs`, with the pure rules (filters, cycle search, domain classification, grouping) in `*-rules.mjs` beside them. Dependencies between families are explicit named functions. Dispatch, vocabulary, validation, result shaping, and response formatting are separate owners. |
| `mcp/src/vault/` | The vault's disk layer, grouped by what it owns: `documents/` reads documents (`slug-paths.mjs` confines every slug to the vault root, `document-cache.mjs` is the parse cache), `graph/` holds the edge keys and reference queries (`relation-refs.mjs` owns the edge keys, `graph-queries.mjs` answers reference queries), `writes/` is the single write path (`eligibility-gate.mjs` holds the gate's session state, `atomic-writes.mjs` owns torn-write and conflict safety, `doc-writes.mjs` is the single document write point, and `backlink-rewrite.mjs` rewrites references after a rename, merge or reclassify), and `sidecar/` keeps the files beside the documents (the `.ontology-atlas/` folder, the activity log, the map analysis record, `.ontology-atlasignore`). `absorb.mjs` plans a document absorption. Importers name the owning file; there is no barrel. |
| `mcp/scripts/verify.mjs` + `verify/` | The entry owns argument parsing at load, the parser smoke, the server session, the gates, the phase order and the summary. `verify/cli.mjs` parses flags and env; `requests/` owns which JSON-RPC requests are sent; `tools-list/` owns the tools/list inventory and schema contract, one file per tool family; `checks/` return a failure string and never log; `phases/` log and never parse JSON-RPC. |
| `src/views/automations/ui/AutomationsPage.tsx` | Owns lane and selected-schedule navigation. `AutomationScheduleRow` displays timing/status and targets the runner's existing actions; `AutomationRunHistory` owns latest/older result presentation; the Documents lane draws the `round-ledger` widget below the list once a document pass has run. Scheduling and execution authority remain in Library rounds. |

These modules preserve the existing React lifecycle, frame order, query result
ordering, and error contracts. The MCP package's explicit file inventory includes
every engine module so source, bundled, and installed callers use the same code.

### Agent instruction ownership

Atlas has several instruction channels, each with a different runtime boundary:

| Channel | Instruction owner | Delivery and scope |
|---|---|---|
| Vault conversation | `src/features/vault-agent/model/system-prompt.ts` (`buildSystemPrompt`) | `use-vault-agent.ts` passes the assembled text to the provider as `system`; `AgentPromptText` displays that same value. This agent reads the vault and proposes changes for review. |
| Local wiki Compile | `src/features/vault-agent/model/compile/compile-system-prompt.ts` (`buildCompileSystemPrompt`) | `use-local-compile.ts` supplies the turn-specific system text for source reading and wiki proposals. This is a separate task from ontology construction. |
| ACP coding agent | `src/features/acp-session/model/runtime-wiring/vault-handoff-prompt.ts` (`vaultHandoffPrompt`) | `acp-client.ts` supplies `_meta.systemPrompt.append` on the Claude adapter path. This augments that agent's own instructions; it does not replace them or establish universal ACP support. |
| External MCP client | `mcp/src/server/instructions.mjs` | `server/instance.mjs` attaches the registry's instructions to the MCP initialization response. The receiving host controls their inclusion and placement in model context. |

The shared meta-model block in `mcp/src/construction/construction-rules.mjs` and the vault
conversation prompt is checked by `tests/contract/mcp/ontology-meta-model.contract.test.ts`.
Prompt parity proves consistent guidance, not semantic correctness or obedience.
Although `buildSystemPrompt` accepts optional owner instructions, the current
`VaultAgentPanel` passes `projectInstructions: null`; its file-name constant
does not establish a working custom-instructions loader.

The public app/website brand is **Ontology Atlas**. The macOS app bundle,
bundle identifier, and DMG assets use the Ontology Atlas identity, while the
repo, init command, and MCP package remain under `ontology-atlas`, so product
naming does not imply a backend, Firebase data dependency, or package rename.

Atlas answers graph-database questions by computing the answer in memory when
asked. It keeps no second source of truth. The installed app's derived index
(below) only spares re-reading files that have not changed and makes every
document searchable. `compile_ontology` reads the frontmatter
(the `key: value` block at the top of each `.md` file) and builds one graph file
in memory — the same vault always produces byte-identical output, which is what
"deterministic" means here. `query_ontology` runs its graph operations over that
file, and write tools save confirmed changes back into the markdown.

### Derived index (installed app)

`src-tauri/crates/vault-index` keeps one SQLite file per vault, `search.sqlite`,
under `<OS cache dir>/dev.jinan.ontology-atlas/vault-index/<hash of the
canonical vault path>/`, opened only by the app. It is a full-text index of
every Markdown file: paths, stamps, and each document's words with their
positions, so a document's text can be pieced back together from it. Anyone
who can read the user account's cache folder can read those words; Settings
says so beside the switch. Every row carries the stamp of the file it came from (modified time, size, and
change time: Unix `ctime`, NTFS and ReFS `ChangeTime`) and is used only while
that stamp still matches; a file
modified within two seconds of its row is compared by SHA-256 instead. The
stamp counts only on a volume whose file system moves the change time on every
write, named by `statfs` or `GetVolumeInformation`: APFS, HFS+, NTFS, ReFS,
ext2/3/4, btrfs, XFS and tmpfs, and only for a file on the root's own device
(Unix device number, Windows volume serial number). Anywhere else (FAT and
exFAT, where macOS reports the modified time as the change time, network and
unknown file systems, and any volume mounted inside the vault) the file is
compared by SHA-256 on each update and each search hit,
which on a 10,000-file exFAT image took a reopen from 23 ms to 575 ms. A
derived index holds only what can be recomputed from vault files: no user state,
edits, approvals or drafts. It lives in the OS cache directory, never in the
vault or Git, is private to the user account, and never leaves the computer;
with it off the app still opens and edits every vault. The crate never
interprets frontmatter: parsing, the graph and validation stay in the
TypeScript and MCP code that already own them, and graph queries stay in
memory.

The crate decides what it reads: only `.md` files under the canonical vault
root, reached through real folders, never through a symlink or a component
that starts with a dot. It deletes only folders that carry its marker file and
hold nothing but index file names, and a release build ignores
`OATLAS_INDEX_DIR`. A query is read up to 512 bytes and 16 terms. A folder's
index is deleted when the folder is taken off the app's folder list, when the
folder is gone, or after fourteen days unopened; Delete in Settings removes the
open folder's index, or every folder's when none is open.

The folder watcher, the slow poll and vault open each start a stamp pass on a
background thread. A schema version that differs in either direction
discards the index and rebuilds it; a damaged file is set aside and
rebuilt while the session continues from the vault files. The file uses WAL,
so the app and another process can read at the same time. Settings › Privacy ·
data shows the size, deletes the index and can turn it off.

Beside it, `rows.sqlite` holds per file and per producer what a program
computed from that file, so a reopen reads and derives only the files that
changed. The app's producer keeps what `buildMdEntry` derives, the document's
spine (`md-entry.ts`): parsed frontmatter, diagnostics, title, the slugs of the
pages it links to, its first paragraph when short (the definition preview) and,
for a concept, its finding codes; headings, excerpt and word count are read from the
file when a surface shows them, and the rest of the body is not kept. Values are
DEFLATE-compressed JSON. The producer's name, `app-entry/<hash>`, is a hash of
`md-entry.ts`, every module it
loads and the versions of the packages they import, made at build time
(`scripts/lib/row-producer.mjs`), so a build whose parser or derive code
changed never reads an older build's rows; the dev server has no name and keeps
no rows. On open the
full build sends its walked Markdown paths in read order
(`vault_index_rows_get`); Rust stats each file and hands back a value only while
the file's stamp equals the row's and the file was modified more than two
seconds before that version was first seen. The build reads and derives the
rest with the same code as before and writes those rows back behind itself
(`vault_index_rows_put`), where each is refused unless its file still has the
stamp the lookup saw and was older than two seconds then, so no row pairs a
value with a later version of its file. A file whose stamp does not count
(on FAT, exFAT, a network or unknown file system, or another volume mounted
inside the vault, as above) gets no row and is read from disk, since there a same-size rewrite whose modified time was
put back would look unchanged. A batch takes the writer lock
the search build and Delete take, and carries how many deletions of that
folder (or of every folder) the app had made when its lookup ran; after a
Delete or switch-off it writes nothing and never recreates the folder. Another
producer version, a missing,
older, newer or damaged file, and the switch turned off all leave the build
reading every file. Settings lists these fields beside the switch with the
search words; Delete, turning the switch off and the folder sweep remove both
files together. Searching is one rule shared by indexing and queries: words of
alphabetic scripts stay whole and lowercased, and Hangul, kana and CJK runs
become overlapping pairs, so a Korean term is found inside a word that carries
a particle. The palette reads only the hit files to show their matching lines.

Search by meaning keeps a third file beside them, `vectors.sqlite`
(`vault-index::vectors`): each Markdown file is split into passages and each
distinct passage text holds one int8 vector, keyed by the text's SHA-256, so a
rename sends nothing again and a stopped build resumes where it was. Like the
index it is derived and rebuildable, never canonical: a search returns only
passages their file still holds, and Delete, switching the index off and the
folder sweep remove it with the index files. Nothing is created until the person
sets it up for a folder; the WebView keeps that choice (the built-in model or a
loopback Ollama model) and whether they stopped the job as a preference and
sends it with every command. The built-in model, bge-m3, is downloaded once from
huggingface.co into the app's data folder and never loads into the app's
process: the app starts its own executable with `--embed-worker` and speaks to
it over a pipe. The app ends the worker two minutes after the last question,
or when a job ends and no question came in that time; the worker also exits
when its stdin closes, and after five idle minutes of its own. The WebView reaches it through `vault_vectors_probe`, `_status`,
`_prepare`, `_stop`, `_warm`, `_search`, `_delete`, `_delete_model` and
`_reveal_model`
(`src-tauri/src/vault/vectors/commands.rs`, bridged by
`src/shared/lib/vault-folder/vault-vectors/tauri-vault-vectors.ts`), and follows each folder's
job through the `vault-vectors-status` event.
One store in `src/features/vault-vectors/` keeps each folder's last status for
the Wiki desk; the shell's adapter `src/app/providers/MeaningRunSeat.tsx`
listens to it, words a failure with the desk's own sentence, and copies the
open folder's job into the long-work store (`src/features/work-run/`) as a
`meaning` run beside the checks it holds, so
`work-run` never imports `vault-vectors` and the card and rail ring redraw at
most four times a second.

Architecture intent uses a parallel, non-ontology record. A Markdown file with
`architecture_schema: architecture-profile/v1` has no `kind:` and therefore
never becomes a Map node. It declares pattern axes, scoped implementation roles,
path mappings, allowed dependency direction, and reviewed evidence. MCP
`inspect_architecture` derives the usage-qualified
observed import model from the connected source and compare it with that
declaration. Optional `dependency_usages` says which known import usages the
dependency rules govern; missing v1 fields preserve value plus type-only
behaviour, while unclassified usage can never be declared away. Their
`architectureConformance:v1` result is `conforms`, `violated`, or `unknown`;
unsupported languages, incomplete scans, unknown usages, unmapped edges,
unruled edges, and empty roles prevent a false green result. Each conformance
evaluation and app role traversal lazily reuses compiled path patterns only
within that call; paths and classification results are not cached. Compilation
coalesces adjacent directory-wildcard tokens without changing declared pattern
text or the glob dialect. Patterns with overlapping unbounded wildcards use
a UTF-16 state program with one reusable byte buffer per compiled pattern;
ordinary patterns retain the regex path. State-program matching takes
O(path length × program length) work and O(program length) retained working
space, without recursive backtracking or path-result caches. The
`/architecture?view=architecture` Living Blueprint
renders the declared model and copies the typed pre/post agent plan, while source
analysis remains in MCP rather than being duplicated into Markdown. It moved off the default
address on 2026-09-19: the layer ladder is the product's architecture, which a harness *regulates*
(maintainability · architecture fitness · behaviour), and not a part of the harness itself.

In the installed app the default `?view=overview` (Setup, `docs/records/decisions/2026-11-15-harness-follows-the-agent-loop-c52ae218-e053-4eb6-8d45-84efad283ff1.md`) lists the connected
repository's harness in the order of the agent's loop: Context (instruction files, rules, skills by
directory, subagents, MCP and config files, ignore files, context hooks), Guardrails (permission
rules, blocking hooks) and Verification (hooks after an action, check scripts, Git hooks, CI
workflows). `buildHarnessSetup` (`src/widgets/harness-setup/model/harness-setup.ts`) regroups the
scan and is the only place problems are decided: a missing hook script, or Codex's `AGENTS.md`
over its default limit; `hookEventStep` in `entities/agent-files` is the one hook-event table.
`HarnessSetupView` and `HarnessSetupSection` render it with a tool filter and a detail beside the
lists. They live in `src/widgets/harness-setup/` so the download page's harness film can play the
same screen on an example repository; `reveal={false}` keeps that copy from scrolling or focusing
its host page. `?view=guides`, `?view=structure`, `?view=coverage` and `?view=sensors` are rewritten to it.
It reads files only, through the installed app's read-only harness commands
(`src-tauri/src/harness_source/`), which serve only the connected repository's allowlisted harness
files, and a refused read is named instead of drawing a shorter list.
The retired `/ontology/insights?tab=harness` address replaces itself with
`/architecture/?view=overview`, keeping the other flags and adding no history entry. The measured/null availability contract, scanner, join, and write
authority remain unchanged; declaration counts, discovered tests, and execution evidence are not merged.

## Surface contract — the app and the website

Decided 2026-07-27 and narrowed 2026-11-27 (`docs/DECISIONS.md`: Atlas opens a
folder only in the installed app); the working rule agents load is
`.claude/rules/surfaces.md`.

**One codebase, one build.** The macOS app is not a port. Tauri loads the very
same Vite bundle into a WebView. Nothing is forked, and nothing should be.
`pnpm build` writes two folders from it: `out/` is the website, with the
public pages prerendered, and `src-tauri/target/desktop-frontend`
(`frontendDist`) is the installed app's. The app folder leaves out what the
website alone serves: the files in `scripts/lib/web/website-only-files.mjs`
(the gateway's videos and screenshots, Open Graph images, `llms*.txt`, the
sitemap and `robots.txt`) and the code of the `/download` and `/sample` pages,
since the app's router is built from `src/app/app-route-tree.gen.ts`, the route
tree generated without those two files (`vite.config.ts`). Tauri compiles that
folder into the executable, and the updater ships the executable whole, so each
of those megabytes was paid on every install and update. A path the folder
lacks is answered with the root `index.html`, and its router renders the
not-found screen: `/en/download/` in the app is an address no screen owns.
`desktop-frontend-paths.contract.test.ts` holds every route in the list below
to the app's tree unless the app has no way to it.
The macOS shell also owns one Rust-native, state-free menu-bar item that opens
the existing main window or quits. It creates no second window, background
service, webview tray permission, or website equivalent.

**One inbound address.** Since 2026-09-07 the installed app registers the
`ontology-atlas://` URL scheme (`tauri-plugin-deep-link`, declared in
`src-tauri/tauri.conf.json` under `plugins.deep-link.desktop.schemes`) so that a
vendor page's "Add to Ontology Atlas" button can reach it. It answers exactly one
grammar — `ontology-atlas://mcp?install=<base64 server config>` — and
`src-tauri/src/app_shell/deep_link.rs` refuses everything else: any other destination, any
query key besides `install`, a payload with a character outside the URL-safe set,
or one over 4 KiB. A refused URL is logged with its reason and dropped; it never
moves the window, and the URL itself is never written to the log. On success the
window is brought forward and sent to `/<locale>/mcp/?tab=connectors&install=…`,
the same address the app reads, where `parseMcpInstallLink` pre-fills the
add-connector form and stops: nothing is written, nothing is enabled, and the
person still presses Add. The deep-link plugin is registered immediately after
`tauri-plugin-single-instance`, so a second press while the app is running routes
the window that exists rather than starting a rival one. The 2026-08-24 council
that rejected this scheme is overturned only for this door; uid addresses, node
addresses and any URL that writes or executes remain out, and
`tests/contract/security/url-scheme-one-door.contract.test.ts` is what keeps them out.

**One page policy for both.** A static host sends no headers, so the production build
carries its Content-Security-Policy as a meta tag in `index.html`
(`src/shared/config/site/web-content-security-policy.ts`): no remote image, connection,
plugin, `<base>` or form target, and scripts from the page's own origin (inline ones
included until the build's inline scripts are hashed). The app loads the same HTML
under its own policy (`tauri.conf.json`), and both apply there, so the page policy allows
everything the app's does, IPC included; `tests/contract/security/web-csp-parity.contract.test.ts`
holds the two together. `pnpm dev` gets no meta, because refresh needs `eval`.

**What each surface is for.** The app is where the vault lives day to day: the
place a person reads the map, judges it, and connects their AI agents. It is
the only place a folder is opened. The website introduces Atlas and hands over
the app. It serves the **gateway**
(`/` and `/download`), the guide, the changelog and `/sample`, a read-only map
of a sample online store drawn by the app's map renderer from a file made at
build time, so there is no server and nothing a visitor does is kept. The
gateway stays because every visitor recorded so far arrived through the web.

Any other address opened in a plain browser answers with one page, "Ontology
Atlas runs in the installed app", with the download page and the sample map.
Each app route's HTML carries two faces, the workbench and that page. The boot
script (`src/i18n/boot-script.ts`, inlined by `scripts/vite/atlas-index-html.ts`) runs first in the head
and sets `data-shell="desktop"` on `<html>` when `window.isTauri` is true; CSS
keyed on that mark paints exactly one face, so a plain browser, with scripts or
without, never paints the rail and the app never paints the page meant for
browsers. A browser that kept a remembered folder from the old browser
workbench has its `demo-kv` database deleted at its next visit; the folder on
disk is not touched.

**The app and the website differ in a small set of modules — we call them
bridges — not in the router.** Each bridge is the single file that calls a
desktop-only ability. The canonical roster is the bridge table in
`.claude/rules/surfaces.md`; the ones that shape this document are:

| Bridge | Module | What it does in the app |
|---|---|---|
| Vault absolute path | `src/shared/lib/vault-folder/native-vault/tauri-vault-handle.ts` | Returns an object shaped like a folder handle over native commands, and carries the absolute path |
| Git | `src/shared/lib/git/tauri-git.ts` | Runs Git for the vault's history and snapshots |
| Gray-area evidence | `src/shared/lib/project-source/tauri-gray-area.ts`, `src-tauri/src/gray_area.rs` | Inspects the bound code root |
| Harness source read | `src/shared/lib/project-source/tauri-harness-source.ts`, `src-tauri/src/harness_source/` | Reads the dot directories where a harness lives |
| Keychain | `src/shared/lib/llm-connection/tauri-secrets.ts` | Keeps API keys in the OS credential store |
| LLM calls | `src/shared/lib/llm-connection/tauri-llm.ts` | Sends a call from Rust, after the audit line is written |
| In-app agent runtime (ACP) | `src/shared/lib/agent-chat/tauri-acp.ts` | Spawns the agent process |
| Connector discovery | `src/shared/lib/connectors/tauri-connectors.ts` | Reads the person's own agent config files; adding one by hand also works |
| Connector secrets | `src/shared/lib/connectors/tauri-connector-secrets.ts` | Keeps a connector token in the keychain |

The gray-area reader is a fixed local read-only MCP client, using only the bundled
executable and a source root resolved from one existing project binding. Native
no-follow handles capture a bounded immutable input: implementation-parent code,
resolver configs, file/directory identities and presence/absence metadata. An
unlinked read-only descriptor carries it to the child; the child receives a
private empty filesystem namespace and cannot independently read the original
source through the import scanner. The server labels this as supplied input,
not a disk observation or meaning acceptance. Native collection/recheck owns
that evidence. Source excerpts are native reads, not an analysis tool call. The
inspector previews that folder before an explicit inspection, then binds the
result to source bytes, complete Markdown bytes, graph identity and the binding.
It exposes no generic tool or command invoker and changes no ontology record.

Native excerpt selectors preserve literal path components (no normalization of
repeated or dot separators) and retain the source-evidence reader's sensitive-name,
source-type and binary refusal policy. Resolver-only inputs may be bound for
inference without becoming excerpts. Group scope uses O(VE) containment closure
within the 500-node/edge cap; dependency traversal is O(V + E), a two-hop BFS. The inspector uses
the bottom navigation's rem breakpoint for map-sheet clearance, including enlarged
browser text; global map tokens use pixel breakpoints.

`features/gray-area` owns candidate interpretation and session folding; Home owns
selection and the existing map path/conversation actions. An investigation action
prepares an editable draft and does not enforce a new ACP execution mode.

Every bridge follows one convention: `getInvoke()` returns `null` when
`isTauri()` is false. Only a test browser without the faked app runtime
(`installDesktopRailRuntime`) or `pnpm dev` ever sees that answer, because a
plain browser never reaches the screens that call a bridge; no screen draws an
explanatory card for it. New desktop abilities attach the same way. They do not
get a website version added later — that is a decision we have made, not a task
waiting in a backlog.

**What "the same data" actually guarantees.** The folder on disk is the single
source of truth. The app opens it through an absolute path, and MCP agents read
the same folder through the filesystem. They cannot end up reading the same
file differently, because one contract test runs the same file through all
three parsers (app, MCP, scripts) and the schema is written in exactly one
place, `mcp/src/schema.mjs`. Anything that has to pass between programs is
written **inside the vault** as plain text —
`.ontology-atlas/activity.jsonl`, `map-analysis.jsonl` (the MCP server's
record of each map analysis, counts only, which the map's chip reads) and
`llm-audit.jsonl`. That is the rule this
contract sets: *anything shared between programs lives in the vault folder.*
The derived index is not shared state: it is a cache each program validates
against the files for itself, and deleting it changes no answer. If
two people (or an agent and a person) edit at once,
`patch_concept(expected_mtime)` stops the second write from silently erasing the
first.

Three things are deliberately **not** shared. The "last opened vault" record:
the app keeps it in its own IndexedDB (carrying the folder's absolute path). API keys: they live in the operating
system's credential store, app only. UI preferences: localStorage. API keys and
personal display settings are not part of the shared model, so they stay out of
the vault.

**Verification is split three ways.** First, app screens are tested once in a
test browser that installs the faked app runtime
(`tests/e2e/desktop-rail-arrival-harness.ts`), and that counts as proof for the
app too, because it is literally the same bundle — the exceptions are font
rendering, scrolling, and the window frame, which still have to be checked in
the installed app. Second, desktop-only abilities are proved *only* in the
installed app. Third, the website has its own test,
`tests/e2e/web-surface-smoke.spec.ts` (the gateway, `/sample`, and the app-only
page on every app route), which every whole run of `.github/workflows/e2e.yml`
runs on its own runner, and a planned dispatch runs on a deliberately wider
condition than the rest of the suite — nobody watches the website by hand, so
that test is its only guard.

An address copied from the app shows the app-only page in a plain browser; the
only door from a browser into the app is the `ontology-atlas://` grammar above.
Treat a copied app address as a reference for a person who has the app, not as a
link that works everywhere.

### In-app coding agents over ACP (2026-08-16)

ACP turn observers capture start/completion identity before a later selection
can change the context. The framework-free `mcp/src/analysis-history/analysis-record.mts` codec
owns diagnostic Markdown and `entities/analysis-record` re-exports it for the app;
`features/acp-session` captures actual full-body
results and architecture measurements; `widgets/analysis-workbench` renders
meaning, immutable history, and the still-mounted conversation. The native
`analysis_archive` module exclusively appends inside the captured vault's
`.ontology-atlas/analyses/`. MCP reads the same format without compiling it
into ontology nodes. The Architecture view may reconstruct a dated observation
only against its matching profile snapshot. [Contract and boundaries](contracts/analysis-records.md).

History page selection shares a pure bounded filename collector from
`mcp/src/analysis-history/name-page.mts`. MCP streams directory entries; the app
uses its file-handle iterator. Both preserve lexical ordering, strict cursors,
and scanned-file totals before filtering parsed records.

Queued permission requests preserve the JSON-RPC request ID without coercing
numeric and string IDs together. `askPermission`
(`src/features/acp-session/model/permissions/ask-permission.ts`) snapshots the
request, guards and options before waiting, with the originating turn, vault and
generation;
missing or mismatched ontology-write origins are refused. Unstructured user text
is retained as the requested outcome; unrecorded non-goals remain unknown.
A card still waiting is taken down by `refuseOpenAsk`
(`permissions/refuse-open-ask.ts`) and answered with a rejection, never an
option, when its turn ends, the conversation is closed or unmounted, or the
agent process exits; when the person cancels or stops the turn it is answered
`cancelled`, as the protocol requires of `session/cancel`, and so is every
request that arrives afterwards. A queued request whose turn has ended is
refused and never auto-approved.

The internal `task-meaning-review` model binds the exact proposal and keeps
historical comparison evidence separate from current decision reuse. Complete
trusted reads distinguish absent values from unavailable ones; shape changes and
removed map entries remain inspectable data. The Home workbench now connects a
bounded fresh pre-prompt vault/source capture and a single-patch comparison
controller. Missing, drifting or incomplete bases remain unavailable; changed
source without an attributed task diff cannot reuse meaning acceptance. Summary,
comparison and full details share the originating request. Meaning acceptance,
execution permission and diagnostic finding review retain separate authority;
missing code, merge and deployment receipts are unknown. Correction rejects the
old request and prepares an editable draft; conversation-local deferral keeps
the permission unresolved until resumed or cancelled.
[Contract and current limits](contracts/task-meaning-review.md).

The app can launch a coding agent the user already installed (Claude Code,
Codex, …) and speak the Agent Client Protocol v1 to it over stdio. It is a
desktop-only ability, so it attaches through the bridge convention above. Both
decision records behind it are in `docs/DECISIONS.md`, dated 2026-08-16.

| Module | Owns |
|---|---|
| `src-tauri/src/acp/` (root `acp.rs` declares the submodules, grouped by job: `registry`; `detection` with `command_lookup`, `login_probe`, `search_path`; `launch` with `npx_cache`, `runtime_environment`; `isolation` with `credential_mirror`; `install` with `node`, `cli`; `session` with `agent_process`, `permission_verdict`; `runtime`; `bounded_command`; `doctor`) | Registry snapshot parsing, runtime detection (`ready` · `cli-missing` · `node-missing` · `uvx-missing` · `binary-missing`), launch resolution, isolated config + credential symlink, permission verdict, process-group termination, connection doctor, app-owned Node runtime |
| `src-tauri/src/acp/session.rs`, `acp/runtime.rs` | The five Tauri commands (`acp_detect_runtimes`, `acp_start`, `acp_send`, `acp_stop`, `acp_permission_verdict`) and the four `acp://*` events; `vault/scope.rs` holds the vault-root rejection that also guards a session's working directory |
| `src-tauri/src/acp-registry.json` | The committed registry snapshot, generated by `scripts/registry-snapshots/build-acp-registry.mjs` (`pnpm acp:registry`); icons are fetched at build time into `public/acp-icons/` |
| `src/shared/lib/agent-chat/tauri-acp.ts` | The capability bridge. It never re-implements the permission policy |
| `src/features/acp-session/` | `acp-client.ts` (JSON-RPC framing over the bridge; `permissions/permission-answer.ts` decides which requests the app answers without a card and what is written back) and `use-acp-session.ts` (one session's lifetime; a permission request blocks until the screen answers, and an unanswered one is refused; `connection/open-session.ts` resumes or creates the conversation and raises the permission gate) |
| `src/widgets/acp-chat-panel/` | The existing Home workbench conversation, task-bound meaning review and separate execution permission card; `AcpChatPanelKeeper` in the locale layout renders every panel through a portal, so an answer in flight outlives the screen that asked for it |
| `src/widgets/app-settings-menu/ui/agent-setup/AcpRuntimeSettings.tsx` | The one ACP surface a user can reach today: the Agents destination's coding tools list |

Three properties are structural rather than incidental. The registry is a
committed snapshot, so no ACP code path touches the network at runtime. A
launched session runs against an app-owned config directory rather than the
user's global one, which is what makes the permission gate exist at all;
credentials are symlinked, never copied. And the child runs in its own process
group, so quitting the app ends the adapter and everything it spawned.

### The library — three kinds of file in one folder (2026-09-05), one destination (2026-09-06)

`docs/DECISIONS.md`, 2026-09-05: a vault holds three kinds of file and only one is the
graph. The separation is a property of the **walk**, not a filter applied later.

| Kind | Path | Reaches the parser? | Reaches the graph? |
|---|---|---|---|
| Raw source | `sources/**` (not `.md`) | no — the walk records path, size and mtime and never opens it | no |
| Wiki page | `wiki/**.md` | yes, like any Markdown | no — `deriveDocNode` requires `kind:` |
| Ontology node | anywhere, with `kind:` | yes | yes |

- `build-local-manifest.ts` emits raw sources as `manifest.sources`, a **sibling of
  `docs`**, so nothing downstream can mistake one for a concept. `walk_vault_stamps` in
  `src-tauri/src/vault/walk.rs` mirrors the rule, and
  `tests/contract/vault-format/vault-walk-rules.contract.test.ts` holds the two together — a
  fingerprint that counted a different file set would make the app rebuild constantly or
  miss a dropped document.
- The wiki page contract is `docs/ONTOLOGY-ATLAS-SPEC.md` §11. Its machine half is
  `mcp/src/library/wiki-schema.mjs` (executed by MCP `validate_wiki`), mirrored for the
  renderer by `src/shared/lib/library/wiki-page-schema.ts` and held together by
  `tests/contract/library/wiki-page-schema.contract.test.ts`.
- `tests/contract/library/library-never-enters-the-graph.contract.test.ts` runs one fixture
  folder through both walkers and the derivation, so neither file kind can become a node
  by accident.
- Local Compile has its own source read, existing-Wiki read and proposal catalogue in
  `src/features/vault-agent/model/compile/compile-tool-catalog.ts`. Existing Markdown reaches
  the model as untrusted context, with sequential coverage and a current snapshot
  receipt required for replacement. Raw-source reads alone supply citation provenance.
  `use-local-compile.ts` rechecks consented before text and timestamp before handing the
  selected writes to the existing applier. `LibraryPage` owns the current local work
  view independently of first-run guidance and preserves the previous reader selection
  while the narrow index stands aside. This is separate from ACP agent permissions
  and from the MCP-mirrored ontology tool catalogue.
- `src-tauri/src/library/` owns the native half, one file per job: hashing
  (`file_hashing.rs`), the native picker (`source_picker.rs`), the record of offered files and
  the check that an offered file is unchanged before it is copied (`source_offer.rs`), the
  file and folder name rules (`discovery_rules.rs`), metadata-only discovery
  (`source_discovery.rs`), dropped files (`dropped.rs`), the import commands
  (`source_import.rs`), one import's placing of each file (`import_run.rs`), where a copy may
  land and which names are taken (`import_destination.rs`), the confined writer
  (`source_copy.rs`), the stop flags and one-copy-per-folder claim (`running_imports.rs`),
  and Finder reveal (`reveal.rs`). It writes nothing outside `<vault>/sources/` or
  `<vault>/planning/`, and its discovery walk contains no writer.
- **One Library destination, four tabs (2026-09-28).**
  `src/app/library-workspace/` composes `src/views/library/` for Sources/Wiki, Check history,
  and saved Bookmarks, and `src/views/docs-vault/` for Concept documents. Ontology owns the
  document/set switch (`ontologyView=documents|sets`); `view` remains owned by the document reader.
  Legacy `tab=collections` replaces itself with `tab=ontology&ontologyView=sets`, retaining
  every other query parameter and the fragment. Sets remain reachable with zero current nodes.
  `/library/?tab=ontology` opens the existing
  reader/editor and filters every list, search, count, and saved working set to explicit
  authorable kinds. `/docs` redirects ontology and no-slug entries into Library; only an
  exact existing non-ontology target stays in its bounded Document reader with the same
  source context and fragment.
  Only the active view mounts, and no view imports another view. The workspace loads the
  Concept documents module while idle, so the first switch to it arrives with the panel's
  own fade rather than after a loading placeholder. The mobile Library
  slot replaces Docs. The editor flushes a pending local draft on unmount; explicit
  Save and the existing mtime conflict guard still own file writes. Markdown source
  outlines preserve line anchors used by MCP citations and store no converted copy.
  `tree-query.ts` gives the Ontology tree and its result count one locale-aware
  name/path matcher. `LibrarySection` previews the derived Wiki path and canonical
  section order in a modal before creation; `LibraryWorkActivityStrip` keeps the current
  receipt separate from its dismissible history surface.
- **Rounds (2026-09-17).** `src/entities/library-round/` owns the round record, the
  local-time cadence math, the `.ontology-atlas/rounds.json` store and the
  `rounds-ledger.jsonl` pass ledger (500-line cap). `src/features/library-rounds/`
  holds the pure judges: the standing scope (`round-scope.ts`, the decision's table as
  code), the service pass brief, the local consistency pass, and the tick planner.
  `src/views/library/lib/rounds/use-rounds-runner.ts` is the clock and the hands: one
  60-second tick, one pass at a time, local rounds first, a catch-up once after sleep,
  and a headless `useAcpSession` whose `autoDecide` answers every permission request
  from the scope and can now refuse (`{ reject }`). `LibraryRoundsProvider` mounts it
  once in `AppShell`, above every route; Automations only reads the ledger. No Rust
  change: hashing, the watcher and the ACP commands already existed.
- **Automations (2026-09-20).** `src/views/automations/` is the schedule manager and
  `src/app/automations-workspace/` composes it with the one `LibraryRoundsProvider` clock.
  Its Ontology lane registers `kind: "ontology"` read-only ACP review rounds: the runner may
  read `atlas-vault` and source evidence, records a bounded review summary, and refuses every
  ontology/file write and `finalize_project_meaning`. Its Documents lane opens the existing
  Library round registration and draws the pass ledger (`src/widgets/round-ledger/`). The rail's Automations destination opens on the
  Ontology lane (the map no longer repeats it as a toolbar chip, 2026-09-24); the retired
  `/library/?tab=rounds` address replaces itself with the Documents lane. No scheduler runs while no folder
  with a native root is open.
- `src/entities/library-collection/` owns the compatible `v1` saved-constellation
  schema and UID-based member resolution. The selected vault sidecar is shared by
  Map and Library; MCP mirrors it for read-only recovery. The Map
  candidate carries a separate `mapId` for map focus, while persisted
  `lastKnownPath` keeps the manifest's exact `document.path`
  (for example `capabilities/x.md`) for display only. A saved membership is neither
  an ontology kind nor an edge, and corrupt input is unavailable rather than empty.
- With nothing selected, Sources draws the source progress band
  (`src/views/library/ui/progress/`) over the Sources overview
  (`LibraryPage` mounts `src/widgets/library-sources-overview/` directly) when the
  folder has a source, and the empty folder's start stage when it has none; Wiki
  draws the question desk. Opening a document replaces either and
  gives it back on close. The band derives from the library model alone
  (`deriveSourceProgress`), sends nothing, and its press starts the bounded
  Compile request `useCompileBatch` names.
- Filed answers retain citations with `unmeasured` source receipts. Passive
  hashing describes current files, not the bytes used by an older answer. App
  writes register with the vault session's existing one-shot self-write ledger,
  so the polling toaster reports external changes without duplicating File's
  success and Undo feedback.
- Retained answer refresh lives in `src/features/library/lib/questions/answer-revision.ts`
  and `answer-revision-store.ts`; view hooks own the proposal and comparison
  lifecycle. ACP returns a draft, and an explicit save exclusively creates its
  Markdown revision after checking previous text and observed source bytes.
  These observations are separate from source-read provenance. The record and
  concurrency limits are defined in [Retained answers](contracts/retained-answers.md).

- `vault-library.ts` keeps source coverage separate from per-page freshness.
  `reviewPages` names stale or unmeasured ordinary Wiki pages even when another write-up
  covers current bytes; reserved answer histories use their separate refresh workflow; Compile target selection and the waiting caption share that
  work. The local Compile reader bounds reads to permitted inventoried wiki paths,
  retains one complete snapshot per turn, and requires contiguous reads before a
  replacement. The consent card exposes both texts and `applyProposal` receives that
  snapshot's mtime. Source receipts hash the complete read buffer, so a later disk
  edit cannot lend its hash to earlier text. This is a local Compile catalogue change, not a public MCP tool
  or an automatic ontology promotion.
- `wiki-retrieval.ts` builds a per-turn lexical index over the Library's existing
  page-text cache, with metadata fallback for unread bodies. Bodies are keyed by
  folder-session identity and page version;
  a same-named page in another folder cannot borrow a prior body's cache entry.
  Shared source identity precedes weighted rare-term overlap; Korean bigrams provide a limited particle
  fallback. `read_source_text` returns three ranked addresses plus coverage and omission
  counts, and charges that payload to the existing vault-character budget. Retrieval
  grants neither a source receipt nor permission to revise. The offline
  `evaluate:wiki` runner uses this index and the production Compile executor, loop,
  review builder and proposal applier against memory-only fixtures; its textual
  omission rubric is not a production gate or a semantic truth assessment.
- `src/features/library/lib/questions/question-desk.ts` ranks bounded local Wiki fact and
  decision leads and source units for the Wiki tab's unselected question desk.
  `LibraryQuestionDesk` retains its in-memory source-unit cache only for the
  current vault and inventoried file version, reports unread and omitted work,
  and opens exact source anchors. `question-desk-brief.ts` passes leads to ACP
  as untrusted context and requests a cited, no-write answer; `LibraryPage`
  disables automatic Wiki approval for Ask turns, while the existing human
  permission path still governs unexpected writes. In the installed app, a
  current claim and its cited original can reach the existing fixed Jev bridge
  only through a blocking exact-payload consent dialog. Its Keychain key and
  audit-before-send contract remain in `src-tauri/src/jev.rs`; the answer is
  advisory and grants no Wiki or ontology authority.
  A separate explicit report request reuses the ACP answer turn and shows its
  actual response as a sectioned unreviewed draft before expandable leads.
  Compact coverage opens full omissions without changing the read contract.
  Report state is tied
  to the query, vault and inventoried listing; stale drafts leave the surface.
  Filing reuses the existing answer validator and concurrent-edit guard. One
  client-side report model feeds a Markdown Blob download and a scoped print
  document for Save as PDF. The main macOS WebView has only the print permission
  needed for that native dialog; neither route adds a backend or accepts Jev advice.

The Library's live-work projection is separate from the persisted graph:
`src/features/library/model/library-work-activity.ts` normalizes structured ACP
and local tool observations into bounded active/completed events. The Library
view owns their lifecycle, the progress band's work line names the current target,
and `src/widgets/library-work-activity/` exposes recent receipts for inspection. No additional store, background service or write
authority is introduced.

## FSD layers

```
src/
├── app/        providers, init code
├── views/      page-level components (1 view per route or group)
├── widgets/    composite UI blocks (ontology-map, drawer, palette, …)
├── features/   single interaction units (form, picker, search, …)
├── entities/   business entities (project, ontology-class, …)
└── shared/     UI primitives, lib helpers, config, types
```

**Import direction**: `app → views → widgets → features → entities → shared`. ESLint blocks the reverse.

The directory layout is enforced by `eslint-plugin-boundaries` in `eslint.config.mjs`.

## Data flow

### Vault graph lifecycle

1. Markdown files are loaded from the vault folder.
2. Each file's frontmatter becomes one **node** (a thing in the model: a
   project, a domain, a capability, or an element), and the lists inside that
   frontmatter become **relations** (typed links between two nodes).
3. `compile_ontology` puts those nodes and relations into one fixed order,
   resolves aliases, collects the problems it found, lists the frontmatter
   arrays it would tidy up, computes a stable `graphHash` (one fingerprint for
   the meaning of the whole graph), and optionally builds query indexes.
4. `query_ontology` serves graph operations such as `neighbors`, `path`,
   `project_scope`, `blast_radius`, `cycles`, `maintenance_plan`,
   `workspace_brief`, and `health`. `agent_brief` accepts an explicit project
   in multi-project vaults and derives a fresh categorical `meaningAssessment`
   for that project; it does not reuse a saved score. First-contact diagnosis
   keeps the full nested validator receipt, including summary freshness. The
   history loader batches immutable revision bodies and reuses them only under
   the same Git HEAD; current Markdown is still read and validated per call.
5. Write tools change the markdown only when someone explicitly calls
   add/patch/relation/rename/merge/delete. Analysis tools such as
   `analyze_repo_structure` and `infer_imports` only propose candidates; they
   never change a file.
6. `finalize_project_meaning` runs after the writes are done. Once the vault
   validates and the project's scope is complete, it saves a versioned record —
   a *receipt* — of the competency answers, tied to the current graph and to
   where the source code came from. Writing that receipt successfully does
   **not** mean the source is still current. Three things stay separate and are
   never added up into one number: whether the structure is complete, whether
   each competency answer has evidence behind it, and whether the source has
   been rechecked. If evidence is missing, out of date, or unresolved, the
   assessment closes in one of the named review/evidence states instead of a
   score.
   Persisted competency Evidence/Paths may use literal `.` for the bound
   repository root. That witness resolves the root itself across app and MCP;
   it never claims a canonical child file or complete source/runtime coverage.

### Dual node identity

Every node carries two names. The `uid` is a lowercase UUIDv4 that never
changes — it is the node's permanent identity. The `slug` is the short readable
name in the file path and the URL, and it can be renamed at any time. The
compiler requires UID validity and uniqueness,
includes UID and merge-owned `merged_uids` in the semantic hash, and exposes
`uidToSlug`, `slugToUid`, and `mergedUidToSlug`. Compiled nodes and agent-facing
node summaries carry both values. Relations, adjacency maps, edge endpoints,
URLs, and canvas IDs remain slug-based; exact MCP identity lookup and interop
exports use UID. JSON-LD/GraphML serialize identity as `urn:uuid:<uid>`.
Rename/reclassify preserve UID; merge preserves the survivor and absorbs source
identity history. Invalid identity aborts compilation rather than producing a
partial artifact.

### Vault mode (user picked a markdown folder)

1. `useLocalVault()` returns `{ status: 'loaded', handle, manifest }`.
2. `useDataSourceMode()` returns `'local'`.
3. `useProjects()` derives projects from `manifest.docs` (filter `kind: project`).
4. `useOntologyInsight()` derives ontology nodes/edges from vault frontmatter.
5. Mutations (`useProjectMutations.updateProject`) write directly to `.md`
   files through the Tauri native vault bridge. `/docs`'s own separate
   local-source tab (browsing a second vault as a documentation source inside
   that page) is a narrower, older feature unrelated to opening your primary
   vault from the map.
6. Ontology block import/export reads the folder the Tauri native picker
   returns, through the `FileSystemDirectoryHandle` shape the bridge implements,
   into one recursive block reader/writer. Import plans conflicts before
   writing; cancelling the native picker has no side effect.
7. The installed shell commits destination content only
   after one local manifest is ready, except the map. While a folder is first read, the build
   reads the project, then `domains/`, `capabilities/` and `elements/`, then the rest; in a
   folder of 400 or more documents, once the read has run 0.2 s, it publishes what has arrived to
   the session's arrival store, at most once a second (each finished subfolder, and quarters of a
   large one only among the first three publishes). The vault value carries only the count,
   `partialTotal`, so a screen that keeps an arriving vault value keeps none of its documents, and
   the store empties once the folder settles. The first part drops the previous folder's manifest
   and handles, and every write is refused until the folder is loaded. Only the map opts in
   (`useArrivingOntologyInsight`, `useArrivingVaultIdentityScope`): it draws documents, never a
   relation-only node, and the INDEX counts the documents read. `useVaultOntology`,
   `useDataSourceMode` and every other destination, check and count wait for the whole manifest,
   which equals a build that publishes nothing. LNB route changes mount against the
   current provider before paint; a true folder switch holds a neutral body until the new manifest
   (on the map, its first part holding a concept) arrives, while a same-vault reread keeps the existing facts and
   publishes no part. The native picker, recent reopen, and cold restore all resolve a project root containing
   Markdown under `atlas/` to that child before building.

The MCP server is independent: it reads the same vault directory through the
filesystem (Node.js `fs`), not the WebView bridge. AI agents and the installed app end up with the same view.

### No folder loaded

1. `useLocalVault()` returns `{ status: 'closed' }`.
2. `useDataSourceMode()` reports the app's own "no folder loaded" state, which
   holds no bundled data.
3. The app is in this state on first run, during a cold restore or a folder
   switch before the manifest arrives, and on the destinations that open without
   a folder (`src/shared/config/destinations.ts`). Each shows its own
   "no folder" screen; none draws a sample.
4. Mutations are blocked with a toast pointing to the folder chooser.

The first run offers only local create/open paths and the workbench rail stays
hidden until a local manifest, or the first part of one, exists. No page of the
website reads a folder or a manifest, so this state exists only in the app (and
in a test browser that installs the faked app runtime). The one bundled map is
`/sample`, a read-only page of the website (`src/views/sample-map`) that imports
the Storefront sample the build generates with `pnpm docs-vault:build`; the
app's route tree has no `/sample`, like `/download`.

## Routes

```
/                          shows a different screen depending on who opens it. A plain browser
                           gets the gateway — the intro page, the same view /download renders,
                           with "See a sample map" beside the download. Anyone in the installed
                           app gets the map (or first run). The installed app must never offer
                           "download this app" to someone who is already running it, and the
                           shell chrome and the content always agree on which of the two
/topology                  map + contextual relation editor + change review. Any link labelled
                           "map" or "edit relation" points here, not at / (gate:
                           tests/contract/routes/map-destination-route.contract.test.ts)
/architecture              the Harness destination (relabelled from Architecture since
                           2026-09-13; route unchanged). Two views on ?view=:
                           overview (Setup, the default) — the connected
                           repository's context, guardrails and verification in
                           the order of the agent's loop, each artefact by its real
                           name with a filter per agent tool, problems only for a
                           missing hook script or Codex's AGENTS.md over its
                           default limit, and no score, grade or percentage;
                           architecture — reviewed architecture profiles, the
                           stable role blueprint, and the typed MCP handoff,
                           where every ?role= deep link still lands. ?view=guides,
                           ?view=structure, ?view=coverage and ?view=sensors
                           rewrite to overview. Never an ontology map
/planning                  session-only, read-only project-folder reader; native reads use a
                           Planning-specific root descriptor and never add source/vault grants.
/docs                      vault picker / editor / unified palette
/ontology                  thin redirect → /topology?index=expanded (old tree/ego hub retired, B3)
/ontology/edit             compatibility redirect → /topology contextual workbench
/ontology/studio           compatibility redirect; translates node/mode/edit to /topology
/ontology/insights         compatibility redirect (`beforeLoad`, `retired-address-targets.ts`): tab=harness →
                           /architecture/?view=overview with other flags kept; tab=library →
                           /library/?tab=wiki; review=analysis:<id> or node=<slug> →
                           /topology/?p=<canonical id>; anything else → /topology/
/git                       local vault git history / snapshot workbench; remains a
                           primary desktop-rail destination with contextual links too
/agents                    coding agents this computer can run — the app launches them and
                           you talk to them here. Fetches Node and the pinned CLI into an
                           app-only folder when they are missing, runs the eight-step
                           connection check, and repairs what it can. Moved out of the
                           settings sheet 2026-08-20 (ledger 90): settings is where you pick
                           values, this is operational work with progress state. The ontology
                           folder stays in settings (a different owning domain). Since
                           2026-09-25 the API Key pane is the page's models tab (?tab=models):
                           local runners by address, Keychain keys, the experimental Jev
                           check and the sent-log count; the settings Agents pane keeps door
                           rows to it and to MCP (2026-10-02).
                           Native sent-log reads use audit_read.rs: one caller-owned,
                           generation-validated descriptor, raw pulls up to 1MiB,
                           four aggregate slots and idle/total leases. Unsupported
                           platforms retain existing file transport. Changed/failed/
                           expired bounded reads remain unavailable with Retry;
                           only complete scans publish count
                           and five recent rows. Keychain presence
                           lookups dispatch off the window event thread. A renderer
                           shares only pending lookups per provider; mutation
                           boundaries detach older reads and completed values are
                           never cached.
                           The app launches the tools. MCP
                           left this screen on 2026-09-05 for /mcp, came back on 2026-09-17
                           as the second tab of one Agents destination, and on 2026-09-18
                           became the page's last section (the owner: fold it into the
                           page, not a strip at the top): src/app/agents-workspace/ renders
                           src/views/agents/ with src/views/mcp/ embedded as its children;
                           ?tab=mcp scrolls to the section and neither view imports the other
/mcp                       compatibility redirect → /agents/?tab=mcp (2026-09-17). Its own
                           section rides along as ?mcp=share|connectors, and every other
                           parameter travels unchanged, which is what keeps the installed
                           app's ontology-atlas://mcp?install=… deep link (answered by Rust
                           as /<locale>/mcp/?tab=connectors&install=…) landing on the
                           connectors dialog. Was its own destination from 2026-09-05.
/library                   the project documents gathered into this folder, the wiki
                           pages written from them, typed ontology documents, and saved
                           bookmarks. Four tabs keep Sources, Wiki, Ontology, and
                           Check history distinct; Ontology contains Concept documents and
                           Bookmarks. The first two use the two-pane document
                           flow, whose right pane shows the selected Wiki page or the
                           bounded facts known about a raw source. Bookmarks resolves
                           real ontology members by UID and returns the whole set to Map
                           with `?constellation=<folder UUID>`. Split out of /docs 2026-09-06:
                           gathering documents of any format and reading the ontology's
                           Markdown are different jobs, and five capped lists were
                           competing for one 280px column. With no folder open it is one
                           centred stage naming the two kinds of file and offering the
                           picker
/automations               schedules for agent work and the results of their runs
/changes                   what was merged in the connected source repository, and which few
                           changes deserve a person's own eyes
/work-status               which agent session holds which worktree of a repository and
                           whether its work is merged
/projects                  project list (cards)
/project/new               new project form
/project/fallback          the one project address: ?slug= is project detail (inline edit when
                           a vault is loaded) and &mode=edit the full editor, both read from
                           the query; an address with no slug returns to /projects. The per-slug
                           pages /project/[slug] and /project/[slug]/edit existed only for
                           bundled samples and are removed
/download                  the same gateway page at its own address — it keeps the breadcrumb
                           and the back-to-map link that / leaves out
/sample                    a read-only map of the Storefront sample, drawn by the app's map
                           renderer from a file made at build time; no rail, no open-folder
                           control, no edit, no agent panel. Website only: the app's bundle
                           leaves it out
/guide                     the project guide, several chapters rendering docs/guide/*.md vault
                           docs in English and docs-i18n/guide/<locale>/*.md in ko, ja, zh. Named `guide` and not `docs` because /docs is already the
                           vault workbench (2026-07-30 ledger). Order and slugs live once in
                           src/views/gateway-doc/model/guide-pages.ts
/guide/[segment]           one chapter; static params come from that same registry
/changelog                 renders the composed changelog (frozen history plus change/release fragments), most recent sections only
```

All routes are wrapped under `/[locale]/` (en, ko, ja, zh), the `$locale` segment of the route tree. Chinese is Simplified only, served as `zh` with `<html lang="zh-Hans">`; root `/` sends `zh-Hant`, `zh-TW`, `zh-HK` and `zh-MO` browsers to `/en/`.

Two layout routes own that segment, and the URLs do not show which one a page has,
because a pathless layout adds no segment. `src/app/routes/$locale/_app/route.tsx` is the
workbench: the app shell, vault and agent providers, and the whole message
catalog, which the shell's rail, settings and agent dock read. The gateway
pages, `/download`, `/sample`, `/guide` and `/changelog`, live under
`src/app/routes/$locale/_site/` in the same viewport frame without
the rail, and their provider receives only the message paths in
`src/i18n/gateway-messages.ts`. The prerender serialises those messages into
every public page, so this keeps the workbench's copy out of the public pages'
HTML; `gateway-messages.test.ts` walks those pages' import graph and fails
when the list drifts. A move between the two layouts remounts the providers.
`/` stays a workbench route, since it is the work entry point in the installed
app; in a plain browser the boot script sends it to `/download` before the body
is parsed. The workbench layout also renders the app-only page (`src/views/app-only`)
beside the workbench in every app route's HTML, marks it `noindex`, and leaves the
choice of face to CSS keyed on `data-shell`.

A screen declares the query it reads as the route's `validateSearch`
(`src/shared/lib/navigation/screen-searches.ts`, or a `*-search.ts` file beside a
screen under `src/app`) and receives the typed value as its `search` prop; the
router parses and writes it as text (`src/shared/lib/navigation/atlas-search.ts`).
`/` starts from the subset `WorkbenchMessagesProvider` is given; the whole
catalog arrives as one chunk per locale (`src/i18n/workbench-catalog.ts`)
through that provider: every other workbench route, and `/` in the installed
app, waits for it. The retired addresses answer from `beforeLoad`
(`src/app/routes/-redirects/`).

> Removed in earlier rounds: `/admin/*`, `/review/*`, `/diagnostics/*`,
> `/knowledge/*`. Removed in Round 10: `/login`, `/signup`, `/account`,
> `/reset-password`, `/settings/*`. Removed 2026-11-27: `/project/[slug]` and
> `/project/[slug]/edit`, which existed only for bundled samples.

**Above the destinations the rail carries exactly one thing: the open folder's
identity** (`src/features/vault-switch`, 2026-09-13). It is the only persistent
place in the app that says which folder the data comes from — the shell has no
header, and no destination-specific header can name the folder everywhere — and
pressing it opens the known folders plus a picker. The same list
is the launch chooser: when two or more known folders still exist the cold restore
stops rather than guess, leaving the folder screen to own the launch; a moved or
deleted folder is not counted. Decisions: `docs/DECISIONS.md`, "The folder count
decides the launch", narrowed by
`docs/records/decisions/2026-10-17-launch-counts-present-folders-6805358d-1f74-4d46-a28c-d1940e5cc01e.md`.

The companion game and related personal-record screens are retired. First-run
and Map retain folder/document entry without a game door. Existing personal
localStorage bytes are left untouched; no reader, migration or deletion runs.
`features/agent-activity` owns verified work status and the notification inbox.
Its finite mascot consumes that same feed and appears in the status lane only
for observed read/completion events; it adds no polling or idle simulation.

**One piece of code decides which nav item is active; each screen size shows a
different list of buttons.** The desktop rail shows Map,
Architecture, Library, Planning, Automations, Projects, Agents, Changes and Git. Agents carries
three body tabs, `agents`, `models` and `mcp`, addressed by `?tab=`. The mobile bottom
bar shows Map, Architecture, Library, Planning and Projects. Library contains Sources, Wiki, Ontology, and Check history;
Bookmarks live inside Ontology alongside Concept documents;
`/docs` remains an exact-document compatibility address for non-ontology files and resolves
active navigation to Library; it does not restore a general Docs home.
Contextual writing stays inside Map, while Agents, MCP and Git keep their narrow-screen
entry points.
Both read the same rules in
`src/shared/lib/navigation/nav-destination.ts`, so every route belongs to exactly one
destination even on a screen size that deliberately hides that button. The
retired
`OperationsNav` and `OntologySubNav` are deleted. `AppSettingsMenu` mounts
through the shell, while `AgentActivityChip` mounts in Topology's contextual map
controls and `AgentActivitySettings` configures that current-work flow; none is
a navigation destination.

## URL contract (query-param + node id grammar)

A URL is how this app shares a view. A copied link, a handoff to an AI agent,
and the browser's back button must all rebuild the same screen, so one node has
to be written the same way everywhere. The **standard way to write a node id is
`<kind>:<slug>`** — the kind in singular, a colon, then the slug, for example
`capability:mcp-server`, `domain:views`, `project:ontology-atlas`. That is the
value carried in `?node=` / `?p=` / `?realm=` and the id used in the text handed
to an agent.

### Query params

| Param | Screen(s) | Meaning | Value shape |
|---|---|---|---|
| `p` | `/`, `/topology` | focused/selected node | canonical `<kind>:<slug>` (bare slug tolerated) |
| `open` | `/`, `/topology` | density-gate expanded parents inside a realm | comma list of node ids |
| `realm` | `/`, `/topology` | "realm" containment-subtree root | canonical `<kind>:<slug>` (bare slug promoted) |
| `mode` | `/`, `/topology` | analysis mode | `overview` \| `focus` \| `path` \| `health` |
| `pathFrom` / `pathTo` (aliases `from` / `to`) | `/`, `/topology` | path source / target | node id |
| `hub` · `c` · `impact` · `pulse` · `index` · `create` | `/`, `/topology` | focused hub · category · impact mode · pulse window · INDEX panel state · legacy create-node intent | see `src/views/home/model/route-state/url-state.ts` |
| `workbench` · `edit` | `/topology` | contextual writer state · optional relation/target | `edit` \| `create`; `edit=<relation>:<targetId>` |
| `recent` · `ask` | `/`, `/topology` | recent-change lens · agent first-words intent | typed parsers in `src/views/home/model/route-state/url-state.ts` |
| `via` | `/docs` | the map node the document crumb returns to; a retired `insights:<tab>` marker is ignored everywhere | `topology:<nodeId>` |
| `constellation` | `/topology` | saved Map task scope or creation intent | stable folder UUID \| `new` |
| `node` | `/ontology` (redirect) | node to focus after redirect → `?p=` | node id (translated by `translateOntologyDeeplinkToTopologyParam`) |
| `node` · `mode` · `edit` | `/ontology/edit`, `/ontology/studio` | legacy write deep link translated to `p/workbench/edit` | canonical and plural-folder node forms tolerated; `mode=create` → `workbench=create` |
| `slug` | `/docs` | vault file to open | vault file path (`ontology/capabilities/foo`), not a node id — file paths are the docs vault's own address space |
| `tab` · `review` · `node` | `/ontology/insights` (redirect) | where a saved Analysis address lands | `tab=harness` → `/architecture/?view=overview`; `tab=library` → `/library/?tab=wiki`; `review=analysis:<nodeId>` or `node=<slug>` → `/topology/?p=<canonical id>`; anything else → `/topology/` |

### One place builds node ids, one place reads them

- **Building a link** (map · popovers · datasheets, all staying in
  the map workbench): `buildTopologyMeaningEditorNodeHref` and
  `buildTopologyMeaningEditorEdgeHref` in
  `src/entities/knowledge-graph/lib/ontology-node-href.ts`. It normalizes any
  input to canonical via `translateOntologyDeeplinkToTopologyParam`
  (`capabilities/foo` → `capability:foo`; already-canonical / bare /
  evidence-path pass through).
- **Compatibility redirect**: the `/ontology/edit` and `/ontology/studio` routes
  normalize legacy query values in `beforeLoad` and replace the address
  with `/topology?p=...&workbench=edit` or `/topology?workbench=create`.
- **Reading a link**: `parseHomeRouteState` owns `p/workbench/edit`, and
  `parseOntologyStudioEditParam` remains only as the compatibility parser for
  the relation/target pair. Unknown relation values open no editor rather than guessing.
- **Turning a node id into a docs file path** happens in exactly one place: the
  popover and the datasheet pass the focus model's `sourceSlug` (a path to a
  file in the vault) straight into `buildDocsVaultHref({ slug })`. `/docs`
  addresses files, not nodes, so its `?slug=` deliberately stays a file path.
- Both the building and the reading side are pinned by `ontology-node-href.test.ts`,
  `translate-ontology-deeplink.test.ts`, and
  `url-state.test.ts`, and `retired-address-targets.test.ts`, which also pins
  the retired Analysis address.

## Build pipeline

```bash
pnpm docs-vault:build      # docs/ontology/*.md → src/entities/docs-vault/data/manifest.json
pnpm docs-vault:check      # verify local materialized docs-vault outputs are fresh
pnpm build                 # Vite: the app folder and the prerendered site (out/)
pnpm vault:validate        # R11+ — frontmatter integrity + graph array drift
pnpm test:vault:validate   # focused validator CLI argument contract
pnpm vault:audit           # dogfood ontology capability/element paths exist in repo
pnpm test:vault:audit      # focused vault audit CLI argument contract
pnpm package:check         # MCP and init package files contract + self-test
pnpm test:contracts        # focused cross-package parser/schema/validator contracts
pnpm vault:migrate --list  # R11 — schema migration runner (dry-run default)
```

The `docs-vault:build` step is automatic via `predev` and `prebuild` npm hooks. `docs-vault:check` also runs in the macOS release workflow, while `vault:validate`, `test:vault:validate`, `vault:audit`, `test:vault:audit`, and `package:check` remain explicit local/release-preflight gates.

## i18n routing contract

- In-app navigation: `Link`, `useRouter`, `usePathname` from `@/i18n/navigation` (locale-aware).
- A screen reads its query from its route (`Route.useSearch()`, typed by `validateSearch`) and
  hands it down as `search`; chrome beside a screen reads `useCommittedSearch`.
- Cross-locale pivot (LocaleSwitch): the router's `buildLocation` for the same screen with another
  `locale` param, `search` and `hash` carried.
- Translation key namespaces: one file per namespace per locale,
  `messages/<locale>/<Namespace>.json` (kept in parity). `pnpm messages:build`
  composes the ignored `messages/<locale>.json` that tests import; installation, checkout and merge hooks, `predev`, `build`, and
  Vitest's global setup run it.

## Test surface

- **Vitest** (`tests/` + co-located `*.test.ts`) — unit + component
- **Playwright** (`tests/e2e/*.spec.ts`) — visual regression, a11y, navigation, mobile

E2E tests no longer rely on Firebase emulators (R10b removed firebase-tools
and emulator scripts entirely).

## Source-of-truth files

When docs and code disagree, code wins:

- `package.json` — what's installed, what scripts exist
- `vite.config.ts` — the build, the route plugin, the two output folders
- `index.html` and `scripts/vite/atlas-index-html.ts` — the document head, the boot script, the page policy
- `src/app/routes/$locale/_app/route.tsx`, `src/app/routes/$locale/_site/route.tsx` — the providers
- `eslint.config.mjs` — FSD boundary rules

Long-form docs:

- [`AGENTS.md`](../AGENTS.md) — contributor guide (canonical for AI tools)
- [`PRODUCT-DIRECTION.md`](./PRODUCT-DIRECTION.md) — mission
- [`FEATURES.md`](./FEATURES.md) — currently shipping features
- [`DESIGN-SYSTEM.md`](./DESIGN-SYSTEM.md) — design tokens + forbidden patterns
- [`engineering/deployment.md`](./engineering/deployment.md) — the built site folder → static hosting
- [`CHANGELOG.md`](./CHANGELOG.md) — chronological user-visible changes

### Internal meaning transition evidence

The pure shared [transition evidence codec](contracts/meaning-transition-evidence.md)
checks an immutable candidate's supplied decision, revision and per-row facts.
The installed app can retain a validated candidate and its declared
content-addressed artifacts under `.ontology-atlas/meaning-transitions/` through
a bounded, no-follow, exclusive native archive on Unix platforms with stable
vault identity. Windows currently reports this capability unavailable rather
than substituting path identity. Artifacts are published and
read back before the immutable transition record becomes visible; malformed
history members remain reported on their requested page. Each history request
enumerates bounded member names, then opens and validates only that page;
completed membership or record values are not cached.
Archive integrity proves only that the supplied bytes were retained: it does not
authenticate a human decision, verify a writer or check, or grant Git, merge,
deployment, ontology-write, or source-repository authority. Existing analysis
records and ACP execution receipts retain their original authority, and current
ontology Markdown remains the editable canonical meaning.

The archive accepts both the original `atlas-meaning-transition/v1` record and
the additive V2 linked snapshot format. V2 publishes an immediate immutable
meaning-decision snapshot and later appends terminal/readback refinements through
an exact previous-record digest link; it never edits the earlier record or uses
timestamps as proof of ordering.


### Disposable source PR originals

Changes uses `tauri-change-briefing.ts` and `git/briefing/prs/cache.rs` for app-only historical copies of explicitly read public PR descriptions. `public-pr-copies/copies.json` under app-local data is a bounded, versioned disposable envelope, separate from source transfer receipts and ontology truth. It stores no folder grants, model results or commit bodies. Native restore requires a fresh granted source receipt, current selected remote and local merge/introduction proof; its scope hashes canonical folder and filesystem identity, excluding HEAD. Disk-only restore leaves every selected commit remotely unchecked.

Unix storage uses component-wise no-follow directory handles, private regular files, a bounded record-count/byte reader, a dedicated cross-process lock and atomic replacement. Clear changes a persisted generation so an earlier network read cannot repopulate copies; its command has no caller path or source-grant prerequisite. Unsupported safe storage degrades to session-only fresh reads. The bridge answers "no runtime" outside the app.
