# AGENTS.md — ontology-atlas

> Canonical contributor guide for AI agents (Claude Code, Cursor, Copilot, Codex, Aider, …) and humans alike. Read once before touching the codebase.

## Project overview

`ontology-atlas` is **a local-first ontology workbench for understanding a product/system from business core to implementation evidence**. The `.md` frontmatter inside the vault *is* the nodes and edges — frontmatter is self-approving, no separate review step. Planners, marketers, C-level decision-makers, developers, and AI agents should be able to read the same graph: business/product domains, capabilities, ownership, dependencies, evidence, and impact. Developers edit via CLI (`ontology-atlas` 52 commands — vault scaffold, agent setup repair, agent-file drift readout, agent activity heartbeat, MCP verify, deterministic graph compile, standard-format interop export, bounded path enumeration, transitive reachability, relation preflight + write, commit preflight, git snapshot, agent handoff, growth/maintenance queue, daily exploration, graph-level deep dive) or web UI (`/ontology`, `/docs`); AI agent (Claude Code, Codex, Cursor) reads/writes the same `.md` files via the `mcp/` MCP server (32 tools).

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

Before product, UX, graph, MCP, CLI, workflow, or macOS-shell changes, apply
the mandatory PO gate in `docs/PRODUCT-OWNER-OPERATING-SYSTEM.md`. Write the
compact PO pass before editing files unless the work is a clearly mechanical
maintenance exception. This repo does not treat shipped output as product
progress unless the change improves a clear human or AI-agent ontology workflow.
If an agent cannot name the observed phenomenon, user problem, user moment,
current alternative, ontology value, agent value, simplification, and
verification plan, it must stop and do product discovery instead of
implementing. Solution ideas come after the problem is understood. Requests
phrased as "add X," "use Y," or "make it prettier" must be translated into the
target user's observable problem before work starts. End non-trivial product
passes with a PO verdict: `Do not build`, `Investigate first`, `Shape a slice`,
or `Build and verify`; use the PO rubric to reject weak problem insight,
generic differentiation, missing agent value, or verification that does not
match the shipped surface.
For UI, visual design, interaction, responsive layout, graph readability, or
macOS workbench changes, also apply the design gate in
`docs/PRODUCT-DESIGN-OPERATING-SYSTEM.md` after the PO pass. PO decides whether
the slice is worth building; the design gate decides whether the surface
hierarchy, graph semantics, responsive behavior, and agent handoff are good
enough to ship. Relief/Topology changes must also name the attention layer
model, 14-inch fullscreen collision rule, state contract, MCP/CLI handoff, and
installed-app proof before implementation.
For direction, see `docs/PRODUCT-DIRECTION.md`. For features users can use right now, see `docs/FEATURES.md`.

The single guiding principle (v3, R11 fire #25):

> **One product/system, one ontology, that people and their AI agents grow together.**

Markdown frontmatter is the graph. The git repo is the source of truth. No backend. No login. The developer + AI-agent loop keeps the ontology fresh; the macOS app and topology are the shared decision surface for planners, marketers, leadership, developers, and agents.

## Quick start

```bash
pnpm install
pnpm dev                          # http://localhost:3000 — pick a markdown folder and you're in
pnpm test:run                     # vitest unit suite
pnpm test:contracts               # focused cross-package contract suite
pnpm exec tsc --noEmit
pnpm lint
pnpm build                        # static export → out/
pnpm vault:validate               # frontmatter integrity (R11 — runs in CI too)
pnpm test:vault:validate          # focused validator CLI argument contract
pnpm vault:audit                  # capability/element path drift guard (R12)
pnpm test:vault:audit             # focused vault audit CLI argument contract
pnpm vault:migrate --list         # see registered schema migrations (R11)

# AI agent (Claude Code) auto-registers via this repo's `.mcp.json` — `mcp/README.md` has details.
```

No `.env`, no auth provider, no backend setup needed. Round 10 (2026-05) permanently removed the optional Firebase / Firestore / Auth surface — the OSS is now pure local-first.

## Tech stack

- **Framework** Next.js 16 · App Router · `output: 'export'`
- **Language** TypeScript 5
- **Style** Tailwind CSS 4 (`@theme` CSS-based tokens)
- **i18n** next-intl 4.11 with `/[locale]/` URL prefix (en / ko)
- **Visualization** Custom canvas-2D engine (`topology-map-v2`) for `/`, `/topology` · Graphology ForceAtlas2 (physics) · `/ontology/studio` (공방 / Compass Stage) is the write surface — the old xyflow ERD builder at `/ontology/edit` was RETIRED 2026-07-24 (the workshop covers assemble/connect/preview/write; `@xyflow/react` dependency removed). Sigma.js 는 folder-topology 미니맵 삭제(2026-07 P5)와 함께 의존성까지 제거
- **Local-first** File System Access API + IndexedDB (vault handle persistence)
- **AI agent** `@modelcontextprotocol/sdk` (stdin/stdout JSON-RPC server, `mcp/` package)
- **State** in-memory + IndexedDB (vault handle) · React local state · URL state
- **Architecture** Feature-Sliced Design (ESLint boundaries enforce import direction)
- **Test** Vitest + Testing Library + jsdom · Playwright (E2E)
- **Lint** ESLint 9 flat config
- **Package** pnpm

## Folder map

```
app/                       Next.js routes (thin wrappers)
src/                       FSD layers
  ├── app/                 providers · initialization
  ├── views/               page-level components
  ├── widgets/             composite UI
  ├── features/            interaction units
  ├── entities/            business entities
  └── shared/              UI · lib · config primitives
mcp/                       MCP server (the AI agent's surface) — npm pkg, 32 tools
cli/                       CLI binary (developer's daily entry point) — npm pkg, 52 commands
                           init / agent-setup / agent-files / add / import / list / find / validate / mcp-verify / query / compile / export
                           analyze / infer-imports / bootstrap / preflight / snapshot
                           backlinks / orphans / path / explain / all-paths / reachability / relation-check / relate / rename / merge / delete
                           match-nodes / match-edges / domain-matrix / facets / schema / pattern-walk / project-map
                           overview / hubs / blast-radius / cycles / components / topological-order / health
                           agent-brief / workspace-brief / growth / maintenance / node / similar
docs/                      long-form docs
docs/ontology/             this project's own ontology vault (dogfood — 96 nodes)
                           `.ontology-atlasignore` (gitignore-style) suppresses external
                           element ref noise in growth_plan / maintenance_plan
tests/                     Vitest unit + Playwright E2E
  └── contract/            cross-package contract tests (parser 4-way, validator 3-way)
scripts/                   vault tooling (R11) + perf baseline (R11) + dogfood walk (R12)
                           build-docs-vault · validate-vault · migrate-vault
                           dogfood-mcp-walk · perf-vault · perf-graph
.claude/rules/             granular working rules (auto-loaded)
```

**Import direction**: `app → views → widgets → features → entities → shared`. ESLint blocks the reverse.

## Routes

```
/                          topology hub always (map + INDEX + datasheet) — with no vault selected it renders
                           this project's own dogfood sample plus a first-run starter in the INDEX panel
                           (root-first-open 2026-07 — no separate marketing landing page)
/topology                  same topology hub, explicit entry point (canvas-2D map/graph engine)
/projects                  project list (vault frontmatter `kind: project` docs)
/project/[slug]            project detail (inline edit when vault is loaded)
/project/[slug]/edit       full project editor
/project/new               new project form
/docs                      vault picker / editor / unified palette
/ontology                  thin redirect → /topology?index=expanded (B3 허브가 곧 지도 — the old tree/ego hub is retired)
/ontology/edit             RETIRED (2026-07-24) — the xyflow ERD builder was removed once the
                           workshop covered assemble/connect/preview/write. Now a thin client
                           redirect to /ontology/studio (forwarding any ?node= deep-link) so
                           old bookmarks/agent-handoff links land in the workshop, not a 404.
/ontology/studio           공방 (Compass Stage) — the vault write surface, restrained
                           (no game energy; the old `--studio-*` glow/gem exception was RETIRED
                           2026-07-24 — fable verdict B + owner: "게임처럼 중독되게" was a
                           metaphor, and loot aesthetics eroded trust in decision material).
                           One surface, two fill-states, no mode tabs: relation types nailed to
                           fixed compass bearings (UP=상위개념/is_a · DOWN=담는것/contains ·
                           RIGHT=기대는곳/depends · LEFT=비슷한것/relates); missing relations are
                           dashed line-art sockets you fill via an inline anchored picker (near-dup
                           suggestion + "새로 만들기" bridge) — filling writes a real frontmatter
                           relation (or an MCP packet in a read-only vault). ENHANCE = a partially
                           filled existing node (opened via `?node=`); CREATE (`?mode=create`) = the
                           same surface all-empty (kind/name/domain/definition draft card). Completion
                           reads from the center card's 4-side border + a plain progress caption;
                           addictiveness comes from the loop, not bling. is_a is a real `broader`
                           (SKOS) relation added across derive/schema/validator.
/ontology/insights         graph insights (kind census · hubs · relation breakdown)
/download                  macOS desktop app download (DMG)
```

> Round 10 (2026-05) permanently removed: `/login`, `/signup`, `/account`, `/reset-password`, `/settings/*`, and earlier rounds had already removed `/admin/*`, `/review/*`, `/diagnostics/*`, `/knowledge/*`. Cloud entity API, Firestore subscribers, manual node/edge cloud modals, screenshot uploader (Firebase Storage) are all gone. Future cloud collab features will be re-designed when sponsorship / collaboration requests come.

All routes are `[locale]` prefixed by next-intl; in-app links use `@/i18n/navigation`.

## Working principles

The detailed rules live in `.claude/rules/*.md` and Claude Code auto-loads them. Other tools should reference the same rules from there.

- **Architecture · FSD boundaries** — `@.claude/rules/architecture.md`
- **Product owner gate** — `@docs/PRODUCT-OWNER-OPERATING-SYSTEM.md` is mandatory before feature, UX, graph, MCP, CLI, workflow, or macOS-shell changes. Start with the observed phenomenon and user problem, then the user moment, current alternative, ontology value, agent value, simplification, and verification plan; write a compact PO pass before implementation; ship outcomes, not output lists. Translate solution-shaped requests into observable problems first, then end with a PO verdict (`Do not build`, `Investigate first`, `Shape a slice`, or `Build and verify`) and use the PO rubric before coding. If the pass starts from a solution instead of evidence, pause and do discovery. Treat this as the project's product-owner authority, not as optional strategy prose.
- **Product design gate** — `@docs/PRODUCT-DESIGN-OPERATING-SYSTEM.md` is mandatory for UI, visual design, interaction, graph readability, responsive layout, and macOS workbench changes. Use it after the PO pass to name the design council lens, surface hierarchy, graph semantics, responsive contract, agent handoff contract, and installed-app proof. Public references are principle sources only; never copy proprietary assets or styling.
- **Design Guardian** — `@.claude/agents/design-guardian.md` is the standing senior design reviewer for UI work. Use it, or an equivalent sub-agent when available, before and after meaningful Relief/Topology design changes. It rejects token drift, attention-layer collisions, hidden typed facts, decorative motion, browser-only desktop proof, and reference copying. It approves only token-backed changes with screenshot/WebView evidence and installed-app proof when desktop behavior is affected.
- **Design system** — neutrals + a single indigo, forbidden patterns — `@.claude/rules/design.md` · `@docs/DESIGN-SYSTEM.md`.
  **디자인 규격은 md 뿐 아니라 `eslint.config.mjs` 의 `no-restricted-syntax` 로
  강제된다** (타입 램프 · radius 램프 · 그림자 사다리 · 금지 그라디언트). 새
  규격을 문서에 쓰면 **같은 PR 에서 룰도 넣는다** — 룰 없는 규격은 지켜지지
  않는다(2026-07-26 실측: 그림자 사다리가 문서에만 있어 하드코딩 5건이 살아
  있었다). 단, **룰을 켜기 전에 위반을 패턴별로 분류하고 한 PR 로 치환 가능한
  규모인지 측정한다** — 수백 건 warning 을 만드는 룰은 강제가 아니라 소음이고
  기존 신호까지 덮는다. 절차는 `design.md` "규격은 lint 로 강제된다" 절.
- **Git workflow** — conventional prefix + Korean (or English) body — `@.claude/rules/git.md`
- **Testing & verification** — TDD-first, unit → e2e — `@.claude/rules/testing.md`
- **Local-first** — vault folder only, no backend — `@.claude/rules/local-first.md`
- **Forbidden patterns / Do-Not list** — `@.claude/rules/forbidden.md`
- **Documentation discipline** — `@.claude/rules/documentation.md`

## Context and token budget

Use the smallest sufficient context. Prefer precise structural tools and compact summaries over broad file reads or pasted output.

Official OpenAI basis: [Codex AGENTS.md](https://developers.openai.com/codex/guides/agents-md) loads before work and is capped by `project_doc_max_bytes` (32 KiB default); [Codex skills](https://developers.openai.com/codex/skills) use progressive disclosure; [Codex MCP](https://developers.openai.com/codex/mcp) server instructions should keep the first 512 characters self-contained; [Codex hooks](https://developers.openai.com/codex/hooks) run inside the agent lifecycle; [Codex memories](https://developers.openai.com/codex/memories) are useful local recall but not the source of required team rules. OpenAI API guidance also recommends using fewer input/output tokens, doing less serial work, keeping stable prompt content first, and adding dynamic context later to improve [latency](https://developers.openai.com/api/docs/guides/latency-optimization) and [prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching).

- Keep stable instructions stable and near the top of prompts/files so model providers can reuse cached prefixes.
- Start structural repo work with CodeGraph, then open only the exact files or symbols still needed.
- Ask the ontology only focused questions (`get_concept`, `find_path`, `query_ontology` with narrow operations). Avoid full `list_concepts` dumps unless the task genuinely needs the whole vault.
- Verify focused-first. Start with `pnpm checks:changed` (or `pnpm checks:changed -- <path...>`) and direct sibling/unit/contract checks for touched paths. Escalate to full `pnpm test:run`, `pnpm lint`, `pnpm build`, broad Playwright, or desktop packaging only when shared contracts, routing, config, release surfaces, or user-facing workflows changed, or when focused checks leave a concrete risk uncovered.
- Summarize large command output before carrying it forward. Preserve decisions, failing lines, metrics, and file paths; drop progress bars, repeated logs, and boilerplate.
- Use memory as an index, not a transcript: search the registry, open only the one or two relevant notes, and verify drift-prone facts live.
- Do not run or add hooks that inject long dynamic context. SessionStart hooks must stay concise; PreToolUse hooks should block risky actions only, not record routine activity.
- Mention residual uncertainty instead of loading more context reflexively.

## Code intelligence — CodeGraph

CodeGraph builds a semantic knowledge graph of codebases for faster, smarter code exploration. This is tool-agnostic — any agent with the `codegraph` MCP server configured should follow it. The local index lives in `.codegraph/` (gitignored — it is a SQLite db + a live daemon socket, never committed).

### If `.codegraph/` exists in the project

**CodeGraph is mandatory for structural work in this repo.** Before reading source files for feature work, bug fixes, refactors, architecture questions, or impact analysis, use the matching CodeGraph tool first. Native `rg` / file reads are allowed after that for literal strings, docs, config, generated assets, or when CodeGraph explicitly lacks the detail needed.

**Answer directly with CodeGraph — don't delegate exploration to a file-reading sub-agent or a grep/read loop.** CodeGraph *is* the pre-built search index; re-deriving its answers with grep + Read repeats work it already did and costs more for the same result. For "how does X work?", architecture, trace, or where-is-X questions, answer in a handful of CodeGraph calls and stop — typically with **zero file reads**. The returned source is complete and authoritative: treat it as already read and do not re-open those files. Reach for raw Read/Grep only to confirm a specific detail CodeGraph didn't cover.

Mandatory starting points:

- New task / unfamiliar feature area → `codegraph_context`
- Flow question → `codegraph_trace`
- Symbol lookup → `codegraph_search`
- Impact before editing shared code → `codegraph_impact`
- Directory or file inventory → `codegraph_files`
- Index freshness / suspected lag → `codegraph_status`

**Tool selection by intent:**

| Tool | Use For |
|------|---------|
| `codegraph_context` | Map a task / feature / area first — composes search + node + callers + callees in one call |
| `codegraph_trace` | "How does X reach Y" — the call path, each hop's body inline (follows dynamic-dispatch hops grep can't) |
| `codegraph_explore` | Survey several related symbols' source in ONE budget-capped call |
| `codegraph_search` | Find a symbol by name |
| `codegraph_callers` / `codegraph_callees` | Walk call flow one hop at a time |
| `codegraph_impact` | Check what's affected before editing |
| `codegraph_node` | Get a single symbol's source / signature |

A direct CodeGraph answer is a handful of calls; a grep/read exploration is dozens.

### If `.codegraph/` does NOT exist

At the start of a session, ask the user if they'd like to initialize CodeGraph:

"I notice this project doesn't have CodeGraph initialized. Would you like me to run `codegraph init -i` to build a code knowledge graph?"

## 🚫 npm publish guard

`npm publish` / `pnpm publish` / `yarn publish` is **never** run automatically. PreToolUse hooks in `.claude/settings.json` / `.codex/hooks.json` block it; `.claude/rules/forbidden.md` documents why. Only execute publish commands when the user explicitly asks. Even then, run `npm pack --dry-run` first to audit the tarball.

## Source-of-truth files

When docs and code disagree, the code wins. For framework / build / routing facts, trust these three:

- `package.json`
- `next.config.ts`
- `app/layout.tsx`

Long-form docs:

- `@docs/FOUNDATIONS.md` — **what grounds the product**: citable ontology theory (Gruber · Studer/Fensel · W3C RDF/OWL/SKOS), the agent-memory / LLM×KG landscape (MemGPT · Zep · GraphRAG · Pan et al.), code-knowledge-graph precedents (Code Property Graphs · Glean · CodeQL), and the cited design lineage (Rams · Tufte · Linear). All references web-verified. Read before naming / positioning / design decisions.
- `@docs/PRODUCT-OWNER-OPERATING-SYSTEM.md` — mandatory PO gate for deciding whether feature, UX, graph, MCP, CLI, or workflow work is worth doing, how to shape it, when to simplify, and how to verify the outcome.
- `@docs/PRODUCT-DESIGN-OPERATING-SYSTEM.md` — mandatory design gate for Relief/Topology surface hierarchy, interaction states, graph semantics, responsive behavior, macOS workbench quality, and MCP/CLI handoff readability.
- `@docs/PRODUCT-DIRECTION.md` — mission direction
- `@docs/FEATURES.md` — features users can use right now
- `@docs/ARCHITECTURE.md` · `@docs/DESIGN-SYSTEM.md`
- `@docs/CHANGELOG.md` — chronological user-visible changes
- `@mcp/README.md` — AI agent partner (MCP 32 tools — read 19 + write 13) registration + usage
- `@docs/archive/` — historical analysis docs (no longer normative)

## This project's own ontology

This project describes its own mental model in `docs/ontology/` as frontmatter markdown (dogfooding — we describe ourselves in our own data format).

- Entry points: `docs/ontology/README.md` · `docs/ontology/project.md`
- 96 nodes (capability 38 · document 3 · domain 6 · element 47 · project 1 · vault-readme 1)
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

**Bootstrap an empty vault** (R16). When a user just ran `ontology-atlas init` on a fresh repo and the vault has only the 5 starter nodes, don't make the user hand-author every node. Use the **`/ontology-bootstrap`** skill (`.claude/skills/ontology-bootstrap/SKILL.md` or `.agents/skills/ontology-bootstrap/SKILL.md`):

- It calls `index_project` for evidence, then calls `analyze_repo_structure` with the complete meaning `proposal`. **Side effect 0** — semantic evidence carries `trust`/`riskFlags`; the round-trip `proposalValidation` checks definitions, citations, risk controls, confidence, domain placement, and competency answers. Require `canWrite:true` before user approval and any write. Vault NOT modified.
- It separates observed source/import facts from proposed meanings and persisted shared concepts. Every proposed domain/capability needs a definition, includes/excludes boundary, citation, confidence, counterexample check, and competency-question coverage; folders/packages remain element evidence unless product meaning is independently supported.
- Shows the evidence-backed proposal compactly, lets the user accept / select / refine, then lands only accepted concepts and relations via `add_concepts` / `add_relations`. Single source of truth preserved — only the user (via your subsequent calls) writes to the vault.
- Companion to `/ontology-sync` (incremental, post-bootstrap) and `/ontology-extract` (prose ingress).

**Extract from prose** (R+). When the user shares a meeting note, PR description, RFC draft, or any prose paragraph and asks to "extract ontology from this" or similar, use the **`/ontology-extract`** skill (`.claude/skills/ontology-extract/SKILL.md` or `.agents/skills/ontology-extract/SKILL.md`):

- Cross-checks the prose against the existing vault via `find_evidence` / `similar_nodes` first — duplicate avoidance is the primary value.
- Proposes a small set of candidate nodes/edges (typically 0–3 per paragraph). Asks the user to pick which to land *before* writing.
- Only confirmed candidates land via `add_concept` / `add_concepts` / `patch_concept` / `add_relation`. Hallucinated nodes are the failure mode; the prose-source quote in the body is the audit trail.
- Distinguishes itself from `/ontology-sync` (code change input) and `/ontology-bootstrap` (cold start) — *three ingress paths* (code / code-change / prose) for the same vault.

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
