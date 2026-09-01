# AGENTS.md — ontology-atlas

> Canonical contributor guide for people and AI agents. Read it before changing
> the repository; use the linked authority for detail rather than duplicating it.

## Product and non-negotiable architecture

Ontology Atlas is a local-first codebase ontology for understanding what code
builds, why it is structured that way, and what changes affect, across product
meaning and implementation evidence. Vault Markdown frontmatter is the graph;
Git is the source of truth, and people judge meaning through files and
diffs. Agents use the same vault through MCP/CLI. The macOS app carries its MCP
server; source checkouts run it directly. There is no npm package.

Atlas complements CodeGraph, grep, AST indexes, language servers, and source
search. Those tools answer structural questions; Atlas provides the durable
meaning layer: task starting point, domain/capability context, evidence, impact
boundary, and verification path.

The public meta-model belongs only in `docs/ONTOLOGY-ATLAS-SPEC.md` §2/§5.
Do not create competing kind or relation glossaries. The product is
agent-native and human-sovereign: every surface must be consumable as typed
facts by an agent and readable and judgeable by a human.

The app is the vault's home and the web is a gateway or second-best workbench.
They share one folder, parser contract, and vault-local records; they do not
promise identical screens. Keep degradation honest.

> **One codebase ontology, maintained by people and AI agents.**

No backend, login, auth provider, environment setup, seed data, API routes, or
server actions belong here. `output: 'export'` is intentional.

## Start here

```bash
pnpm install && pnpm dev
pnpm --dir mcp install
pnpm checks:changed
```

Re-run `pnpm --dir mcp install` after a pull that changes
`mcp/package.json`; root installation does not update `mcp/node_modules`.
Start verification with `pnpm checks:changed`; `-- --run` runs every
recommendation and stops on the first failure. Do not hand-pick its list.

Read versions from `package.json`. The graph renderer is the custom
canvas-2D `topology-map-v2` engine; Graphology supplies ForceAtlas2 only.
Do not reintroduce xyflow, Sigma, or another renderer without a decision record.
State is React/URL/in-memory with IndexedDB only for the vault handle.

## Structure and routes

`src/` uses Feature-Sliced Design:
`app → views → widgets → features → entities → shared`; ESLint enforces that
direction. Root `app/` is thin Next routing. `mcp/` and `cli/` are source
checkout surfaces, never npm packages. `docs/ontology/` is the dogfood vault.
`tests/contract/` prevents parser and cross-package drift.

All routes are locale-prefixed; use `@/i18n/navigation` for in-app links.
`/` is selected by caller: a web visitor without a vault sees the gateway,
while a vault-bearing web user and the installed app see the map/first-run
surface. The installed app must not offer its own download. `/topology` is
the map address and supports contextual relation writing with directional
preview and change review; ACP writes wait for `allow_once` or
`reject_once`. `/ontology`, `/ontology/edit` and `/ontology/studio` are legacy
redirects; `/ontology/insights` is live.

Adding or removing a route requires an appended `docs/DECISIONS.md` record in
the same change; `pnpm decisions:check` enforces it. Keep retired namespaces
retired: `/login`, `/signup`, `/account`, `/reset-password`,
`/settings/*`, `/admin/*`, `/review/*`, `/diagnostics/*`,
`/knowledge/*`, and `/skills`. See `.claude/rules/forbidden.md`.

## Operating gates and skills

The policies live in `.claude/rules/` and each skill owns its exact protocol.
Use the matching source, never memory and never this summary — what follows is
routing only: when to open a gate, not how it runs.

- **PO gate** — Before product, UX, graph, MCP, CLI, workflow, or macOS work,
  `/po-pass` names one lost Atlas ability and gives change/boundary facts to
  `pnpm po:route`; it derives door and risk. Log pilot outcomes in
  `docs/PO-PILOT.md`; `pnpm po:pilot -- --check` owns the sunset.
- **Product design gate** — `docs/PRODUCT-DESIGN-OPERATING-SYSTEM.md`, after
  the PO pass, for UI, visual design, interaction, graph readability,
  responsive layout and macOS workbench work:
  `/design-directions` before the code when the shape is not yet settled,
  `/design-build` to write it, `/design-audit` after it, and
  `/design-system-audit` before a release or an inconsistent-screen
  investigation. Public references are principle sources; never copy their
  assets or wording. A new design rule needs lint enforcement, an inventory and
  a probe, and its values live only in `docs/DESIGN-SYSTEM.md`.
- **Browser measurement** — the design and craft seats read rendered geometry
  through the `chrome-devtools` server, declared in `.mcp.json` and
  `.codex/config.toml` alike because the two brief trees are byte identical. A
  seat may only name a server its own tree's config declares; a personal agent
  config is not this repository's contract, and `pnpm agents:check` enforces it.
- **Councils** — `/po-council` pairs Evidence with the derived-risk specialist
  and tests recovery proof; `chief` rebuts only material conflict.
  `/design-council` owns visual work, with `design-guardian` as editor/decider
  before and after meaningful Relief or Topology work.
- **Decision ledger** — `docs/DECISIONS.md` is append-only. Read it before a
  pass or council; cite a standing decision or overturn it explicitly, keeping
  the losing dissent and a falsifier. Never silently re-decide.
- **Gate probe** — `/gate-probe` whenever a gate changes. A permanently green
  gate is not evidence.
- **Journey and motion** — `/user-walkthrough` names observable UX patterns,
  never invented user feelings. `/responsive-sweep`, `/motion-verify` and
  `/map-perf` when their stated surface applies.
- **Ontology and parallel work** — `/ontology-bootstrap` for a starter vault,
  `/ontology-sync` after a meaningful code change, `/ontology-extract` for
  prose, `/ontology-absorb-confluence` for a wiki page the user's own
  third-party MCP can read, `/ontology-field-trial` when construction rules or
  the MCP read/write contract could change vault quality, `/parallel-brief`
  before parallel work.

The design system permits neutrals and one indigo; consult
`.claude/rules/design.md`, `docs/DESIGN-SYSTEM.md`, and
`.claude/rules/design-gates.md` when applicable. Follow
`.claude/rules/architecture.md`, `testing.md`, `local-first.md`,
`surfaces.md`, `forbidden.md`, and `documentation.md` for their domains.
Documentation checks only machine-derived facts: generate and diff, check
references, or derive from code; never pin human prose.

## Verification, documentation, and Git

Start focused: `pnpm checks:changed -- --run`. Escalate to full tests, lint,
build, broad Playwright, or desktop packaging when shared contracts, routing,
configuration, release surfaces, or user workflows require it. Do not claim
completion from selected checks. Generated docs-vault output is created only by
`pnpm docs-vault:build`; never hand-edit
`src/entities/docs-vault/data/` or `public/docs-vault/`.

When documentation changes, keep the owner current: public behavior in
`README.md` and `docs/FEATURES.md`; architecture/routes in
`docs/ARCHITECTURE.md`; MCP/CLI contracts in their own READMEs; decisions in
`docs/DECISIONS.md`; releases in `docs/CHANGELOG.md`. Current authored prose
is English; `display_ko` frontmatter and `cli/templates/vault-ko/**` are
localized data. Ledgers remain append-only. Current docs links must resolve.

Use an English conventional prefix and subject for commits. Never use
`--no-verify`, force-push `main`, `git reset --hard`, or `git push --force`
without explicit user authority. Never run a publish command unless the user
explicitly asks; first run `npm pack --dry-run`. Hooks own irreversible
blocks, not prose.

## Context, delegation, and CodeGraph

Use the smallest sufficient context. Prefer a focused vault query, CodeGraph,
or targeted read to broad dumps. Preserve unrelated dirty work and user-local
state. Do not delegate a handful of tool calls or delegate re-verification.
When delegation is justified, the brief must state: isolated port; read-only
files; no stash/worktree deletion/`git add -A`; scratch outside the repo;
baselines; and primary sources.

If `.codegraph/` exists, start structural code questions there with exact
symbols or paths, and treat the compiler and tests as the authority for absence
and safety. `.claude/rules/codegraph.md` owns the routing table and the failure
modes; every code directory's `AGENTS.md` points at it. Without CodeGraph, use
targeted `rg` and reads.

## Source authority and ontology loop

For framework/build/routing facts, code wins: `package.json`,
`next.config.ts`, and `app/layout.tsx`. Product direction, feature inventory,
architecture, design system, and foundations live in their named documents.

Read the vault before unfamiliar meaningful work: use `list_kinds`, narrow
`list_concepts`, `get_concept`, `find_backlinks` before renames, and
`find_path` for an existing relation. Do not dump the full vault without need.

For a meaningful code change, invoke `/ontology-sync`. Only confirmed
candidates land: create with `add_concept`, connect with `add_relation`,
rename through dry-run then `confirm: true`, merge through the same pattern,
and patch with `expected_mtime`. After validation and complete compile,
`finalize_project_meaning` judges `agent_brief.meaningAssessment`, not write
success. Skip this loop for typos, comments, isolated style nudges, lint
configuration, and test fixtures without meaning changes.

The shared schema is `mcp/src/schema.mjs`. Every authorable node has a
writer-minted immutable UUIDv4 `uid`; the slug is readable/mutable and rename
preserves it. A capability's `path` is one canonical repo-relative
implementation entrypoint; `elements` contains element slugs, never raw
paths. Put localized names in `display_<locale>`; `title` is the canonical
search name. Project containment is implicit; do not add `project:`.

## Agent-file contract

`AGENTS.md` is canonical. `CLAUDE.md` imports it and contains only
Claude-specific visibility and loading information. Keep this file below the
32 KiB Codex cap; `pnpm agents:check` verifies the cap, the import bridge,
references, mirrored skills/agents, and that every agent-read file is English.
That subject set covers `.claude/hooks/`, `.claude/settings.json` and
`.codex/`: a guard's refusal text is all a blocked agent gets to read.
`.claude/skills/<name>/` and `.agents/skills/<name>/`, plus the matching agent
briefs, must be byte identical. Each directory a `.claude/rules/` glob reaches
also carries a nested `AGENTS.md` naming those rules, because Codex merges
`AGENTS.md` root-down along the working path and never auto-loads `.claude/`.
They stay pointers: the cap check measures root plus the largest nested file,
since Codex truncates the merge in silence. Do not name a tool inside a shared
skill body; branch on capability. `.claude/settings.json` owns Claude hooks and
`.codex/hooks.json` owns their Codex mirror.
