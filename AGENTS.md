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
  The UI is a Vite bundle: the app's folder, and with prerendered pages the
  website, so no server runs. The macOS app carries MCP; `mcp/` and `cli/`
  also run from source. There is no npm package.
- `src/` follows app → views → widgets → features → entities → shared; root
  `app/` holds only the stylesheet.
- The renderer is custom canvas-2D `ontology-map`; one WebGL2 light layer
  draws light only; three.js paints Neural alone, canvas 2D its fallback;
  Graphology supplies ForceAtlas2 only. Another renderer needs a decision.
- MCP internals split by responsibility.
- State is React/URL/in-memory; IndexedDB stores only the vault handle. The
  app's derived index (OS cache) is rebuildable and never canonical.
  Only the app opens a folder.

## Working and finishing

Deliver what was asked, at the scope intended. Make routine judgment calls
yourself; ask only when readings lead to materially different work or new
authority is needed, and name the decision and rule that cause the pause. If a
better approach exists, say so in one sentence and continue as asked. Reuse
decisions and approval while their content and conditions still hold.

Check `git status`; preserve unrelated changes and active processes. Use native
search and targeted file reads for source and change-impact questions.

Use `pnpm checks:changed` for candidates; run only checks needed for the
change and its risks. Escalate on evidence, keep required CI, and do not repeat
passing checks. This overrides conflicting test instructions.
`.claude/rules/testing.md` owns test shape. Report evidence and limits.

Write a report for a reader who saw none of the tool calls or files: lead with
what is now true, use full sentences and the same word for the same thing,
define any name coined during the work, and say what was not done or checked.
During a long turn, say in a line what you are doing every few tool calls.

A fact the source can answer comes from a script: run or extend the `pnpm`
command (`docs/DEVELOPMENT-CHECKS.md` lists them) and read its output instead
of re-deriving it.
Plans are `docs/specs/` specs with a dated `## Revisions` log. Write no other plans, retrospectives, handoffs or notes into the
repository or `~/scratch`; reasons go in commit bodies and pull requests,
working files in the session scratchpad. Screenshots, recordings and image drafts are working
files: attach them to the pull request. Git keeps only media the product
ships (`committed-media.contract.test.ts`). Skill design:
`docs/engineering/agent-instructions.md`.

## Choose the relevant workflow

| Task | Entry and required scope |
|---|---|
| Mechanical maintenance | Technical checks only |
| One-way change: a public MCP, CLI or vault contract; a route added or removed; what leaves the machine; what an agent may write or approve; first-contact positioning | `pnpm decisions:find`; the person, moment and proof in the pull request; one `code-reviewer`; one decision record |
| Any other product behavior or copy | Build it and verify the behavior |
| UI, interaction, topology, responsive, motion, or macOS workbench | `/ui-build`: build from the primitives and look at each slice with `pnpm ui:look`; `/ui-proof` only for the classes its table lists |
| A new or changed automated gate | `/gate-probe` |
| Initial ontology or explicit rebuild | `/ontology-bootstrap`; general code analysis alone does not request construction |
| Meaningful code change in an existing vault | `/ontology-sync` |
| Requested extraction from prose or wiki | `/ontology-extract`; a wiki page only through the user's registered third-party MCP |
| Construction rules or MCP behavior that can change vault quality | `/ontology-field-trial`; wording-only changes that keep evidence/approval/write contracts skip it |
| Authorized parallel work | `/delegate` to brief, `/integrate` to merge |
| Returned or ready branches | Parallel slices: `/integrate`; one branch: `/merge`, then `pnpm pr:land` |

Delegate only large, independent, parallelizable work; finish what a handful of
tool calls can do yourself, and never delegate to verify or double-check your
own work. Agents run on Opus; Fable needs the owner's yes per task
(`docs/engineering/agent-effort.md`). Disclose shared-context reviews. Subagents do not stash,
delete worktrees, or run `git add -A`.

Before reversing an existing product or architecture choice, find
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
| Storage/surface boundaries | `.claude/rules/local-first.md`, `.claude/rules/surfaces.md` (exceptions: `surface-exceptions.md`), `.claude/rules/forbidden.md` |
| Tests, docs, Git | `.claude/rules/testing.md`, `.claude/rules/documentation.md`, `.claude/rules/git.md` |

Routes are locale-prefixed; use `@/i18n/navigation`. `/` is the gateway in a
browser, the map/first-run in the app; a wiki without nodes opens `/library`.
The app must not offer its own download. `/topology` owns map/relation review;
ACP writes wait for `allow_once` or `reject_once`. Route additions/removals
require a decision fragment. `/ontology`, `/ontology/edit`, `/ontology/studio`,
`/ontology/insights` and `/mcp` are redirects. Check the forbidden rule before
reviving a retired namespace.

## Source authority and ontology loop

Before unfamiliar meaningful work, read the `list_concepts` census, narrow it,
then `get_concepts`; use `find_backlinks` before renames and `query_ontology`
`path` for an existing relation. Avoid full-vault dumps.

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
`cli/templates/vault-ko/**`, `README.{ko,ja,zh}.md` and `docs-i18n/guide/**`
are localized data.
Never edit frozen history (`docs/records/README.md`); never edit or stage
generated `src/entities/docs-vault/data/` or `public/docs-vault/`, which
`pnpm docs-vault:build` writes.

Use English conventional commit subjects. Open pull requests as drafts and merge
only with `pnpm pr:land <number>`. Never use `--no-verify`, force-push main,
`git reset --hard`, or `git push --force` without explicit user authority.
Publishing needs an explicit request and `npm pack --dry-run` first.

Parallel work reaches `main` through one integration branch (`/integrate`),
never a train or a pull request per slice: unpushed slices run
`pnpm checks:changed -- --run --slice`, the lead merges each `--no-ff` as it
returns, and repo-wide lanes and CI run once. Never squash, rebase or
cherry-pick a slice; delete a branch only once `origin/main` holds its head.

Keep root plus the largest nested instruction file below 32 KiB; nested
`AGENTS.md` files only point to the `.claude/rules/` relevant to their paths.
Keep host-specific skill metadata and agent briefs separate. Shared procedures
may have one owner; byte identity is not required. Codex briefs inherit the
caller's model, effort and tools; `access` defines scope, not a grant. Run
`pnpm agents:check` after editing agent files. Do not change Claude files while
optimizing Codex instructions.

## Harness loading and hooks

This is the only root instruction file; a root `CLAUDE.md` would replace it.
Codex loads no rule by itself. Which rules load every turn, which wait for a
path, and which hooks run for which host: `docs/engineering/agent-instructions.md`,
"Loading and hooks". Read it before editing a rule, a hook or `.codex/hooks.json`.
