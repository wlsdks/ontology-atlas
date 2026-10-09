# AGENTS.md — ontology-atlas

Read only the task's authority.

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
- `src/` follows app → views → widgets → features → entities → shared; root
  `app/` is thin Next routing.
- The renderer is custom canvas-2D `ontology-map`; one WebGL2 light layer
  draws light only; Graphology supplies ForceAtlas2 only. Another renderer
  needs a decision.
- MCP internals split by responsibility.
- State is React/URL/in-memory; IndexedDB stores only the vault handle.
  App and web share parser/data contracts, not identical screens.

## Working and finishing

Deliver what was asked, at the scope intended. Make routine judgment calls
yourself; ask only when readings lead to materially different work or new
authority is needed, and name the decision and rule that cause the pause. If a
better approach exists, say so in one sentence and continue as asked. Reuse
decisions and approval while their content and conditions still hold.

Check `git status`; preserve unrelated changes and active processes. Use native
search and targeted file reads for source and change-impact questions.

Finish with `pnpm checks:changed -- --run` and complete every recommendation.
Stop after success unless a new edit, failure, or named risk requires more; do
not add broad suites, repeat passing checks, or write tests that pin prose.
`.claude/rules/testing.md` owns escalation. Report the outcome first, then the
evidence and remaining limits. Never claim unperformed proof.

A fact the source can answer comes from a script: run or extend the `pnpm`
command (README's command table) and read its output instead of re-deriving it.
Write no plans, retrospectives, handoffs or notes into the repository or
`~/scratch`; reasons go in commit bodies and pull requests, working files in the
session scratchpad. Skill design: `docs/engineering/agent-instructions.md`.

## Choose the relevant workflow

| Task | Entry and required scope |
|---|---|
| Mechanical maintenance | Technical checks only; skip product routing |
| Product behavior, UX, public contract, or authority change | `/product-check`; one `reviewer` only when it returns review or the owner asks |
| UI, interaction, topology, responsive, motion, or macOS workbench | After the product check, `/ui-build` (it runs `pnpm design:route`); `/ui-proof` runs the proof steps the route returns |
| Any automated gate change | `/gate-probe` |
| Initial ontology or explicit rebuild | `/ontology-bootstrap`; general code analysis alone does not request construction |
| Meaningful code change in an existing vault | `/ontology-sync` |
| Requested extraction from prose or wiki | `/ontology-extract`; a wiki page only through the user's registered third-party MCP |
| Construction rules or MCP behavior that can change vault quality | `/ontology-field-trial`; wording-only changes that keep evidence/approval/write contracts skip it |
| Authorized parallel work | `/delegate` |
| Returned or ready branches | `/merge`; your own branch with no review due merges with `pnpm pr:land` |

Delegate only large, independent, parallelizable work; finish what a handful of
tool calls can do yourself, and never delegate to verify or double-check your
own work. On Opus, plan, review, and judge at `xhigh`; build a decided slice at
`low`. Disclose shared-context reviews. Subagents do not stash,
delete worktrees, or run `git add -A`.

Task status: `pnpm backlog -- --task=ID`; `docs/BACKLOG.md` owns the append-only
record format. Before reversing an existing product or architecture choice, find
it with `pnpm decisions:find <terms>` and cite or explicitly overturn it, keeping
dissent and a falsifier. A record is context from its date, not proof it still
holds: recheck its conditions and figures against the present before relying on
it. When a document and the code disagree, the code is the fact: fix the
document in the same change. `pnpm record:new` creates immutable fragments; routine work needs none.

## Rendered work and source authorities

Read the named authority only for its subject:

| Subject | Authority |
|---|---|
| Product and inventory | `docs/PRODUCT-DIRECTION.md`, `docs/FEATURES.md` |
| Architecture/routes/module ownership | `docs/ARCHITECTURE.md`, `.claude/rules/architecture.md` |
| UI values and the rendered-work loop | `docs/DESIGN-SYSTEM.md`, `docs/PRODUCT-DESIGN-OPERATING-SYSTEM.md`, `.claude/rules/design.md` |
| Gates | `.claude/rules/design-gates.md` |
| Storage/surface boundaries | `.claude/rules/local-first.md`, `.claude/rules/surfaces.md`, `.claude/rules/forbidden.md` |
| Tests, docs, Git | `.claude/rules/testing.md`, `.claude/rules/documentation.md`, `.claude/rules/git.md` |

Routes are locale-prefixed; use `@/i18n/navigation`. `/` chooses gateway or
vault-bearing map/first-run; a wiki without nodes opens `/library`. The app must
not offer its own download. `/topology` owns map/relation review; ACP writes wait
for `allow_once` or `reject_once`. Route additions/removals require a decision
fragment. `/ontology`, `/ontology/edit`, `/ontology/studio`, and `/mcp` are redirects;
`/ontology/insights` is live. Check the forbidden rule before reviving a retired
namespace.

## Source authority and ontology loop

Before unfamiliar meaningful work, read `list_kinds`, narrow `list_concepts`,
and `get_concept`; use `find_backlinks` before renames and `find_path` for an
existing relation. Avoid full-vault dumps.

`mcp/src/schema.mjs` owns schema. UID is immutable and writer-minted; slug may
change. Canonical names use `title`; localization uses `display_<locale>`.
Project containment is implicit; do not add `project:`. Vault writes go through
`/ontology-sync` and its MCP write contract. A code rename does not authorize a
vault rename, and write success is not meaning acceptance. Typos, comments,
isolated style, lint, and fixtures without meaning changes skip the sync.

## Documentation, merging, and instruction integrity

Keep the owner document current: public behavior in `README.md` and
`docs/FEATURES.md`; architecture/routes in `docs/ARCHITECTURE.md`; MCP/CLI
contracts in their READMEs. Authored prose is English; `display_ko`,
`cli/templates/vault-ko/**` and `README.{ko,ja,zh}.md` are localized data.
Never edit frozen history (`docs/records/README.md`); never edit or stage
generated `src/entities/docs-vault/data/` or `public/docs-vault/`, which
`pnpm docs-vault:build` writes.

Use English conventional commit subjects. Open pull requests as drafts and merge
only with `pnpm pr:land <number>`. Never use `--no-verify`, force-push main,
`git reset --hard`, or `git push --force` without explicit user authority.
Publishing needs an explicit request and `npm pack --dry-run` first.

`CLAUDE.md` imports this file and owns Claude loading details. Keep root plus
the largest nested instruction file below 32 KiB; nested `AGENTS.md` files only
point to the `.claude/rules/` relevant to their paths, which Codex does not
auto-load. Keep host-specific skill metadata and agent briefs separate. Shared
procedures may have one owner; byte identity is not required. Codex briefs
inherit the caller's model, effort and tools; `access` defines scope, not a grant.
Run `pnpm agents:check` after editing agent
files. `.claude/settings.json` owns Claude hooks and `.codex/hooks.json` Codex
hooks; Codex skips a new or changed entry until a person trusts it in `/hooks`.
Do not change Claude files while optimizing Codex instructions.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
