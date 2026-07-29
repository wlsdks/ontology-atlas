# Ontology Atlas

<p align="center">
  <img src="public/brand-icon-512.png" alt="Ontology Atlas" width="104" />
</p>

<p align="center">
  <strong>Your AI coding agent forgets your codebase between sessions.<br />
  Give it a typed model of your product — in Markdown you own.</strong>
</p>

<p align="center">
  Ontology Atlas turns the Markdown in your repository into a graph of your
  product — domains, capabilities, implementation evidence, dependencies,
  impact — and runs real graph queries over it: blast radius, reachability,
  cycles, shortest path. Your agent reads and maintains it over MCP. You judge
  every change as a plain git diff.
</p>

<p align="center">
  <strong>One download installs both surfaces.</strong> The macOS app carries a
  compiled MCP server inside its own bundle, and one button writes your agent's
  config and proves the connection.
</p>

<p align="center">
  <a href="https://wlsdks.github.io/ontology-atlas/"><strong>Live demo</strong></a>
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
  <a href="mcp/README.md"><img alt="32 MCP tools" src="https://img.shields.io/badge/MCP-32_tools-5e6ad2.svg" /></a>
  <a href="cli/README.md"><img alt="52 CLI commands" src="https://img.shields.io/badge/CLI-52_commands-5e6ad2.svg" /></a>
  <img alt="Local-first" src="https://img.shields.io/badge/storage-local--first-17181f.svg" />
</p>

![The Ontology Atlas macOS app showing the example storefront vault: a project hexagon at the centre, six domains around it, solid contains edges and dashed depends-on edges, and an INDEX panel listing each domain with its capability and element counts](docs/assets/readme/topology-overview.png)

<p align="center">
  <sub>The installed macOS app reading the example vault in
  <a href="samples/storefront"><code>samples/storefront</code></a> — 31 Markdown
  files in a folder. Every screenshot and clip below is the same app on the same
  folder.</sub>
</p>

---

## In 30 seconds

A folder of Markdown files. Each file's frontmatter declares what it is
(`project`, `domain`, `capability`, `element`) and what it points at. That is
the whole database.

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
| Structure | Freeform notes, freeform link labels | Typed, but vendor-defined | A fixed 4-kind hierarchy with typed relations |
| Graph reach | Traverse *N* hops from a note | Full graph engine | Blast radius, reachability, cycles, shortest path, centrality, health |
| Derived from your repo | No — you write the notes | No — you feed it a corpus | Yes — `index_project` and `infer_imports` propose nodes and edges from your source tree |
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

*Last updated 2026-07-28.*

- **Check [GitHub Releases](https://github.com/wlsdks/ontology-atlas/releases)
  for a build.** If that page is empty, or only lists release candidates,
  everything below runs from a source checkout. The screenshots here were
  captured from a local build, before the first signed release.
- **The release pipeline is credentialed to sign with a Developer ID
  certificate and notarize with Apple**, and update packages are signed with a
  separate project key the app verifies before replacing anything — see
  [SECURITY.md](SECURITY.md). No build has shipped through that path yet, so
  the first public release will be the first end-to-end proof of it.
- **There is no npm channel, and there will not be one.** Earlier drafts of this
  README pointed at unpublished packages. That plan was retired on 2026-07-27:
  the MCP server is compiled into the app bundle instead, so installing the app
  installs the agent surface too. From source, the CLI and MCP server run
  directly out of the checkout.
- **The desktop app is macOS-only** (Windows in preparation). The CLI, the MCP
  server, and the browser app run anywhere Node 24 does.
- **The screenshots below are from a locally built copy of the app**, not from a
  signed release download, because there is no release to download yet.

## The journey

### 1. Open a folder

The app's first question is a folder. Point it at a vault — a directory of
Markdown — and it reads it in place. No import step, no index to build, no
account.

The vault in every screenshot below is
[`samples/storefront`](samples/storefront): an online store described as six
domains, thirteen capabilities and eleven elements.

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

![The History screen in the macOS app: Not saved yet, 1 added and 1 edited, a changed concept list naming capabilities/return-intake, a diff showing the dependencies line gaining capabilities/shipment-tracking, a Save 2 button, and a note that only documents inside this folder are recorded](docs/assets/readme/history-review.png)

Whatever wrote — you, the Workshop, the CLI, or an agent over MCP — lands here
first as a diff you read before it becomes history. The change above was written
by a command, not by hand, and the command said what it would do to the graph
before touching a file:

```console
$ node $ATLAS/cli/src/index.mjs relate capabilities/return-intake capabilities/shipment-tracking dependencies ./storefront --dry-run

capabilities/return-intake --dependencies--> capabilities/shipment-tracking
  verdict matches_existing_schema · exists no
  schema  capability --dependencies--> capability
  pattern count 7 · resolved 7 · external 0 · unresolved 0
  recommendation safe_to_add · No exact or inverse edge found; capability --dependencies--> capability is an existing schema pattern.

nearby schema patterns
  3 · capability --dependencies--> capability (count 7)
  1 · capability --domain--> domain (count 13)
  1 · domain --capabilities--> capability (count 13)

dry-run would write dependencies on capabilities/return-intake → capabilities/shipment-tracking (no file changed)
```

An edge that would introduce a shape the vault has never used comes back as
`new_schema_pattern · review_new_schema` instead, so a drifting agent is visible
before it writes rather than after.

Git is scoped to the vault. Files outside the folder you picked are never
touched, and the screen says so.

### 6. Keep it healthy

![The Graph insights maintenance board in the macOS app: header reading 31 Concepts, 62 Relations, 6 Domains, tabs for Do next, Inventory, Connections, Boundaries and Freshness, an Agent readiness bar split into ready, preflight and review, a repair queue counting missing links and hub candidates, a What the agent did entry showing the relation a command just wrote, and a Copy next action handoff button](docs/assets/readme/graph-insights.png)

Insights turns graph health into a work queue: what is disconnected, what is
stale, what is missing evidence, which repair to make next. **Agent readiness**
splits every relation into what an agent can trust immediately, what needs a
quick check, and what a person should decide.

**What the agent did** reads `.ontology-atlas/activity.jsonl` from inside your
vault — plain text, in the folder, part of the same diff. The entry on that
screen is the relation the command in step 5 wrote. Nothing was collected
anywhere else to produce it.

### 7. See the shape of the whole project

![The Projects screen in the macOS app: one project card for the storefront sample with 13 capabilities and 11 elements, domain counts, and a per-domain bar chart of capability and element coverage, with a note that the counts are computed from how documents are linked](docs/assets/readme/projects-coverage.png)

Nothing on this screen is maintained by hand. Frontmatter has no `project:` key
— the runtime walks the containment graph from each `project` root and derives
coverage from how the documents link to each other.

## What your agent gets

**32 MCP tools — 19 read, 13 write** — over stdio JSON-RPC, for Claude Code,
Cursor, Codex, and any MCP client. The point is not the tool count; it is that
the answers are *typed*, so an agent can act on them.

Here is a real question — *what breaks if I change this?* — answered against the
same example vault the screenshots use:

```console
$ node $ATLAS/cli/src/index.mjs blast-radius capabilities/payment-authorize ./storefront --depth 2

capabilities/payment-authorize — blast radius (depth 2, incoming)
  risk high · 10 노드 · 15 관계 · 6 cross-domain

affected by kind
  capability     6
  domain         2
  element        1
  project        1

affected by domain
  domains/order                            4
  domains/payment                          3
  domains/customer                         1
  domains/fulfillment                      1

affected nodes (distance 별)
  d1 capabilities/order-cancel — 주문 취소
  d1 capabilities/order-create — 주문 생성
  d1 capabilities/refund-process — 환불 처리
  d1 domains/payment — 결제
  d2 capabilities/cart — 장바구니
  ...

next impact capabilities/order-cancel — impact rows are candidates, not proof;
inspect backlinks and node detail before refactor decisions
  node $ATLAS/cli/src/index.mjs node capabilities/order-cancel [vault] --limit 20
  node $ATLAS/cli/src/index.mjs backlinks capabilities/payment-authorize [vault]
  node $ATLAS/cli/src/index.mjs reachability capabilities/payment-authorize [vault] --plan --depth 2 --direction both --limit 20
```

*Verbatim. The node titles are Korean because this example vault is written in
Korean, and a vault reads in whatever language you write it in; the CLI's own
labels are on the list to translate. Node names can carry a `display_en` /
`display_ko` pair, which is why the map above says "Payments" where this
transcript says "결제".*

No graph database is involved. `compile_ontology` builds the graph
deterministically from frontmatter, and `query_ontology` runs paths,
reachability, blast radius, cycles, centrality, similarity, and health over it.

Three properties make this usable by an agent rather than merely printable:

- **Focused starting context, not a repo dump.** `agent_brief` returns reading
  order, graph entry points, first tool calls, investigation playbooks, write
  guardrails, and stop conditions. `workspace-brief` is the cheap first-contact dashboard:
  per-project node counts (`project_scope`), health-check coverage as
  `id:status:count`, and growth counts before the agent chooses where to read
  deeper — so the first call is a summary, not a download.
- **Writes that survive review.** Analysis tools are side-effect free by
  default; destructive changes return a complete dry-run before confirmation;
  renames and merges redirect backlinks atomically; optimistic `mtime` guards
  stop an agent from overwriting a concurrent human edit. The preflight in step
  5 is the same idea — it named the schema consequence before writing anything.
- **The same authority without a connector.** The CLI's 52 commands cover the
  same ground for sessions with no MCP client attached.

Full contracts: [MCP guide](mcp/README.md) · [CLI reference](cli/README.md).

## A vault is just files

One Markdown file is one node. Frontmatter is the machine-readable record; the
body is the explanation a person judges.

```yaml
---
slug: capabilities/token-issue
kind: capability
title: Token issue
domain: domains/auth
elements:
  - src/auth/token-service.ts     # a path — code evidence
depends_on:
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

Atlas deliberately sits *above* code intelligence. Grep, language servers, and
AST indexes answer where a symbol lives and what calls it. Atlas answers why
that artifact matters, which capability it serves, and what to verify before
changing it. It replaces none of them — it tells the agent which structural
question is worth asking.

## Six work surfaces, one vault

The journey above moves through them in order. Every surface reads and writes the
same `.md` files — the interface changes, the authority does not. The MCP server
is listed here on purpose: to this product an agent is a surface, not an add-on.

| Surface | What it is for |
|---|---|
| **Map** (`/`, `/topology`) | Overview-first topology, semantic zoom, typed relation inspection, focus and path modes, impact, agent handoff |
| **Docs** (`/docs`) | Read and edit the Markdown source, frontmatter evidence, backlinks, search |
| **Workshop** (`/ontology/studio`) | Complete one node's meaning against four fixed relation bearings, behind a visible write-confirm boundary |
| **Insights** (`/ontology/insights`) | The maintenance board — what to do next, composition, connections, boundaries, freshness |
| **Projects** (`/projects`) | Project cards and coverage derived from containment |
| **History** (`/git`) | Vault-scoped changes, history, and local snapshots — nothing outside the vault is ever committed |
| **MCP server** (32 tools, 19 read + 13 write) | The agent's surface — the same graph over stdio JSON-RPC, with dry-runs and write guardrails |

Those routes are the same in all three places they can be opened: the installed
macOS app, the CLI's sibling web build, and the hosted site. The
[live demo](https://wlsdks.github.io/ontology-atlas/) opens with this
repository's own vault and needs no install; point it at your own Markdown
folder in the browser and the same map switches to your data.

| | |
|---|---|
| **Dogfooding** | This product describes itself: **98 nodes** — capabilities 38, elements 49, domains 6, document 3, project 1, vault-readme 1 — living in [`docs/ontology/`](docs/ontology/). The map also draws the source paths those files cite as evidence, which is why the app's census reads higher than the file count. |

A test fails if those counts drift from the folder. Numbers in this README are
checked against the vault, not maintained by hand.

## Local-first, by construction

- **Your disk is the database.** Frontmatter is the graph; confirmed writes go
  back to the folder you picked. There is no other store.
- **Git is the history.** Diffs stay human-readable; history and snapshots are
  scoped to the vault.
- **No backend, no account, no telemetry.** The web app is a static export.
  Nothing is transmitted anywhere unless you explicitly ask for it.
- **Two ways in, one folder.** The hosted web app can open a local folder
  through the File System Access API, so the live demo works on your own files
  without installing anything. The macOS app uses a Tauri bridge to your
  selected folder instead, which lifts the browser's limits and lets the same
  vault stay open as a real desktop workspace.
- **The Tauri macOS shell is a shell, not a silo.** It is granted a deliberately
  short permission list — broad filesystem, shell, HTTP, and opener grants are
  refused by a build gate — and the MCP server and CLI read that same directory
  directly.
- **The bundled MCP server is a file, not a service.** It sits inside the app
  bundle and keeps working when the app is closed, because your agent launches
  it itself.

## Running from source

Requires Node.js 24 and pnpm. This is the supported path until the first release
ships.

```bash
# Keep the tool outside the project you are describing.
git clone https://github.com/wlsdks/ontology-atlas ~/tools/ontology-atlas
cd ~/tools/ontology-atlas && pnpm install
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

Restart your agent in your repository and the 32 MCP tools register from the
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
pnpm package:check        # MCP/CLI/docs/performance contracts
pnpm vault:validate       # frontmatter integrity
```

`pnpm checks:changed` picks the smallest sufficient subset for what you touched;
[CONTRIBUTING.md](CONTRIBUTING.md) explains when to escalate to the full set.

## Documentation

| Document | Start here when you need… |
|---|---|
| [Product direction](docs/PRODUCT-DIRECTION.md) | Mission, audience, and boundaries |
| [Foundations](docs/FOUNDATIONS.md) | The cited theory and prior art behind the positioning |
| [Features](docs/FEATURES.md) | The complete current inventory — app, MCP, CLI, desktop |
| [Architecture](docs/ARCHITECTURE.md) | Local-first data flow and runtime contracts |
| [MCP guide](mcp/README.md) | Registration and all 32 tool contracts |
| [CLI reference](cli/README.md) | All 52 commands with examples |
| [Decisions](docs/DECISIONS.md) | What was decided, what lost the argument, and what would overturn it |
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

---

## 한국어

Ontology Atlas 는 사람과 AI 에이전트가 함께 키우는, 저장소 안의 의미 계층입니다.
Markdown frontmatter 가 곧 그래프이고, 그 위에서 영향 반경·도달성·순환·경로 같은
실제 그래프 질의가 돕니다. 에이전트는 MCP 32개 도구로 읽고 쓰며, 사람은 평범한
git diff 로 판단합니다. 백엔드·로그인·텔레메트리가 없고 vault 폴더가 유일한
저장소입니다.

- **다운로드 한 번이 두 표면을 설치합니다.** macOS 앱이 컴파일된 MCP 서버를 자기
  번들에 싣고, 버튼 하나가 에이전트 설정을 **쓰기 전에 보여준 뒤** 써 주고 그
  자리에서 연결까지 확인합니다.
- **npm 발행 계획은 폐기됐습니다** (2026-07-27). 소스 체크아웃에서 CLI 와 MCP
  서버를 바로 실행합니다.
- **받을 수 있는 빌드가 있는지는
  [GitHub Releases](https://github.com/wlsdks/ontology-atlas/releases)에서
  확인하세요.** 비어 있거나 릴리스 후보만 있으면 소스 체크아웃으로 씁니다.
  이 README 의 화면들은 첫 서명 릴리스 이전에 로컬 빌드 앱에서 찍었습니다.
- [라이브 데모](https://wlsdks.github.io/ontology-atlas/)에서 이 저장소 자신의
  온톨로지(97 노드)를 설치 없이 볼 수 있습니다.
- 연결은 [MCP 가이드](mcp/README.md), 전체 명령은 [CLI 가이드](cli/README.md),
  기여는 [CONTRIBUTING.md](CONTRIBUTING.md) — 한국어 이슈와 PR 을 환영합니다.
