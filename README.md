# Ontology Atlas

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/brand/lockup-dark.svg" />
    <img src="public/brand/lockup-light.svg" alt="Ontology Atlas — Map your codebase knowledge." width="360" />
  </picture>
</p>

<p align="center">
  <strong>Your AI coding agent forgets your product between sessions.<br />
  Keep the shared map beside the code — in Markdown you own.</strong>
</p>

<p align="center">
  Ontology Atlas turns the Markdown in your repository into a graph of your
  product — domains, capabilities, implementation evidence, dependencies,
  impact — and runs real graph queries over it: blast radius, reachability,
  cycles, shortest path. Your agent reads and maintains it over MCP. You judge
  every change as a plain git diff.
</p>

<p align="center">
  <strong>One download installs both surfaces.</strong> The desktop app carries a
  compiled MCP server inside its own bundle, and one button writes your agent's
  config and proves the connection.
</p>

<p align="center">
  <a href="https://wlsdks.github.io/ontology-atlas/"><strong>Download for macOS</strong></a>
  ·
  <a href="https://wlsdks.github.io/ontology-atlas/en/topology/"><strong>Live demo</strong></a>
  ·
  <a href="#the-journey"><strong>The journey</strong></a>
  ·
  <a href="#status--read-this-before-installing"><strong>Status</strong></a>
  ·
  <a href="mcp/README.md"><strong>MCP setup</strong></a>
  ·
  <a href="cli/README.md"><strong>CLI reference</strong></a>
</p>

<p align="center">
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-5e6ad2.svg" /></a>
  <a href="mcp/README.md"><img alt="33 MCP tools" src="https://img.shields.io/badge/MCP-33_tools-5e6ad2.svg" /></a>
  <a href="cli/README.md"><img alt="52 CLI commands" src="https://img.shields.io/badge/CLI-52_commands-5e6ad2.svg" /></a>
  <img alt="Local-first" src="https://img.shields.io/badge/storage-local--first-17181f.svg" />
</p>

![The Ontology Atlas macOS app showing the example storefront vault: a project hexagon at the centre, six domains around it, solid contains edges and dashed depends-on edges, and an INDEX panel listing each domain with its capability and element counts](docs/assets/readme/topology-overview.png)

<p align="center">
  <sub>The installed macOS app reading the example vault in
  <a href="samples/storefront"><code>samples/storefront</code></a> — an online
  store, written as nothing but Markdown files in a folder. The interface moves
  quickly; the live demo and <a href="docs/FEATURES.md">feature inventory</a>
  are the current behavior contract.</sub>
</p>

---

## In 30 seconds

A folder of Markdown files. Each file's frontmatter declares what it is
(`project`, `domain`, `capability`, `element`, or a linked `document`) and what
it points at. That is the whole database.

Because the kinds and relation types are a small fixed set, the folder is not
just readable — it is **computable**. Atlas compiles it into a graph and answers
questions a note-taking tool cannot: *what breaks if I change this, what is this
capability's blast radius, which paths connect these two things, what is
disconnected, what is stale.*

Your agent asks those questions over MCP. You read the same answers as a map,
and every write the agent makes lands as a line in a Markdown file you can diff.

## Why not just use a notes tool

Local Markdown plus MCP is not rare any more, and this README will not pretend
otherwise. [Basic Memory](https://github.com/basicmachines-co/basic-memory)
already gives an agent a human-readable Markdown store with an MCP server, and
there are several mature Obsidian MCP bridges. **Markdown you own, git-diffable
review, no login, no telemetry: treat all of that as table stakes.** Atlas has
it, and so do they.

The difference is what sits on top:

| | Notes with MCP (Basic Memory, Obsidian bridges) | Graph stores for agents (Zep/Graphiti, Cognee, Mem0) | Ontology Atlas |
|---|---|---|---|
| Store | Markdown you own | A database you cannot read by hand | Markdown you own |
| Structure | Freeform notes, freeform link labels | Typed, but vendor-defined | A four-layer product hierarchy, linked documents, and typed relations |
| Graph reach | Traverse *N* hops from a note | Full graph engine | Blast radius, reachability, cycles, shortest path, centrality, health |
| Derived from your repo | No — you write the notes | No — you feed it a corpus | Bounded, read-only proposals from supported source evidence; nothing lands until approval |
| Reading surface | Obsidian, or a paid web app | A vendor console | A free local map, workshop, and maintenance board |

Read the middle rows together, because that is the actual argument: **the typed
hierarchy is not the feature — it is the price of admission for the graph
queries.** Containment has to be computable before "blast radius" or "this
project's coverage" can mean anything. If you only want an agent to remember
your conversations, a notes tool is the lighter choice and you should take it.
Atlas is for when you want a model of the system your code implements.

The theory and prior art behind that position are cited in
[docs/FOUNDATIONS.md](docs/FOUNDATIONS.md).

## Status — read this before installing

*Last updated 2026-08-02.*

- **Check [GitHub Releases](https://github.com/wlsdks/ontology-atlas/releases)
  for a build.** If that page is empty, or only lists release candidates,
  treat it as beta software; everything below also runs from a source checkout.
  The screenshots here were captured from local builds and are not release
  verification evidence.
- **macOS releases are signed with a Developer ID certificate and notarized by
  Apple.** Update packages use a separate project key the app verifies before
  replacing anything — see [SECURITY.md](SECURITY.md). The Windows x64 beta is
  intentionally unsigned, so Microsoft Defender SmartScreen may show an
  unknown-publisher warning and managed work PCs may block it.
- **There is no npm channel, and there will not be one.** Earlier drafts of this
  README pointed at unpublished packages. That plan was retired on 2026-07-27:
  the MCP server is compiled into the app bundle instead, so installing the app
  installs the agent surface too. From source, the CLI and MCP server run
  directly out of the checkout.
- **The desktop app ships for macOS and as an unsigned Windows x64 beta.** Both
  bundles carry the MCP server. The source-checkout CLI and browser app remain
  available anywhere their runtimes are supported.
- **The screenshots below are illustrative local builds.** Download names,
  checksums, signing state, and availability come from the current GitHub
  Release rather than from screenshots or hand-written placeholders.

## The journey

### 1. Open a folder

The app's first question is a folder. Point it at a vault — a directory of
Markdown — and it reads it in place. No import step, no index to build, no
account.

The vault in every screenshot below is
[`samples/storefront`](samples/storefront): an online store described as
products, inventory, orders, payments, delivery, members, marketing and support —
each with the capabilities inside it and the things those capabilities work with.
Run `node cli/src/index.mjs overview samples/storefront` for the current census;
no document here writes the number, because it changes whenever anyone adds a node.

### 2. Connect your agent

![The Connect an AI agent sheet in the macOS app, listing a See what will be written button, one-click buttons for Claude Code, Cursor, VS Code and Codex, a note that there is no server left running, and the sentence the agent will read back: this project is made of Products, Members, Shipping, Marketing and 2 more, and each document is its evidence](docs/assets/readme/agent-connect.png)

This is normally a paragraph of setup instructions. Here it is a button.

- **See what will be written, first.** The sheet shows the exact absolute paths,
  whether each file is created or overwritten, and that the result is plain text
  you can read in a git diff. Nothing is written until you confirm.
- **Then it proves itself.** After writing, the app spawns the bundled MCP
  server and runs a real round trip against your vault. You get a confirmation
  naming the tool count and a node it actually read — or the failure reason. No
  fake progress bar.
- **Nothing stays running.** The server speaks stdio; your agent starts it when
  it needs it and it exits afterwards. No port, no daemon, no traffic leaving
  the machine.

Claude Code, Cursor, VS Code and Codex each get a button. Any other MCP client
can copy the snippet from **Advanced · detailed checks**.

### 3. Read the map

![One domain selected on the map: unrelated nodes are dimmed, and a datasheet on the right lists the Orders domain with Connected 13, Source docs 1, actions for Document, Edit relations, Copy handoff, Ask the agent, Path and View only this, and typed relation groups contains 5, used by 5, leans on 2](docs/assets/readme/topology-focus.png)

Selecting a node dims everything unrelated and opens its record. The same fact
serves two readers at once: a visual hierarchy for a person, and a typed
relation list — `contains`, `used by`, `leans on` — for an agent, with **Copy
handoff** right there, because the next reader is often not a human.

The map can answer a simpler question before you inspect any one node: **what
changed this week?** Turn on **Recent** and Atlas keeps documents changed inside
the selected time window crisp while the rest of the map recedes. The INDEX
narrows to those nodes but preserves their project and domain parents, so a
refund change still reads in the context of Customer Support and Payments. In a
local vault, the signal comes from the Markdown files' modification times on
your disk — not inferred activity or a hosted service.

![Recent changes in the installed macOS app, using a capture-only local copy of the Storefront sample: 7 fixture documents changed in the last 7 days, cyan dashed rings mark those recent nodes while the rest of the map recedes, and the INDEX keeps the matching nodes together with their project and domain parent chain; 7 is the result of this fixture, not a product limit](docs/assets/readme/recent-changes.png)

_Installed-app capture from a local, capture-only copy of `samples/storefront`.
Seven documents were marked as changed in this 7-day fixture — **7 is not a
product limit**. Cyan dashed rings mark recent nodes; the INDEX retains their
project/domain parent chain so the change remains readable in context._

**Footprints** mark the concepts you opened, numbered in the order you walked
them, so a long session leaves a path you can retrace instead of a map you have
to re-derive.

![The Footprints section of Settings in the macOS app: a live preview strip drawing shoe-print marks between two node squares along a relation line, presets named Subtle, Default and Bold, and an expanded fine-tuning list with Print size 13px, Fill solid or outline, Strength 70 percent, Colour yellow or indigo, Bleed none, Distance 8px, and whether to mark along links](docs/assets/readme/settings-footprints.png)

Shape, size, spacing and opacity are yours, and the strip above the controls is
not a picture of the feature — it is **the same renderer the map uses**, drawing
your current values as you change them. The map background is a separate choice
of three (dots, a proximity constellation, or layered depth dots), previewed the
same way from the real canvas tokens.

That preview is why Settings can be a plain centred dialog: you do not need to
see the map behind it, because the thing you are adjusting is drawn right there.

<p align="center">
  <img alt="Screen recording of the macOS app: clicking a domain in the INDEX panel expands its capabilities, the camera moves to that part of the map, and the domain datasheet slides in from the right" src="docs/assets/readme/atlas-map-focus.gif" width="800" />
</p>

<p align="center">
  <sub>Recorded from the app window. Picking a domain in the INDEX expands it,
  moves the camera, and opens its record.
  (<a href="docs/assets/readme/atlas-map-focus.webm">webm</a>)</sub>
</p>

### 4. Complete what a node means

![The Workshop compass stage in the macOS app: one capability sits in the centre card, two of four relation bearings are filled with linked nodes, the other two are dashed empty sockets asking what is this node a kind of and something similar or interchangeable, and the footer reads 2 of 4 filled, 2 to go, next to a confirm and save control](docs/assets/readme/workshop-context.png)

Shape relations in Workshop: the four relation types are nailed to fixed compass
bearings — what this node **is a kind of** (up), what it **holds** (down), what
it **leans on** (right), what it is **similar to** (left). Missing relations are
drawn as dashed empty sockets, and filling one writes a real frontmatter
relation. The `builder_context` an agent hands you (a persisted Workshop focus
URL) survives a reload, so it can point you at a node and you land on it.

Nothing lands until you confirm. That boundary is visible on purpose.

### 5. Review the change, then record it

![The History screen in the macOS app: Not saved yet, 1 edited, a changed concept list naming capabilities/return-intake with a plus one minus one count, a diff whose dependencies line gains capabilities/shipment-tracking, a Save 1 button, and a note that only documents inside this folder are recorded and files outside it are left alone](docs/assets/readme/history-review.png)

Whatever wrote — you, the Workshop, the CLI, or an agent over MCP — lands here
first as a diff you read before it becomes history. The change above was written
by a command, not by hand, and the command said what it would do to the graph
before touching a file:

```console
$ node $ATLAS/cli/src/index.mjs relate capabilities/return-request capabilities/refund dependencies ./storefront --dry-run

capabilities/return-request --dependencies--> capabilities/refund
  verdict matches_existing_schema · exists no
  schema  capability --dependencies--> capability
  pattern count 51 · resolved 51 · external 0 · unresolved 0
  recommendation safe_to_add · No exact or inverse edge found; capability --dependencies--> capability is an existing schema pattern.

nearby schema patterns
  3 · capability --dependencies--> capability (count 51)
  2 · capability --relates--> capability (count 12)
  1 · capability --elements--> element (count 54)
  1 · capability --domain--> domain (count 49)
  1 · domain --capabilities--> capability (count 49)

dry-run would write dependencies on capabilities/return-request → capabilities/refund (no file changed)
```

An edge that would introduce a shape the vault has never used comes back as
`new_schema_pattern · review_new_schema` instead, so a drifting agent is visible
before it writes rather than after.

Git is scoped to the vault. Files outside the folder you picked are never
touched, and the screen says so.

### 6. Keep it healthy

![The Graph insights maintenance board in the macOS app: header reading 31 Concepts, 62 Relations, 6 Domains, tabs for Do next, Inventory, Connections, Boundaries and Freshness, an Agent readiness bar split into ready, preflight and review, a repair queue counting missing links and hub candidates, a fix-these-now list of two decisions that need no code, and a Copy next action handoff button](docs/assets/readme/graph-insights.png)

Insights turns graph health into a work queue: what is disconnected, what is
stale, what is missing evidence, which repair to make next. **Agent readiness**
splits every relation into what an agent can trust immediately, what needs a
quick check, and what a person should decide.

**What the agent did** reads `.ontology-atlas/activity.jsonl` from inside your
vault — plain text, in the folder, part of the same diff. The example vault has
no agent history yet, so that panel is empty here; connect an agent and its
writes show up in the same place, from the same file. Nothing is collected
anywhere else to produce it.

### 7. See the shape of the whole project

![The Projects screen in the macOS app: one project card for the storefront sample with 13 capabilities and 11 elements, domain counts, and a per-domain bar chart of capability and element coverage, with a note that the counts are computed from how documents are linked](docs/assets/readme/projects-coverage.png)

Nothing on this screen is maintained by hand. Frontmatter has no `project:` key
— the runtime walks the containment graph from each `project` root and derives
coverage from how the documents link to each other.

## What your agent gets

**33 MCP tools — 19 read, 14 write** — over stdio JSON-RPC, for Claude Code,
Cursor, Codex, and any MCP client. The point is not the tool count; it is that
the answers are *typed*, so an agent can act on them.

The server runs on the **MCP SDK v2** (`@modelcontextprotocol/server` 2.0). That
migration is deliberately invisible to you: a contract test still handshakes at
the oldest supported protocol version (`2024-11-05`) and asserts that an older
client can still list and call tools, so moving to v2 did not quietly drop
anyone's editor.

Here is a real question — *what breaks if I change this?* — answered against the
same example vault the screenshots use:

```console
$ node $ATLAS/cli/src/index.mjs blast-radius capabilities/payment-authorize ./storefront --depth 2

capabilities/payment-authorize — blast radius (depth 2, incoming)
  risk high · 22 노드 · 33 관계 · 6 cross-domain

affected by kind
  capability     10
  element        9
  domain         2
  project        1

affected by domain
  domains/payment                          15
  domains/order                            3
  domains/catalog                          1
  domains/customer                         1
  domains/marketing                        1

affected nodes (distance 별)
  d1 capabilities/installment — Instalment Payment
  d1 capabilities/order-placement — Order Placement
  d1 capabilities/payment-cancel — Payment Void
  d1 capabilities/tax-receipt — Tax Receipt Issuing
  d1 capabilities/wallet-payment — One-Tap Wallet Payment
  d1 domains/payment — Payments
  d2 capabilities/refund — Refund Processing
  d2 elements/kakao-pay — KakaoPay Integration
  ...

next impact capabilities/installment — impact rows are candidates, not proof;
inspect backlinks and node detail before refactor decisions
  node $ATLAS/cli/src/index.mjs node capabilities/installment [vault] --limit 20
  node $ATLAS/cli/src/index.mjs backlinks capabilities/payment-authorize [vault]
  node $ATLAS/cli/src/index.mjs reachability capabilities/payment-authorize [vault] --plan --depth 2 --direction both --limit 20
```

*Verbatim, apart from the elided `...` rows and the runnable prefix — the CLI
shortens its own follow-up hints to `ontology-atlas <command>`, which is not a
command that exists on your machine, so they are spelled out here. Every node in
the example vault carries a `display_ko` / `display_en` pair, so the same graph reads "Payments" in
English and "결제" in Korean without the file changing; `title` stays one value
because search and matching need a single truth. The CLI's own labels are still
partly Korean and are on the list to translate.*

No graph database is involved. `compile_ontology` builds the graph
deterministically from frontmatter, and `query_ontology` runs paths,
reachability, blast radius, cycles, centrality, similarity, and health over it.

Three properties make this usable by an agent rather than merely printable:

- **Focused starting context, not a repo dump.** `agent_brief` returns reading
  order, graph entry points, first tool calls, investigation playbooks, write
  guardrails, and stop conditions; CLI sessions use `agent-brief --project SLUG`
  when a vault contains more than one project. `workspace-brief` is the cheap first-contact dashboard:
  per-project node counts (`project_scope`), health-check coverage as
  `id:status:count`, and growth counts before the agent chooses where to read
  deeper — so the first call is a summary, not a download.
- **Writes that survive review.** Analysis tools are side-effect free by
  default; destructive changes return a complete dry-run before confirmation;
  renames and merges redirect backlinks atomically; optimistic `mtime` guards
  stop an agent from overwriting a concurrent human edit. After accepted graph
  writes, validation, and a complete compile, `finalize_project_meaning` stores
  a small project-meaning provenance receipt—not raw answers or a private source
  root. Its `ok: true` means the receipt was written; the categorical,
  fail-closed verdict remains `agent_brief.meaningAssessment`.
- **The same authority without a connector.** The CLI's 52 commands cover the
  same ground for sessions with no MCP client attached.

Full contracts: [MCP guide](mcp/README.md) · [CLI reference](cli/README.md).

## A vault is just files

One Markdown file is one node. Frontmatter is the machine-readable record; the
body is the explanation a person judges.

```yaml
---
uid: 71890f3e-7b5d-4c0a-8f14-123456789abc
slug: capabilities/token-issue
kind: capability
title: Token issue
domain: domains/auth
path: src/auth/token-service.ts          # a path — code evidence
elements:
  - elements/jwt-signer                  # a slug — an implementation-role node
dependencies:
  - capabilities/session-refresh  # a slug — another node
---

Issues access and refresh tokens for authenticated users.
```

That distinction is the one thing worth learning up front: **a path points at
code, a slug points at a node.** Mixing them is the most common first mistake,
and `node $ATLAS/cli/src/index.mjs validate` reports it as a dangling reference.

The hierarchy is deliberately small:

```text
project
└── domain
    └── capability
        └── element
```

Typed relations add dependency, evidence, containment, and descriptive meaning.
The goal is not to index every symbol — a source artifact earns a node when it
helps a person or an agent understand a capability, trace impact, or run the
right proof. Curated, not exhaustive.

## Ontology quality contract

- **There is no vault-wide or project-wide node cap.** Node count is an
  observation, never a pass condition.
- **Direct fan-out is a review signal, not a limit.** A wide hub is correct when
  its children resolve, name distinct roles, and carry clear provenance.
- **Bridge nodes must earn their layer.** They name one shared behavior, differ
  from their siblings, and actually reparent the children they group. Count
  alone never justifies a bridge.
- **Analyzer bounds are evidence-packet bounds, not graph bounds.** Each language
  adapter keeps one proposal readable; it does not limit ontology size or a
  node's number of relations.
- **`uid` and `slug` have different jobs.** UID is permanent identity; slug is
  the readable current address. Source locations belong in `path:` evidence.
- **External field trials stay isolated.** Generalized measurements may improve
  Atlas, but a trial repository's ontology is never merged into the product's
  dogfood graph.

The authority and verification path for each rule lives in the
[Ontology Quality Authority Map](docs/ONTOLOGY-QUALITY.md). The practical node
test is [What becomes a node?](docs/guide/what-becomes-a-node.md).

Atlas deliberately sits *above* code intelligence. Grep, language servers, and
AST indexes answer where a symbol lives and what calls it. Atlas answers why
that artifact matters, which capability it serves, and what to verify before
changing it. It replaces none of them — it tells the agent which structural
question is worth asking.

## How relations are stored

There is no database, DB schema migration, sync button, or server. **A relation
is one line of frontmatter**, and the graph is derived from those files every
time they are read — never queried out of a prebuilt store. The one explicit
file-format migration is v1→v2 UID issuance; it is dry-run first through
`pnpm vault:migrate 2026-08-02-add-node-uids --vault <dir>`.

That has one consequence worth stating plainly: **the hierarchy is not a
ceiling.** Containment (`project → domain → capability → element`) is only the
structural layer. Meaning relations sit on top of it and cross it freely — a
domain can point straight at another domain, and a capability can depend on one
several branches away.

Only the side that declares the relation writes anything:

```yaml
# capabilities/vault-live-updates.md — the declaring side
---
slug: capabilities/vault-live-updates
kind: capability
domain: domains/local-vault-management
dependencies:
  - capabilities/topology-canvas-render   # directed: this leans on that
relates:
  - capabilities/mcp-conflict-guard       # symmetric: read these together
---
```

```yaml
# capabilities/topology-canvas-render.md — the receiving side writes nothing
---
slug: capabilities/topology-canvas-render
kind: capability
domain: views
---
```

The target picks the edge up as a backlink. Writing it on both sides is allowed
— the map folds the round trip into a single line.

Two domains linking directly is ordinary, not a special case — write the other
domain's slug and you are done:

```yaml
# domains/onboarding-and-shell.md
---
slug: domains/onboarding-and-shell
kind: domain
relates: [domains/topology-navigation]   # a domain pointing at another domain
---
```

| Frontmatter key | Relation | Direction |
|---|---|---|
| `capabilities:` · `elements:` · `contains:` | `contains` | directed (parent → child) |
| `domain:` · `domains:` | `contains` | directed |
| `dependencies:` | `depends_on` | **directed** |
| `relates:` | `related_to` | **symmetric — no direction** |
| `broader:` | `is_a` | directed (SKOS `skos:broader`) |
| `describes:` | `describes` | directed |

Direction is not decorative: the map draws a width taper on directed edges and a
uniform stroke on symmetric ones, so `relates` never claims a causality it does
not have. `src/shared/lib/ontology-tree/relations.ts` is the single source for
that decision, and `derive-ontology-from-vault.ts` is where frontmatter becomes
edges.

Because the file *is* the record, adding a relation shows up as a one-line
`git diff` — including when an agent is the one who added it:

```diff
- dependencies: [capabilities/topology-canvas-render]
+ dependencies: [capabilities/topology-canvas-render, capabilities/vault-validator]
```

Count them in any vault with the CLI — `overview` breaks relations down by type,
`domain-matrix` shows which domains actually touch each other:

```bash
node $ATLAS/cli/src/index.mjs overview --vault docs/ontology
node $ATLAS/cli/src/index.mjs domain-matrix --vault docs/ontology
```

The [guide chapter on relations](docs/guide/relations.md) walks through the same
model with diagrams, and covers how the map keeps thousands of them legible
(concentric rings, phyllotaxis packing, density gating, semantic zoom).

## Product destinations, one vault

The journey above moves through them in order. Every surface reads and writes the
same `.md` files — the interface changes, the authority does not. The MCP server
is listed here on purpose: to this product an agent is a surface, not an add-on.

| Surface | What it is for |
|---|---|
| **Front door** (`/`, `/download`) | What this is, and the two ways in — install the app, or open the map in the browser. Only shown to a visitor who has not opened a folder yet; once you have a vault, `/` is the map |
| **Map** (`/topology`) | Overview-first topology, semantic zoom, typed relation inspection, focus and path modes, impact, agent handoff |
| **Docs** (`/docs`) | Read and edit the Markdown source, frontmatter evidence, backlinks, search |
| **Workshop** (`/ontology/studio`) | Complete one node's meaning against four fixed relation bearings, behind a visible write-confirm boundary |
| **Insights** (`/ontology/insights`) | The maintenance board — what to do next, composition, connections, boundaries, freshness |
| **Projects** (`/projects`) | Project cards and coverage derived from containment |
| **History** (`/git`) | Vault-scoped changes, history, and local snapshots — nothing outside the vault is ever committed |
| **MCP server** (33 tools, 19 read + 14 write) | The agent's surface — the same graph over stdio JSON-RPC, with dry-runs and write guardrails |

The installed app is the vault's full workbench. The hosted web surface is the
no-install gateway and a second-best workbench where the native bridge is not
available; it does **not** promise every desktop screen. CLI and MCP do not render
these routes at all — they read and write the same folder directly. The
[live demo](https://wlsdks.github.io/ontology-atlas/en/topology/) opens with this
repository's own vault, while the site's
[`/`](https://wlsdks.github.io/ontology-atlas/) remains the download gateway.

| | |
|---|---|
| **Dogfooding** | This product describes itself — domains, capabilities, and elements living in [`docs/ontology/`](docs/ontology/). Run `node cli/src/index.mjs overview` for the current census; the map's number reads higher than the file count because it also draws the source paths those files cite as evidence. |

No document pins that census. Run the command when you need the current number;
the app derives its displayed facts from the graph it renders.

## Local-first, by construction

- **Your disk is the database.** Frontmatter is the graph; confirmed writes go
  back to the folder you picked. There is no other store.
- **Git is the history.** Diffs stay human-readable; history and snapshots are
  scoped to the vault.
- **No backend, no account, no telemetry.** The web app is a static export.
  Nothing is transmitted anywhere unless you explicitly ask for it.
- **Two ways in, one folder.** The hosted web app can open a local folder
  through the File System Access API, so the live demo works on your own files
  without installing anything. The desktop app uses a Tauri bridge to your
  selected folder instead, which lifts the browser's limits and lets the same
  vault stay open as a real desktop workspace.
- **The Tauri macOS shell is a shell, not a silo.** It is granted a deliberately
  short permission list; broad filesystem, shell, HTTP, and opener grants are
  refused by a build gate. The MCP server and CLI read that same directory
  directly.
- **The bundled MCP server is a file, not a service.** It sits inside the app
  bundle and keeps working when the app is closed, because your agent launches
  it itself.

## Running from source

Requires Node.js 24 and pnpm. This is the source-checkout fallback for
environments without a supported installed app.

```bash
# Keep the tool outside the project you are describing.
git clone https://github.com/wlsdks/ontology-atlas ~/tools/ontology-atlas
cd ~/tools/ontology-atlas && pnpm install
pnpm --dir mcp install   # mcp/ carries its own lockfile — the line above skips it
ATLAS=~/tools/ontology-atlas/cli/src/index.mjs

cd /path/to/your/repo

# 1. Scaffold a vault in *your* repo. Also writes .mcp.json (Claude Code /
#    Cursor) and .codex/config.toml (Codex), wired to this vault.
node $ATLAS init ./ontology

# 2. Analyze the repository. The default run is side-effect free;
#    --apply is the explicit write boundary.
node $ATLAS index . --vault ./ontology
node $ATLAS index . --vault ./ontology --apply

# 3. The compact packet a person or coding agent starts from.
node $ATLAS agent-brief ./ontology
```

Both installs are load-bearing, and so is repeating the second one. `mcp/` is
not in the root pnpm workspace, so the first `pnpm install` never reaches it and
a `git pull` that bumps `mcp/package.json` leaves it behind. A stale
`mcp/node_modules` does not fail loudly, and it does not fail first: step 1
scaffolds happily, because `init` only writes files. Step 2 and everything after
it exit with `ERR_MODULE_NOT_FOUND` instead, because those spawn the MCP server
to answer. Re-run the `--dir mcp` line after every pull.

Restart your agent in your repository and the 33 MCP tools register from the
generated config. `node $ATLAS mcp-verify ./ontology` proves the actual server
process and its contracts at any time.

> Run `init` in your own repository, not inside the Atlas clone. This clone
> already ships a committed `.mcp.json` pointing at Atlas's own vault, and
> `init` refuses to overwrite it — your agent would silently answer from
> *our* ontology instead of yours.

To run the desktop shell from the same checkout:

```bash
pnpm desktop:dev
```

## Verifying a change

The gates a contributor runs before opening a pull request:

```bash
pnpm exec tsc --noEmit    # types
pnpm lint                 # 0 errors (warnings are tracked, not zero)
pnpm test:run             # unit + contract suites
pnpm docs-vault:check     # committed app sample matches docs/
pnpm docs:check           # generated MCP/CLI surface + broken doc links
pnpm package:check        # MCP/CLI/docs/performance contracts
pnpm vault:validate       # frontmatter integrity
```

`pnpm docs:check` is two gates. `docs:surface:check` regenerates
`docs/.generated/mcp-surface.json` from the live MCP tool registry and the CLI
command registry, fails on any diff, and then checks that `mcp/README.md` and
`cli/README.md` name every registered tool and command — run
`pnpm docs:surface:build` and commit the diff after adding either. `docs:links`
resolves repo-relative links and cited file paths (external URLs are opt-in:
`pnpm docs:links:external`). The rule they enforce — *only check what a machine
can generate* — is recorded in [docs/DECISIONS.md](docs/DECISIONS.md).

`pnpm checks:changed` picks the smallest sufficient subset for what you touched;
[CONTRIBUTING.md](CONTRIBUTING.md) explains when to escalate to the full set.

Map interaction cost is not covered by those gates — the canvas has no DOM, so a
run that silently pans the background instead of dragging a node reports "fast"
and is wrong. Measure it with the deterministic harness, which proves it grabbed
a real node before quoting a number:

```bash
pnpm build && npx serve out -l 4173
node scripts/perf-node-drag.mjs
```

Neither do they cover whether the map is *readable as a graph* — until 2026-08-03
the node spec had contract tests, the type ramp had lint, and motion had frame
measurement, while the layout occupying most of the screen was judged only by
someone saying "looks busy". The same observation surface answers it:

```bash
node scripts/serve-static-export.mjs --port=4173 &   # after pnpm build
node scripts/measure-graph-readability.mjs
```

It reports edge crossings and node overlap — and only those, because Purchase
(Graph Drawing 1997) found crossing minimisation dominates human comprehension
while angular resolution and grid snapping were not statistically significant.
The metric maths live in `scripts/lib/graph-readability.mjs` as pure functions so
they can be probed with known answers (`tests/contract/graph-readability.contract.test.ts`);
a detector that only ever returns zero is indistinguishable from no detector.

The observation surface both drive (`?e2e=1` → `window.__atlasMap`) and the
measurement discipline are documented in
[docs/MAP-TESTABILITY.md](docs/MAP-TESTABILITY.md).

## Documentation

| Document | Start here when you need… |
|---|---|
| [Product direction](docs/PRODUCT-DIRECTION.md) | Mission, audience, and boundaries |
| [Foundations](docs/FOUNDATIONS.md) | The cited theory and prior art behind the positioning |
| [Ontology quality](docs/ONTOLOGY-QUALITY.md) | Which rules are hard, advisory, human judgment, or evidence protocol — and who owns each one |
| [Vault specification](docs/ONTOLOGY-ATLAS-SPEC.md) | The public v2 Markdown/frontmatter format |
| [Features](docs/FEATURES.md) | The complete current inventory — app, MCP, CLI, desktop |
| [Architecture](docs/ARCHITECTURE.md) | Local-first data flow and runtime contracts |
| [MCP guide](mcp/README.md) | Registration and all 33 tool contracts |
| [CLI reference](cli/README.md) | All 52 commands with examples |
| [Decisions](docs/DECISIONS.md) | What was decided, what lost the argument, and what would overturn it |
| [Brand](docs/BRAND.md) | What the mark means, and which asset to use where |
| [Security](SECURITY.md) | Threat model, release-credential protection, reporting |

## Contributing

Issues and pull requests are welcome. The most valuable reports today come from
pointing Atlas at a real repository and showing where the proposed meaning, the
agent handoff, or the validation falls short.

Read [CONTRIBUTING.md](CONTRIBUTING.md) first — external pull requests come from
forks, and that is a security boundary rather than a formality. If you are
working inside this repository, [AGENTS.md](AGENTS.md) is the canonical guide for
people and AI agents alike.

## License

[MIT](LICENSE)
