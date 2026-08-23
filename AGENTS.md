# AGENTS.md — ontology-atlas

> Canonical contributor guide for people and AI agents. Read it before changing
> the repository; use the linked authority for detail rather than duplicating it.

## Product and non-negotiable architecture

Ontology Atlas is a local-first workbench for understanding a product from
business meaning to implementation evidence. Vault Markdown frontmatter is the
graph, Git is the source of truth, and people judge meaning through plain files
and diffs. Agents use the same vault through MCP/CLI. The macOS app carries the
MCP server; source checkouts run it directly. There is no npm package.

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
promise identical screens. Keep degradation honest. Before any non-trivial
product, UX, graph, MCP, CLI, workflow, or macOS-shell change, run the PO gate;
for visual work, run the design gate after it.

> **One product/system, one ontology, that people and their AI agents grow together.**

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
`reject_once`. `/ontology` and `/ontology/edit` are legacy redirects.

Adding or removing a route requires an appended `docs/DECISIONS.md` record in
the same change; `pnpm decisions:check` enforces it. Keep retired namespaces
retired: `/login`, `/signup`, `/account`, `/reset-password`,
`/settings/*`, `/admin/*`, `/review/*`, `/diagnostics/*`,
`/knowledge/*`, and `/skills`. See `.claude/rules/forbidden.md`.

## Operating gates and skills

The detailed policies live in `.claude/rules/`; use the matching source, not
memory.

- **PO gate**: `docs/PRODUCT-OWNER-OPERATING-SYSTEM.md` is mandatory before
  product, UX, graph, MCP, CLI, workflow, or macOS-shell changes. Translate an
  offered solution into a user's observable problem first. Run `/po-pass`;
  read the decision ledger, discriminate phenomenon from problem, score all six
  rows, and convene `/po-council` below 18/24, on a fatal zero, or on its
  stated trigger. Ontology or agent value is not author-declarable N/A.
- **Product design gate**: `docs/PRODUCT-DESIGN-OPERATING-SYSTEM.md` is
  mandatory after the PO pass for UI, visual design, interaction, graph
  readability, responsive layout, and macOS workbench changes. Public
  references are principle sources only: do not copy their assets or wording.
- **Councils**: convene `/po-council` before expensive or hard-to-reverse
  work: a new or removed surface, public MCP/CLI/schema contract, positioning,
  or first public release. `chief` decides seats/order, records the decision,
  and never edits code. For visual work `/design-council` always includes
  hierarchy and system; each seat opens the built surface, names an alternative,
  and `design-guardian` is the accountable editor/decider. Use the standing
  Design Guardian or an independent equivalent before and after meaningful
  Relief/Topology work.
- **Decision ledger**: `docs/DECISIONS.md` is append-only. Read it before a
  pass or council; cite a standing decision or explicitly overturn it. Preserve
  losing dissent and a falsifier. Never silently re-decide.
- **Gate probe**: run `/gate-probe` whenever a gate changes. Inventory before
  enabling, plant a defect for RED, restore GREEN, prove the subject set is
  non-empty, and verify focused-check/CI wiring. A permanent green gate is not
  evidence.
- **UI proof**: before UI code, use `/design-build`; after it, use
  `/design-audit` to measure DOM geometry and computed ramps before screenshots.
  Use `/design-system-audit` before releases or inconsistent-screen
  investigations. New design rules require lint enforcement, an inventory, and
  a probe; values live only in `docs/DESIGN-SYSTEM.md`.
- **Journey and motion**: `/user-walkthrough` names observable UX patterns,
  not invented user feelings. Use `/responsive-sweep`, `/motion-verify`, or
  `/map-perf` when their stated surface applies.
- **Other required routing**: `/ontology-bootstrap` for starter vaults,
  `/ontology-sync` after meaningful code changes, and `/ontology-extract`
  for prose. Use `/ontology-field-trial` when construction rules or MCP
  read/write contracts could change vault quality. Use `/parallel-brief`
  before parallel work. The skills own their exact protocols.

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

If `.codegraph/` exists, start structural code questions with
`codegraph_explore` or `codegraph explore` using exact symbols/paths. Check
returned identity, use callers/impact plus a comment/docs search before a
rename or deletion, and use compiler/tests as the authority for absence and
safety. React to staleness; index only when status reports an old, partial, or
inconsistent graph. Without CodeGraph, use targeted `rg` and reads.

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
briefs, must be byte identical. Do not name a tool inside a shared skill body;
branch on capability.
`.claude/settings.json` owns Claude hooks and `.codex/hooks.json` owns their
Codex mirror.
