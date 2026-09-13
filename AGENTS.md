# AGENTS.md — ontology-atlas

Canonical repository contract. Read the authority for the current task; do not
load every linked document before an edit.

## Product and architecture

Ontology Atlas is a local-first codebase ontology: what code builds, why it is
structured that way, and what changes affect. People and agents maintain the
same Markdown frontmatter graph; Git is truth. Atlas adds reviewed product
meaning to source evidence. Structural health is not accepted meaning.

- `docs/ONTOLOGY-ATLAS-SPEC.md` §2/§5 is the sole public meta-model. Surfaces must
  offer typed agent facts and evidence a human can judge and correct.
- No backend, login, auth, seed data, API routes, or server actions.
  `output: 'export'` is intentional. The macOS app carries MCP; `mcp/` and `cli/`
  also run from source. There is no npm package.
- `src/` follows app → views → widgets → features → entities → shared.
  Root `app/` is thin Next routing; ESLint enforces import direction.
- The renderer is custom canvas-2D `ontology-map`; Graphology supplies
  ForceAtlas2 only. Another renderer needs a decision.
- State is React/URL/in-memory; IndexedDB stores only the vault handle.
  App and web share parser/data contracts, not identical screens.
- Versions/framework facts come from `package.json`, `next.config.ts`, and
  `app/layout.tsx`.

## Working and finishing

Infer scope from the request and session. Proceed through authorized local
implementation, relevant verification, and correction of resulting failures.
Complete running and verification when in scope.
Reuse decisions and approval while their content and conditions still hold.
Ask only for a material missing fact or new authority; name the unresolved
decision and exact rule if one causes a pause. Never claim unperformed proof.

Check `git status`; preserve unrelated changes and active processes. Use native
search and targeted reads. Existing `.codegraph/` may help with cross-file
calls, dynamic dispatch, or impact; `.claude/rules/codegraph.md` owns its use.
Empty or stale results are not absence. Do not create an index to start a task.

Install only missing/stale dependencies: `pnpm install` at the root and
`pnpm --dir mcp install --frozen-lockfile` for the source MCP. Root installation
does not update `mcp/node_modules`; recheck it after its manifest changes.
Use `pnpm dev` when the task needs a running web app.

Run `pnpm checks:changed -- --run` and complete every recommendation. Stop after
success unless a new edit, failure, or named unresolved risk requires more.
`.claude/rules/testing.md` owns escalation; do not run broad suites by habit or
write tests that merely pin prose. Explain what changed, the evidence, and any
remaining limits.

## Choose the relevant workflow

Use `.agents/skills/` for Codex and `.claude/skills/` for Claude. Their instructions,
resources, models, and inventories are independent. Do not synchronize them or
require byte identity; each must satisfy shared product/authorization contracts.

Codex `.agents/agents/` files are task briefs, not native registrations. Inherit
the caller's model/effort and available tools. `access` is a task boundary, not
a permission grant. Do not transplant another harness's model/tool aliases.

| Task | Entry and required scope |
|---|---|
| Mechanical maintenance | Technical checks; `/po-pass` skips product review |
| Product, UX, graph, MCP, CLI, workflow, or macOS change | `/po-pass`; `pnpm po:route` derives door/risk from facts; `/po-council` only for the returned review or an owner request |
| UI, interaction, topology, responsive, motion, or macOS workbench | Design gate after the PO pass: `docs/PRODUCT-DESIGN-OPERATING-SYSTEM.md` and `pnpm design:route`; `/design-build` implements the selected shape |
| New structural design choice | `/design-directions` only when routed and no valid owner selection exists; `/design-council` only for routed structural commitments |
| Rendered proof | `/design-audit`, `/responsive-sweep`, `/motion-verify`, `/map-perf`, and `/user-walkthrough` only at the requested or routed scope |
| Design-system enforcement | `/design-system-audit`; new or changed gates also use `/gate-probe` |
| Any automated gate change | `/gate-probe`: inventory, deliberate RED, restoration to GREEN, nonempty scope, automatic wiring |
| Initial ontology or explicit rebuild | `/ontology-bootstrap`; general code analysis alone does not request construction |
| Meaningful code change in an existing vault | `/ontology-sync`; inspect the delta before proposing or writing meaning |
| Requested extraction from prose or wiki | `/ontology-extract` or `/ontology-absorb-confluence` with the user's registered third-party MCP |
| Construction rules or MCP behavior that can change vault quality | `/ontology-field-trial`; wording-only changes preserving evidence/approval/write contracts skip it |
| Authorized parallel work | `/parallel-brief` before delegation |

Delegate only bounded independent work; disclose shared-context reviews.
Subagents do not stash, delete worktrees, or run `git add -A`.

Task status: `docs/BACKLOG.md` and `pnpm backlog -- --task=ID`. Append a fresh
UUID record per worktree observation; do not overwrite published records.

Read one relevant prior decision with `pnpm decisions:find <terms>`. Cite it or
explicitly overturn it, retaining dissent and a falsifier. `pnpm record:new`
creates immutable fragments; routine solo work does not need a decision fragment.
Eligible product runs use `pnpm po:record`; `pnpm po:pilot -- --check` owns sunset.

## Rendered work and source authorities

Every rendered route uses Computer Use while building: baseline; one coherent
slice; fresh accessibility tree and screenshot in the actual browser/WebView/app;
correction; repeat. DOM geometry complements the capture. Motion requires the
real macOS recording in `/motion-verify`; static frames cannot approve it.

Read the named authority only for its subject:

| Subject | Authority |
|---|---|
| Product and inventory | `docs/PRODUCT-DIRECTION.md`, `docs/FEATURES.md` |
| Architecture/routes | `docs/ARCHITECTURE.md`, `.claude/rules/architecture.md` |
| UI values | `docs/DESIGN-SYSTEM.md`, `.claude/rules/design.md` |
| Gates | `.claude/rules/design-gates.md` |
| Storage/surface boundaries | `.claude/rules/local-first.md`, `.claude/rules/surfaces.md`, `.claude/rules/forbidden.md` |
| Tests, docs, Git | `.claude/rules/testing.md`, `.claude/rules/documentation.md`, `.claude/rules/git.md` |

Routes are locale-prefixed; use `@/i18n/navigation`. `/` chooses gateway or
vault-bearing map/first-run; a wiki without nodes opens `/library`. The app must
not offer its own download. `/topology` owns map/relation review; ACP writes wait
for `allow_once` or `reject_once`. Route additions/removals require a decision
fragment. `/ontology`, `/ontology/edit`, and `/ontology/studio` are redirects;
`/ontology/insights` is live. Check the forbidden rule before reviving a retired
namespace.

## Source authority and ontology loop

Before unfamiliar meaningful work, read `list_kinds`, narrow `list_concepts`,
and `get_concept`; use `find_backlinks` before renames and `find_path` for an
existing relation. Avoid full-vault dumps.

`mcp/src/schema.mjs` owns schema. UID is immutable and writer-minted; slug may
change. Capability `path` is one implementation entrypoint; `elements` holds
slugs. Canonical names use `title`; localization uses `display_<locale>`.
Project containment is implicit; do not add `project:`.

After meaningful code changes, `/ontology-sync` lands only confirmed candidates
via `add_concept`/`add_relation`. Rename/merge need reviewed dry-run then
`confirm: true`; patches need `expected_mtime`. A code rename does not authorize
a vault rename. Validate and compile, then `finalize_project_meaning` judges
`agent_brief.meaningAssessment`; write success is not meaning acceptance.
Typos, comments, isolated style, lint, and fixtures without meaning changes skip.

## Documentation, landing, and instruction integrity

Keep the owner document current: public behavior in `README.md` and
`docs/FEATURES.md`; architecture/routes in `docs/ARCHITECTURE.md`; MCP/CLI
contracts in their READMEs. Authored prose is English; `display_ko` and
`cli/templates/vault-ko/**` are localized data. Current links must resolve.
`docs/records/README.md` owns decision/change/release/pilot fragments. Never edit
frozen history. Check machine-derived facts and references, not exact sentences.

`pnpm docs-vault:build` materializes ignored `src/entities/docs-vault/data/` and
`public/docs-vault/` on install, checkout, merge, and build. Never edit or stage
those generated files.

Use English conventional commit subjects. Open pull requests as drafts and land
with `pnpm pr:land <number>`, which locks, merges main, checks locally, and fires
the one CI run. Never use `--no-verify`, force-push main, `git reset --hard`, or
`git push --force` without explicit user authority. Publishing needs an explicit
request and `npm pack --dry-run` first. Hooks own irreversible blocks.

`AGENTS.md` is canonical; `CLAUDE.md` imports it and owns Claude loading details.
Keep root plus the largest nested instruction file below 32 KiB. Nested
`AGENTS.md` files point to the rules relevant to their paths; Codex does not
auto-load `.claude/rules/`. `pnpm agents:check` checks each harness's inventory,
identity, references, language, MCP grants, bridge, and Codex size cap. The public
`agent-files` readout still reports literal copy differences; that is information,
not a requirement to synchronize independent harnesses.

`.claude/settings.json` owns Claude hooks and `.codex/hooks.json` owns Codex
hooks. Codex skips a new or changed entry until a person trusts it in `/hooks`.
Do not change Claude files while optimizing Codex instructions.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
