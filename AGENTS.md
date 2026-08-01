# AGENTS.md — ontology-atlas

> Canonical contributor guide for AI agents (Claude Code, Cursor, Copilot, Codex, Aider, …) and humans alike. Read once before touching the codebase.

## Project overview

`ontology-atlas` is **a local-first ontology workbench for understanding a product/system from business core to implementation evidence**. The `.md` frontmatter inside the vault *is* the nodes and edges — frontmatter is self-approving, no separate review step. Planners, marketers, C-level decision-makers, developers, and AI agents should be able to read the same graph: business/product domains, capabilities, ownership, dependencies, evidence, and impact. Developers edit via CLI (`ontology-atlas` 52 commands — vault scaffold, agent setup repair, agent-file drift readout, agent activity heartbeat, MCP verify, deterministic graph compile, standard-format interop export, bounded path enumeration, transitive reachability, relation preflight + write, commit preflight, git snapshot, agent handoff, growth/maintenance queue, daily exploration, graph-level deep dive) or web UI (`/ontology`, `/docs`); AI agent (Claude Code, Codex, Cursor) reads/writes the same `.md` files via the `mcp/` MCP server (32 tools). **The macOS app carries that server inside its own bundle** — installing the app installs the agent surface, and the in-app connect button writes the client config with real absolute paths. There is no npm package; environments without the app run the server from a source checkout.

Atlas does not try to replace CodeGraph, grep, AST indexes, language servers,
or source search. Those tools answer structural code questions. Atlas gives
coding agents the durable meaning layer above them: the task starting point,
domain/capability context, implementation evidence, impact boundary, and
verification path that explain why a code artifact matters.

In this project, **ontology** means the executable meaning model of a
business/product and the codebase that realizes it: `project`, `domain`,
`capability`, and `element` nodes plus typed relations that explain intent,
ownership, dependencies, evidence, and impact for humans and AI agents.

**Identity (2026-07): agent-native, human-sovereign.** Not "memory for agents"
(machine-only stores lose to automation scale) and not another wiki (human-only
docs rot instantly). One meaning layer both audiences read and write: agents
are first-class users who keep it fresh through MCP/CLI; humans stay the
arbiters of meaning through plain markdown, git diffs, and their own disk as
the source of truth. The marketing hook opens with the agent pain; the product
substance is the shared layer. Every surface must pass both tests: can an
agent consume it (typed facts, handoff) and can a human read and judge it
(plain language, visual hierarchy)?

**Two surfaces, one folder (2026-07-27 — `docs/DECISIONS.md`).** The macOS app
is the vault's home: the workbench where a person judges the map and connects
the agents. The web is first a **gateway** (open the map with no install —
demo, first five minutes, a shareable link) and second a **second-best
workbench** where no app exists yet (Chromium on Windows/Linux). They do **not
promise the same screens**, and desktop capabilities ship without a web
backfill. What is shared is the folder: same markdown on disk, one parser
contract, and every cross-surface record written inside the vault
(`.ontology-atlas/*.jsonl`). One codebase, one build — the split is the four
capability bridges plus honest degradation, never a fork. Full contract,
including the web smoke gate that keeps the unattended surface alive:
`.claude/rules/surfaces.md`.

**Two gates stand before implementation** — the PO gate for product/UX/graph/
MCP/CLI/workflow/macOS-shell changes, then the design gate for anything visual.
Shipped output is not product progress here unless it improves a real human or
AI-agent ontology workflow. Both are specified under *Working principles* below;
don't start a non-trivial change without them.

For direction, see `docs/PRODUCT-DIRECTION.md`. For features users can use right now, see `docs/FEATURES.md`.

The single guiding principle (v3, R11 fire #25):

> **One product/system, one ontology, that people and their AI agents grow together.**

Markdown frontmatter is the graph. The git repo is the source of truth. No backend. No login. The developer + AI-agent loop keeps the ontology fresh; the macOS app and topology are the shared decision surface for planners, marketers, leadership, developers, and agents.

## Quick start

```bash
pnpm install && pnpm dev          # localhost:3000 — pick a markdown folder and you're in
pnpm checks:changed               # start here: the focused checks for what you touched
```

**There is no setup step.** No `.env`, no auth provider, no backend, no seed data —
if a task seems to need one, the design is wrong (Round 10 removed the optional
Firebase/Auth surface permanently). `package.json` scripts carry the rest; the ones
worth knowing by name are `vault:validate` (frontmatter integrity, also in CI),
`agents:check` (this file's byte budget + agent-file drift), `docs:check`
(generated-surface diff + broken links), and `mcp:build-binary` (compiles the MCP
server into the app bundle).

## Tech stack

Versions live in `package.json` — read it rather than a copy here. What you can't
read off the manifest:

- **`output: 'export'`** — static export, so no server runtime, no API routes, no
  server actions. Every "just add an endpoint" idea is out of bounds.
- **The graph renderer is ours** — a custom canvas-2D engine (`topology-map-v2`),
  not a graph library. Graphology supplies ForceAtlas2 physics only. **xyflow and
  Sigma.js were removed** along with the surfaces that used them; re-adding a graph
  rendering dependency needs a decision record, not a preference.
- **State has no store** — in-memory + React local state + URL state, with IndexedDB
  holding only the vault handle. The vault's markdown is the single source of truth.
- **`/ontology/studio` is the write surface.** The old ERD builder at `/ontology/edit`
  is a redirect.

## Folder map

`src/` is Feature-Sliced Design: `app` (providers) · `views` (pages) · `widgets`
(composite UI) · `features` (interaction units) · `entities` · `shared`.
**Import direction is `app → views → widgets → features → entities → shared`** and
ESLint blocks the reverse. `app/` at the repo root is Next.js routing — thin wrappers only.

What the tree doesn't tell you:

- **`mcp/` and `cli/` are not published to npm** and never will be — the app bundle
  carries the MCP server (`pnpm mcp:build-binary`), and the CLI runs from a source
  checkout. `npx ontology-atlas …` is a 404, not a future feature.
- **`docs/ontology/` is this project's own vault** (we dogfood). `.ontology-atlasignore`
  suppresses external element-ref noise in growth/maintenance plans.
- **`tests/contract/` holds cross-package contracts** — the same fixture run through
  `src/`, `mcp/`, and `scripts/` parsers so they can't drift apart.
- **`.claude/rules/` is mostly *not* auto-loaded** — three rules are resident and five
  load only when you read matching files (`CLAUDE.md` has the table).

## Routes

Seventeen routes, all `[locale]` prefixed by next-intl; in-app links use
`@/i18n/navigation`. The annotated list is `docs/ARCHITECTURE.md` — read it there
rather than from a copy that drifts (it did: three copies existed and all three
disagreed with the filesystem, 2026-07-31).

What you can't derive from `app/[locale]/`:

- **`/` is decided by who is asking** (2026-07-30). A web visitor with no vault gets
  the gateway face — the same view `/download` renders. A web user with a vault, and
  the installed app, get the map / first-run unchanged. **The installed app must never
  offer "download this app" to someone already running it.** Single source:
  `isGatewaySurface()` in `shared/lib/nav-destination`.
- **`/topology` is the map's address, not `/`.** Any link that says "map" points there
  (gate: `tests/contract/map-destination-route.contract.test.ts`).
- **`/ontology` and `/ontology/edit` are redirects**, kept so old bookmarks and
  agent-handoff links land somewhere real instead of a 404.
- **`/ontology/studio` is the write surface** — relation types at fixed compass
  bearings (UP=is_a · DOWN=contains · RIGHT=depends · LEFT=relates), empty ones dashed
  sockets that write a real frontmatter relation when filled.
- **Adding or removing a route needs a `docs/DECISIONS.md` entry in the same change** —
  `pnpm decisions:check` enforces it. Retired namespaces (`/login`, `/signup`,
  `/account`, `/reset-password`, `/settings/*`, `/admin/*`, `/review/*`,
  `/diagnostics/*`, `/knowledge/*`) stay retired; `.claude/rules/forbidden.md` says why.

## Working principles

The detailed rules live in `.claude/rules/*.md` and Claude Code auto-loads them. Other tools should reference the same rules from there.

- **Architecture · FSD boundaries** — `@.claude/rules/architecture.md`
- **Product owner gate** — `@docs/PRODUCT-OWNER-OPERATING-SYSTEM.md`, mandatory before
  feature, UX, graph, MCP, CLI, workflow, or macOS-shell changes. It is this project's
  product authority, not optional strategy prose. Requests shaped as "add X" / "use Y" /
  "make it prettier" get translated into the target user's observable problem *first*;
  a pass that starts from a solution means stop and do discovery. The template, the
  six-row rubric, and the four verdicts live in that file — run `/po-pass` and follow it
  rather than working from memory.
- **Product design gate** — `@docs/PRODUCT-DESIGN-OPERATING-SYSTEM.md`, mandatory for UI,
  visual design, interaction, graph readability, responsive layout, and macOS workbench
  changes. Runs *after* the PO pass: PO decides whether the slice is worth building, this
  decides whether it is good enough to ship. Public references are principle sources only —
  never copy another product's assets or wording.
- **Solo PO pass** — `@.claude/skills/po-pass/SKILL.md` is the **daily** path and the one
  the founding failure actually took: read the ledger, separate phenomenon from problem
  with three discrimination tests, self-score the six rubric rows quoting their anchors,
  and escalate to `/po-council` mechanically when the total is under 18, a fatal zero
  appears, or a trigger is hit. Declaring "해당 없음" on ontology or agent value is **not
  an exemption the author may grant** — that is the steward's review, and it requires the
  council. `pnpm decisions:check` fails any PR that adds or removes a route, or edits the
  MCP/CLI public contract, without appending to the ledger in the same change.
- **User walkthrough** — `@.claude/skills/user-walkthrough/SKILL.md` walks one journey end
  to end against the running build. Its authority is **pattern recognition**, and its
  discipline is naming the pattern — "이 사람은 답답할 것" is invention, "이건 막다른
  CTA 다" is checkable. It judges everything that lives in the artifact and refuses the one
  claim that lives in a person: whether they would want it. The agent journey (a plain
  Claude Code session with only Atlas MCP, timed to the north star) is not a simulation —
  that population *is* the user.
- **PO Council** — `@.claude/skills/po-council/SKILL.md` runs five standing product owners
  (`po-evidence` 근거 · `po-craft` 결 · `po-steward` 지킴이 · `po-wedge` 해자 ·
  `po-leverage` 지렛대) that carry the PO OS's thirteen lenses between them, with
  **every rubric row signed by exactly one of them**. Convene it before expensive or
  hard-to-reverse work — a new or removed surface, a public MCP/CLI/schema contract
  change, direction or positioning, a first public release — or whenever a solo pass
  scores under 18/24 or carries a fatal zero. They research the web, they must open the
  real thing rather than the diff, and none of them may block without naming what to do
  instead. One accountable person decides; the strongest losing argument is recorded with
  the observation that would prove it right. Never for mechanical work.
  `tests/contract/po-council.contract.test.ts` fails the build if a lens loses its owner
  or the wiring drifts.
- **Council head** — `@.claude/agents/chief.md` (`model: fable`) chairs both councils: it
  decides whether to convene at all, which seats, the order (PO first, design second),
  resolves conflict by a *named* rule, and writes the decision record. **It cannot edit
  code** — the failure this repo had was that the party who wanted to build also signed
  the gate. The record is a recommendation; the human owner signs it.
- **Design Council** — `@.claude/skills/design-council/SKILL.md` convenes the eight-seat
  Atlas Designer Bench as callable agents (`design-lead` 위계 · `design-system` 체계 ·
  `design-interaction` 상호작용 · `design-motion` 모션 · `design-infoviz` 도해 ·
  `design-workbench` 작업대 · `design-responsive` 반응형 · `design-handoff` 핸드오프). Convene only the seats a change
  touches; **위계 and 체계 always attend** — one names the attention winner, the other
  turns the decision into tokens, lint rules, and contract tests, because a decision that
  never lands in the design system is one the next person re-makes. Every seat must open
  the built surface rather than judge a diff, cites published principles only, never
  imitates a reference product's assets or wording, and may not block without prescribing
  an alternative. `design-guardian` is the accountable decider and the only one that edits
  code. `tests/contract/design-council.contract.test.ts` fails the build if a seat loses
  its agent, if a model tier or byte budget drifts, or if the skill stops naming the
  instruments the measuring seats must run.
- **Decision ledger** — `@docs/DECISIONS.md` records decisions **and the dissent that
  lost**, with a falsifier for each. Read it before convening a council or writing a solo
  PO pass: if a prior decision covers the same surface, cite it as still standing or
  overturn it explicitly — quietly re-deciding is what the ledger exists to stop. Check
  whether a prior record's falsifier has since been observed; if it has, the losing side
  won and that is where the next pass starts. Append, never rewrite.
- **Gate probe** — `@.claude/skills/gate-probe/SKILL.md` runs whenever a check is added or
  changed. **A gate that only ever passes is indistinguishable from no gate**: measure the
  violation census before switching a rule on, revert the defect to prove it turns red, and
  assert the detector is not idling on an empty set. 2026-08 lost a release to a smoke gate
  whose markers had outlived their components — it had never once checked what it claimed.
- **Design audit** — `@.claude/skills/design-audit/SKILL.md` runs after a front-end change,
  before calling it done. It **measures** the rendered DOM (rect intersections, dimension
  variance across repeated sets, computed styles vs the ramps) and uses screenshots only as
  evidence. A few pixels of misalignment is not something anyone — human or model —
  reliably localises by looking; if it is not measured it cannot be prescribed, so
  "looks fine" is not a verification.
- **Design Guardian** — `@.claude/agents/design-guardian.md` is the standing senior design reviewer for UI work. Use it, or an equivalent sub-agent when available, before and after meaningful Relief/Topology design changes. It rejects token drift, attention-layer collisions, hidden typed facts, decorative motion, browser-only desktop proof, and reference copying. It approves only token-backed changes with screenshot/WebView evidence and installed-app proof when desktop behavior is affected.
- **Design system** — neutrals + a single indigo, forbidden patterns — `@.claude/rules/design.md` · `@docs/DESIGN-SYSTEM.md`.
  **규격은 문서가 아니라 lint 가 강제한다** (`eslint.config.mjs` 의
  `no-restricted-syntax`) — 새 규격을 문서에 쓰면 같은 PR 에서 룰도 넣는다.
  단 **룰을 켜기 전에 위반을 전수 측정한다**: 한 PR 로 못 치우는 규모의 룰은
  강제가 아니라 소음이고 기존 신호까지 덮는다. 절차와 실측 사례는 `design.md`
  "규격은 lint 로 강제된다" 절.
- **Git workflow** — conventional prefix + Korean (or English) body — `@.claude/rules/git.md`
- **Testing & verification** — TDD-first, unit → e2e — `@.claude/rules/testing.md`
- **Local-first** — vault folder only, no backend — `@.claude/rules/local-first.md`
- **Surface contract (web / app)** — `@.claude/rules/surfaces.md`
- **Forbidden patterns / Do-Not list** — `@.claude/rules/forbidden.md`
- **Documentation discipline** — `@.claude/rules/documentation.md`. One rule decides
  what CI may check about a document (2026-08-01, `docs/DECISIONS.md`): **only what a
  machine can generate.** Never pin a sentence a human wrote — 90% of the old contract
  suite did, and it caught nothing while breaking on every rewrite. Derive instead
  (`pnpm docs:surface:check` regenerates the MCP/CLI surface and diffs it, then checks
  the READMEs name every registered tool and command) and check referential integrity
  (`pnpm docs:links`).

## Context and token budget

Use the smallest sufficient context. Prefer precise structural tools and compact summaries over broad file reads or pasted output.

**This file has a hard byte budget.** Codex caps it at `project_doc_max_bytes`
(32 KiB default) and **silently drops everything past the cap** — no warning,
mid-sentence. So anything added here pushes something else off the end for one
of our two named agents. `pnpm agents:check` fails the build when we exceed it;
keep detail in the file that owns it and leave a pointer here.
([Codex AGENTS.md](https://developers.openai.com/codex/guides/agents-md) ·
[skills](https://developers.openai.com/codex/skills) are the progressive-disclosure
mechanism this budget assumes.)

- Keep stable instructions stable and near the top so providers reuse cached prefixes.
- Start structural repo work with CodeGraph, then open only the exact files or symbols still needed.
- Ask the ontology only focused questions (`get_concept`, `find_path`, `query_ontology` with narrow operations). Avoid full `list_concepts` dumps unless the task genuinely needs the whole vault.
- Verify focused-first. Start with `pnpm checks:changed` (or `pnpm checks:changed -- <path...>`) and direct sibling/unit/contract checks for touched paths. Escalate to full `pnpm test:run`, `pnpm lint`, `pnpm build`, broad Playwright, or desktop packaging only when shared contracts, routing, config, release surfaces, or user-facing workflows changed, or when focused checks leave a concrete risk uncovered.
  - **It is also the *last* command before you open a PR** — run what it recommends for
    every path you touched, not a list you wrote from memory. A hand-written list is
    always narrower than the tool, and it only ever errs narrow: 2026-08-01 lost three
    CI rounds to exactly this (docs edited without regenerating the vault, a fourth
    version site missed, a smoke marker outliving its component) and the tool would
    have named the right check in all three. **When you brief someone else, point at
    the command — never enumerate the checks for them.**
- Summarize large command output before carrying it forward. Preserve decisions, failing lines, metrics, and file paths; drop progress bars, repeated logs, and boilerplate.
- **Don't delegate what you can finish in a handful of tool calls, and don't spawn a
  subagent to double-check your own work.** A subagent earns its cost by *isolating
  context* — it burns tokens privately and hands back a short answer. Re-verification
  is not that. The councils are the deliberate exception, and their point is
  **independence** (the party that wants to build must not sign the gate), not extra
  verification passes.
- Use memory as an index, not a transcript: search the registry, open only the one or two relevant notes, and verify drift-prone facts live.
- Do not run or add hooks that inject long dynamic context. SessionStart hooks must stay concise; PreToolUse hooks should block risky actions only, not record routine activity.
- Mention residual uncertainty instead of loading more context reflexively.

## Code intelligence — CodeGraph (optional, any agent)

If your client has the `codegraph` MCP/CLI (colbymchenry's — one `codegraph
install` wires Claude Code and Codex CLI alike), structural questions start
there. The agent guide with measured boundaries is
`.claude/rules/codegraph.md` — Claude Code auto-loads it; other agents open
that file once before first use. The habits: query
`codegraph_explore` with exact symbol names, never prose sentences; treat
returned source as already read; before a rename/delete run
`callers`/`impact` plus one grep for comments; when tests break, CLI
`codegraph affected <files>` names the affected test files — cross-check with
`pnpm checks:changed`. Worktrees index separately (`codegraph init .`, ~4s
here; `.codegraph/` is gitignored). If results look stale, `codegraph status`
lists them under "Pending Changes".

No codegraph in your client? Ignore all of this silently — `grep -rn` + Read
answers the same questions, and `pnpm checks:changed` picks the tests.

## 🚫 npm publish guard

`npm publish` / `pnpm publish` / `yarn publish` is **never** run automatically. PreToolUse hooks in `.claude/settings.json` / `.codex/hooks.json` block it; `.claude/rules/forbidden.md` documents why. Only execute publish commands when the user explicitly asks. Even then, run `npm pack --dry-run` first to audit the tarball.

## Source-of-truth files

When docs and code disagree, the code wins. For framework / build / routing facts, trust these three:

- `package.json`
- `next.config.ts`
- `app/layout.tsx`

Long-form docs:

- `@docs/FOUNDATIONS.md` — **what grounds the product**: citable ontology theory, the
  agent-memory / LLM×KG landscape, code-knowledge-graph precedents, and the cited design
  lineage, all web-verified. Read before naming / positioning / design decisions.
- `@docs/PRODUCT-DIRECTION.md` — mission direction
- `@docs/FEATURES.md` — features users can use right now
- `@docs/ARCHITECTURE.md` · `@docs/DESIGN-SYSTEM.md`
- `@docs/CHANGELOG.md` — chronological user-visible changes
- `@mcp/README.md` — MCP tool registration + usage (the AI agent's surface)
- `@docs/archive/` — historical analysis docs (no longer normative)

(The two operating-system gates are listed under *Working principles* above — this
section does not repeat them.)

## This project's own ontology

This project describes its own mental model in `docs/ontology/` as frontmatter markdown (dogfooding — we describe ourselves in our own data format).

- Entry points: `docs/ontology/README.md` · `docs/ontology/ontology-atlas.md`
- Census: `node cli/src/index.mjs overview` — **no document writes the number, and
  CI does not count nodes** (2026-08-01, owner call — `docs/DECISIONS.md`). A pinned
  count rots silently (it did: 97 → 98 went unnoticed), and every gate that *checked*
  such a count made a person re-derive it by hand after any vault edit. Both the
  numbers and the gates are gone; docs name the command instead. What is still gated
  is the copy the **app renders on screen** — but by a runtime assertion, not a pinned
  number: `DownloadPage.test.tsx` requires the caption to equal the graph it draws,
  and both come from one hook, so nobody maintains it.
- AI agents query it via the `mcp/` MCP server — registration guide in `mcp/README.md`, example in `.mcp.json.example`
- When you discover a new domain / capability / element, add it to the same directory (with the MCP `add_concept` tool, or by hand)

## Working with the ontology while you code

The vault is the **shared mental model** between the developer and the AI agent. Treat reading and writing the ontology as part of any non-trivial code task — not as a separate chore. Two patterns:

**Read at the start of a task** (cheap, often skipped). Before opening a feature you don't fully know, ask the vault:

- `list_kinds` — what's in the codebase, by kind?
- `list_concepts` (filter by kind / project) — full node table
- `get_concept(slug)` — fetch the node + its neighbors before extending it
- `find_backlinks(slug)` — who depends on this? (run *before* you rename or merge)
- `find_path(from, to)` — does a relation already exist?

A 30-second read at the top of the task often replaces a 10-minute re-discovery in the code.

**Three ingress paths, three skills.** Each carries its own protocol — read the
skill rather than a summary here (that is what progressive disclosure is for).
Both `.claude/skills/<name>/SKILL.md` and `.agents/skills/<name>/SKILL.md` hold
the same file; `pnpm agents:check` fails if the two copies drift.

| Input | Skill | When |
|---|---|---|
| Cold start — fresh `init`, only the 5 starter nodes | `/ontology-bootstrap` | Don't make the user hand-author every node. Proposes from evidence, writes nothing until they accept |
| A code change you just made | `/ontology-sync` | The end-of-task loop below |
| Prose — meeting note, PR description, RFC | `/ontology-extract` | Duplicate avoidance is the primary value; hallucinated nodes are the failure mode |

All three share one rule: **only confirmed candidates land.** The proposal step
never writes to the vault.

**Write at the end of a task** (the part that's easy to skip). When a unit of work introduced a new capability / element / domain, or renamed/folded an existing one, mirror the change in the vault:

- new node → `add_concept(slug, kind, title, domain?, …)` — frontmatter is auto-normalized per kind, body defaults to a kind-specific starter, and missing strongly-expected fields come back as `warnings` so you know what to follow up. If a node with the same title already exists, a near-duplicate `warning` is included too — `patch_concept` the existing node instead of forking a duplicate (duplicates are the #1 growing-vault failure mode)
- new edge between existing nodes → `add_relation(from, to, type)`
- node moved or renamed in code → `rename_concept(oldSlug, newSlug)` (dry-run first, then `confirm: true`) — atomically rewrites every backlink
- two near-duplicates collapse → `merge_concepts(fromSlug, intoSlug)` (same dry-run pattern)
- existing node refined → `patch_concept(slug, frontmatter, body, expected_mtime)` — pass `expected_mtime` from a prior `get_concept` so a concurrent human edit isn't silently overwritten

For the explicit "I'm done with this task — please sync the ontology now" loop, invoke the **`/ontology-sync`** skill (see `.claude/skills/ontology-sync/SKILL.md` or `.agents/skills/ontology-sync/SKILL.md`). It bundles the read-then-write pattern with a checklist for when to skip (typos, style nudges).

For the *implicit* "I just opened this repo" loop, the **SessionStart hook** at `.claude/hooks/inject-ontology-summary.sh` or `.codex/hooks/inject-ontology-summary.sh` runs once when Claude Code/Codex attaches to the workspace and injects only a compact vault census plus drift warning. Keep this hook terse: it exists to prevent a full `list_concepts` round trip, not to preload the whole ontology. PreToolUse hooks are limited to the npm publish guard; routine agent-activity heartbeats are intentionally not registered because they add per-command overhead without improving model context.

**Skip the ontology** for: typo fixes, comment tweaks, single-line style nudges, lint config, test fixtures with no shape change. Anything that changes "what the codebase *is*" goes into the vault; anything that doesn't, stays out.

## Frontmatter shape per kind (R14)

When an AI agent (`add_concept`) or a developer (`ontology-atlas add` / `ontology-atlas import`) creates a new node, the frontmatter is normalized per `kind` so external `.md` ingestion stays consistent. See `mcp/README.md` for the full table and `mcp/src/schema.mjs` (mirror at `cli/src/lib/schema.mjs`) for the source. Contract test: `tests/contract/vault-schema.contract.test.ts`. Validator surfaces missing strongly-expected fields (e.g. capability/element without `domain:`) as the `missing-expected-field` warning — advisory only, not a hard error, so pre-existing vaults still pass.

노드 이름은 어권별로 병기할 수 있다 — `display_ko` / `display_en` 같은
`display_<locale>` 키를 쓰면 화면 언어에 맞는 이름이 지도·INDEX·팝오버에
그려진다(`title` 은 검색/매칭의 단일 진실원이라 바뀌지 않는다). MCP 는
`add_concept({ labels: { ko, en } })`, 사람은 지도 컴포저의 어권별 이름
칸으로 쓴다. **vault 가 쓰는 로케일은 전부 채운다** — 한쪽만 채우면 다른
언어 사용자에게 원문 title 이 그대로 노출된다(MCP 는 warning, 폼은 현재
화면 언어 칸 필수).

`ontology-atlas import <path...>` is the bulk path: hand it your own `.md` (single file, directory, or many) and each file is run through the same schema before landing in the vault. Frontmatter `kind`/`slug`/`title` win when present; `--kind` is the fallback, the first `# H1` is the title fallback, `--auto-prefix` / `--rename` / `--dry-run` cover the typical conflict cases. Same shape as `add_concept` / `add` — one schema, three entry points.

### Project containment is implicit (no `project:` key needed)

Frontmatter does **not** require an explicit `project:` key. The runtime (`derivationToInsight`) walks the `contains` / `belongs_to` graph from each `kind: project` root and stamps every descendant (domain / capability / element) with that project's slug as a `projectIds` entry. So:

- write `kind: capability` with `domain: foo` and the project containment falls out automatically (capability → domain → project, all wired via `contains`)
- `/projects` card fact strips, `/ontology/insights` per-project bars, and cross-project edge counts all derive from this BFS — no manual stamping

A vault with no `kind: project` doc still works (no containment, all nodes orphans in project terms). When you eventually add the project doc, all existing descendants pick up `projectIds` on the next derive — no migration.

## CLAUDE.md / AGENTS.md sync

- **AGENTS.md** (this file) is canonical — the cross-tool standard.
- **CLAUDE.md** imports AGENTS.md and only adds Claude-Code-specific bits (skills, hooks).
- When you change one, sync the other — or just keep CLAUDE.md's `@AGENTS.md` import and they stay consistent automatically.
