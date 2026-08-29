# Development Checks

Maintainer-only checks live here so the public README stays readable. Use this
page when you touch `mcp/`, `cli/`, package manifests, release scripts, or the
dogfood ontology.

## Default Gate

Run this before pushing broad docs, package, MCP, or web changes:

```bash
pnpm test:mcp:docs
pnpm vault:validate
pnpm exec tsc --noEmit
pnpm build
```

For user-facing UI changes, add the relevant Playwright route check.

## Git hooks — generated vault freshness, message language, push lanes

`pnpm install` points `core.hooksPath` at `.githooks/` (the `prepare` script;
nothing to run by hand). Three hooks live there:

| Hook | Blocks |
|---|---|
| `pre-commit` | a staged set touching the vault's markdown or its generated outputs while `node scripts/build-docs-vault.mjs --check` reports drift |
| `commit-msg` | a commit message containing Hangul, kana or Han; merge, revert and fixup subjects are exempt because Git generates them (`.claude/rules/git.md`, "Commit messages") |
| `pre-push` | path lanes that CI would fail, run in parallel with e2e left to CI — decision (96), which overturns (95) |

The parallel pre-push hook can saturate a local machine, so its unit and contract
Vitest lanes alone use two workers and a 30-second per-test timeout. Four workers
per lane still starved ordinary React state-transition tests when eleven lanes
ran together; two divides the local CPU budget without changing coverage. Focused runs
and CI keep the normal worker pool and timeout; the hook changes local scheduling
and waiting tolerance, not assertions or coverage.

The `pre-commit` rationale below is the oldest of the three.

It exists because the same failure landed three times in two days (#826 · #828 ·
#831): docs edited, `pnpm docs-vault:build` skipped, CI red eight minutes later.
The tool was never the problem — `pnpm checks:changed` named
`pnpm docs-vault:check` on every one of them. Moving the verdict from CI to the
commit is the only part that changes anything, so the hook does exactly that and
nothing else: **it blocks and prints the fix, it never edits your staged files.**
A hook that silently rewrites a commit puts bytes nobody wrote under a person's
name.

```bash
pnpm docs-vault:build && git add src/entities/docs-vault/data public/docs-vault
```

`--no-verify` is not the escape hatch — `.claude/rules/git.md` forbids it.

## Quick Matrix

| Area | First check | Escalate when needed |
|---|---|---|
| App/type safety | `pnpm exec tsc --noEmit` | `pnpm build` |
| Lint/style | `pnpm lint` | `pnpm test:run` |
| Static deploy safety | `pnpm build` | `pnpm exec tsc --noEmit` |
| GitHub Pages deploy | `pnpm build` | `pnpm desktop:verify-hosted` after deploy |
| Static dogfood manifest | `pnpm docs-vault:check` | `pnpm test:docs-vault` |
| Gateway evidence specimen | `pnpm gateway:specimen:check` | `pnpm gateway:specimen` to refresh |
| Docs vs code surface | `pnpm docs:check` | `pnpm test:docs:checks` |
| Source comment language | `pnpm source:language` | `pnpm test:source:language` |
| CLI printed-output language | `pnpm test:contracts` | `tests/contract/cli-output-language.contract.test.ts` |
| Agent instruction files | `pnpm agents:check` | the harness contracts under `tests/contract/` named below |
| macOS desktop readiness | `pnpm desktop:check` | `pnpm desktop:doctor`, then `pnpm test:desktop:check` / `pnpm test:desktop:runtime` / `pnpm test:desktop:bridge` |
| Vault integrity | `pnpm vault:validate` | `pnpm vault:audit` |
| Capability quantifier integrity | `node scripts/run-focused-node-test.mjs --test-name-pattern "bounded-evidence omissions" mcp/src/meaning-evaluation.test.mjs` | `pnpm test:mcp:unit`, source/bundle MCP parity, then the four-phase source-hidden field trial |
| First-pass construction completion | `node scripts/run-focused-node-test.mjs --test-name-pattern "unfinished-scope project exclusion|redundant domain edge" mcp/src/construction-lifecycle.test.mjs mcp/src/ontology-engine.test.mjs` | Frozen candidate/health replay, source/bundled behavior parity, sealed-claim actor/access/mutation probes, bounded-source-dependency versus runtime-impact audit, then one fresh four-phase field trial. |
| Qualification handoff helper | `node --test .agents/skills/ontology-bootstrap/scripts/qualification-handoff.test.mjs` | Probe inconsistent/late CQ ownership, failed CQ witness kinds, construction-actor collision, and acceptor mismatch; run `pnpm agents:check`, then a fresh timed parallel field trial. The helper never substitutes for source hiding or MCP write verification. |
| Project source witness parity | `node --test mcp/src/project-source-connect.test.mjs && pnpm exec vitest run src/views/home/lib/project-source-witnesses.test.ts tests/contract/project-source-connect.contract.test.ts` | Re-mint a real source receipt, finalize an unchanged competency body, then verify current source and categorical meaning assessment. |
| CLI argument parsing | `pnpm test:cli:args` | `pnpm test:cli:lib` |
| MCP core units | `pnpm test:mcp:unit` | `pnpm integration:mcp:readme` |
| Business meaning corpus | `pnpm test:meaning-corpus` | source-hidden field trial and fixture-specific review |
| MCP/docs contract | `pnpm test:mcp:docs` | `pnpm package:check` |
| Graph hot-path perf | `pnpm perf:graph:check` | `pnpm perf:graph:scale` |
| Dogfood MCP smoke | `pnpm dogfood:status` | `pnpm dogfood:verify` |
| Packed CLI release | `pnpm smoke:packed-cli` | `pnpm test:mcp:package` |
| Decision ledger triggers | `pnpm decisions:check` | `pnpm exec vitest run tests/contract/design-spec-ledger.contract.test.ts` |
| Copy that names the reader's surface | `pnpm exec vitest run tests/contract/surface-naming-ratchet.contract.test.ts` | `pnpm test:contracts` |
| Markdown table shape (rows vs their header) | `pnpm exec vitest run tests/contract/markdown-table-shape.contract.test.ts` | `pnpm test:contracts` |
| Design don't-list drift | `pnpm exec vitest run tests/contract/design-donts-parity.contract.test.ts` | `pnpm test:contracts` |
| Design-system TOC drift | `pnpm design:toc:check` (in `pnpm docs:check`) | `pnpm design:toc` regenerates |
| Implicit `<b>` weight (browser default 700) | `pnpm exec vitest run tests/contract/implicit-bold-weight.contract.test.ts` | `pnpm test:contracts` |
| Drawing-surface type (canvas `ctx.font`, inline SVG attrs) | `pnpm exec vitest run tests/contract/drawing-surface-type.contract.test.ts` | `pnpm test:contracts` |
| Focus ring presence (value layer emits it) | `pnpm exec vitest run tests/contract/focus-ring-presence.contract.test.ts` | `pnpm test:contracts` |
| Raw colour literals (now `src/` + `app/` + `.css`) | `pnpm check:tokens` | `pnpm test:check:tokens` |
| Pixel identity palette, frame continuity, and safe map lane | `pnpm exec vitest run tests/contract/mascot-palette-boundary.contract.test.ts tests/contract/mascot-motion.contract.test.ts` | `pnpm exec playwright test tests/e2e/agent-mascot-presence.spec.ts` |
| Demo clip declaration vs shipped asset | `pnpm exec vitest run tests/contract/demo-clip-assets.contract.test.ts` | `pnpm test:contracts` |
| Demo clip locale (played source vs poster) | `pnpm exec playwright test tests/e2e/demo-clip-locale.spec.ts` | `pnpm exec playwright test` |
| CI preparation step infinite wait | `pnpm exec vitest run tests/contract/ci-bounded-network.contract.test.ts` | `pnpm test:desktop:check` (unit test of the retry runner itself) |
| Integration check list vs screen text | `pnpm exec vitest run tests/contract/agent-doctor-checks.contract.test.ts` | `cargo test`(src-tauri) 's `acp_doctor` test |
| Guide in-body link targets (markdown source) | `pnpm exec vitest run tests/contract/guide-inbody-links.contract.test.ts` | `pnpm exec playwright test tests/e2e/guide-inbody-links.spec.ts` |
| CLI/MCP schema copy drift | `pnpm exec vitest run tests/contract/schema-copy-sync.contract.test.ts` | `pnpm test:contracts` |

### Decision-ledger gate (`pnpm decisions:check`)

Fails when a change trips a mechanical council trigger without appending to
`docs/DECISIONS.md` in the same change. Three triggers:

1. **New surface / surface removal** — `app/[locale]/**/page.tsx` added or deleted.
2. **Public contract change** — `cli/src/lib/cli-commands.mjs` or `mcp/src/index.js` edited.
3. **Specification change** (2026-08-03) — the design system's vocabulary or ramps moved.

Trigger 3 does **not** fire on «the file appears in the diff». Those files are
among the most frequently touched in the repo (79 of the last 300 commits), so a
path-only rule produced 63 false positives. It compares a *census* instead —
cva axes/options/defaults, ramp token names and values, exported primitives, and
the scale-contract numbers in `.claude/rules/design.md` — and 16 of those 79
survive. Class-string edits, comments, whitespace and reordering do not count.
Reasoning in full: `scripts/lib/design-spec-census.mjs`.

The trigger file list lives **only** in `.claude/rules/design.md` («To change the spec, call the 'system'»); the gate parses it from there, so adding a bullet
there extends the gate the same day.
`tests/contract/design-spec-ledger.contract.test.ts` asserts the list is not
duplicated in code, that every listed path exists, and that every listed file
still yields a non-empty census — a detector idling on an empty set is
indistinguishable from no gate.

`pnpm test:mcp:docs` also guards
the tracked `.mcp.json`, `.mcp.json.example`, and `.codex/config.toml`
source-checkout templates so local agent registration keeps pointing at
`node ./mcp/src/index.js` with `OATLAS_VAULT=./docs/ontology`. Use
`pnpm test:mcp:registration` when only those MCP registration templates changed.
The hosted demo website is served by GitHub Pages via
`.github/workflows/deploy-pages.yml`, the sole web host. It builds the static
export to the `/ontology-atlas` base path on push to `main` and on release
publication, then runs
`pnpm desktop:verify-hosted -- --base-url="https://wlsdks.github.io/ontology-atlas"`
and, when a release tag is present,
`pnpm desktop:verify-download -- --tag="$PUBLISHED_RELEASE_TAG"` so the hosted
download route proves the public DMG/checksum assets are still reachable. GitHub
Pages needs no deploy secrets. The website deploy is deliberately separate from
the macOS app release workflow: `.github/workflows/release-macos.yml` publishes
signed/notarized local-only DMGs and is separate from the website deploy.

## Agent File Checks

`pnpm agents:check` is the first check for anything under `.claude/`, `.agents/`,
`.codex/`, `AGENTS.md`, `CLAUDE.md`, a nested `<dir>/AGENTS.md`, or `.mcp.json`.
It runs in CI and takes about fifty milliseconds, and `pnpm checks:changed`
recommends it for every path it inventories.

| Drift check | Refuses |
|---|---|
| `claude-agents-bridge` | `CLAUDE.md` that stops importing `@AGENTS.md` |
| `skill-copy` · `agent-copy` | a byte difference between the `.claude` and `.agents` twins, or a file on one side only |
| `at-refs` | an `@reference` that resolves nowhere |
| `agent-language` | Hangul, kana or Han in a file an agent reads. Opt-in through `--english-only`, because a vault or repository may legitimately be written in another language |
| `mcp-grants` | a brief granting `mcp__<server>__*` for a server its own tree's config never declares — `.claude/agents` against `.mcp.json`, `.agents/agents` against `.codex/config.toml` |
| `codex-size-cap` | a merged instruction set over Codex's `project_doc_max_bytes`, measured as root `AGENTS.md` plus the largest nested file, because Codex truncates the merge in silence |

These contracts under `tests/contract/` cover what a single command cannot, and
`pnpm checks:changed` runs them together for the paths they guard:

| Contract | Holds |
|---|---|
| `agent-files` | the CLI and web implementations agree, through one fixture table |
| `nested-agents-pointers` | every rule-covered directory has a pointer naming the rules that reach it, derived from their `paths:` frontmatter |
| `skill-routing` | every shipped skill is named in `AGENTS.md`, ships in both trees, and keeps its frontmatter inside the Agent Skills standard |
| `rules-path-scope` | conditional rules match real files, the resident context ratchets downward only, and `CLAUDE.md` describes its own loading, redirects and asymmetric hooks correctly |
| `secret-read-guard` | `permissions.deny` covers every `.env` name `.gitignore` treats as a secret, without blinding the repository to the tracked `.env.example` |
| `node-test-reachability` | every `node --test` suite runs somewhere, or says in one line why it does not |
| `agent-file-citations` | no rule, skill or brief cites a file that exists nowhere |

Hook wiring is `pnpm test:claude:hooks`; see the git-hooks section above for the
guards that run at commit time.

## Vault Checks

```bash
pnpm vault:validate              # frontmatter integrity audit
pnpm vault:validate /your/vault  # validate any folder
pnpm vault:validate -- --help    # print validator usage without scanning
pnpm test:vault:validate         # focused validator CLI argument contract
pnpm docs-vault:check            # static dogfood manifest freshness
pnpm test:docs-vault             # focused docs-vault build/check helper contract
pnpm docs-vault:build            # refresh static dogfood manifest and public md
pnpm docs-vault:resolve-conflicts -- --dry-run # inspect a ledger/generated-only conflict
pnpm docs-vault:resolve-conflicts # merge append-only records, rebuild, and stage outputs
pnpm gateway:specimen:check      # /download shows one vault file verbatim: is the copy current?
pnpm gateway:specimen            # regenerate it from the vault
pnpm vault:audit                 # dogfood path drift guard
pnpm test:vault:audit            # focused vault audit CLI argument contract
pnpm vault:migrate --list        # registered migrations
pnpm test:vault:migrate          # list/help/dry-run/write/idempotency/dirty guard
pnpm test:guide-examples         # public guide node examples satisfy live UID schema
```

### Generated manifest determinism

`docs-vault:build` writes committed artifacts (`manifest.json`, `content.json`,
`sample-storefront.*`, `dogfood-census.generated.ts`, `public/docs-vault/**`).
They stay committed because static export bakes the sample vault in *and*
`static-vault-source.ts` imports the JSON statically — without them `tsc`,
vitest, lint, and the editor all break. So the generation itself must be
deterministic: **same source in, same bytes out.**

- Doc `updatedAt` and manifest `generatedAt` are **dates** (`YYYY-MM-DD`), never
  times. A time-precision value describes the very commit that carries it, and
  squash-merge / rebase / amend re-stamp that commit — so the baseline would be
  born stale (measured: 24 of the last 25 main commits shipped 1–32 wrong docs).
- The generator never reads the wall clock and never reads its own previous
  output. `pnpm test:docs-vault` proves it by re-stamping a temp repo's commit
  time within the same day and asserting byte-identical output;
  `tests/contract/generated-vault-determinism.contract.test.ts` rejects any
  time-precision value, wall-clock call, `%cI` regression, or prior-output feedback.
- Any workflow job that runs the generator needs `fetch-depth: 0`. A depth-1
  checkout makes the single commit a parentless root, so `git log --name-only`
  attributes the whole tree to it and every doc collapses to one date (measured:
  247 paths → 1 distinct date). The same contract test guards the pairing.
- **Never hand-edit a merge conflict inside these files** — conflict markers left
  in JSON have broken `tsc`. If the complete conflict set is limited to the two
  append-only ledgers and generated docs-vault artifacts, use
  `pnpm docs-vault:resolve-conflicts`; otherwise resolve the authored source
  conflict explicitly.

### Concurrent ledger conflict recovery

`docs/CHANGELOG.md` and `docs/DECISIONS.md` are intentionally newest-first,
append-only ledgers. Two worktrees that both add the next dated record therefore
edit the same hunk, and every deterministic mirror repeats that collision. Git's
`union` merge driver is not used: it keeps both sides but does not guarantee their
order, while an `ours` driver can silently discard the other worktree's record.

The resolver reads Git stages 1/2/3 and accepts only a narrow shape:

- both sides preserve every base record byte-for-byte and in the same order;
- each side may prepend complete `## YYYY-MM-DD ...` records;
- the ledger preamble is unchanged on at least one side;
- every other unmerged path is produced by `docs-vault:build`;
- no untracked or unstaged Markdown can leak into regeneration.

It deterministically combines the new records, runs the canonical generator,
stages both ledgers and all generated artifacts, verifies that no unmerged path
remains, and runs `docs-vault:check`. It never runs `git rebase --continue` or
`git merge --continue`; the person or agent keeps that final boundary. A modified
historical record or any unrelated source conflict is a refusal, not a guessed
merge.

`pnpm test:docs-vault` creates a temporary Git repository with two concurrent
worktree-style branches and proves the original conflict turns into one staged
result containing both records. The same suite probes historical rewrites,
divergent preambles, nested decision headings, duplicate records, and unsupported
source paths.

`health --json`, `agent-brief --json`, and `workspace-brief --json` are fail-closed machine outputs:
malformed diagnosis payloads are command failures, not clean vaults.

Focused diagnosis flags are forwarded to MCP `query_ontology`:

```bash
node $ATLAS/cli/src/index.mjs health ./ontology --dependency-types dependencies
node $ATLAS/cli/src/index.mjs agent-brief ./ontology --component-types domains,domain,capabilities
node $ATLAS/cli/src/index.mjs workspace-brief ./ontology --component-types domains,domain,capabilities
node $ATLAS/cli/src/index.mjs workspace-brief ./ontology --component-limit 5 --node-limit 10
```

## Docs Checks

```bash
pnpm docs:check                  # canonical documentation gates below
pnpm docs:surface:check          # regenerate the MCP/CLI surface and diff it
pnpm docs:surface:build          # refresh docs/.generated/mcp-surface.json
pnpm docs:language               # ratchet unexplained Korean prose by document scope
pnpm source:language             # require English comments in source, tests, and prototypes
pnpm docs:links                  # broken repo links + cited file paths
pnpm docs:comment-refs           # .md paths cited from CODE COMMENTS resolve
pnpm docs:links:external         # opt-in: resolve http(s) links over the network
pnpm test:docs:checks            # focused helper contracts for both scripts
pnpm test:docs:language          # language inventory and exception contracts
pnpm test:source:language        # source-comment scanner and zero-baseline contracts
```

**One rule decides what these may check** (2026-08-01 — `docs/DECISIONS.md`):

> Check only facts a machine can derive. Never pin a sentence written by a person.

The suite that preceded them was 3,419 lines and 2,126 assertions, **1,915 of
which (90%) pinned a sentence in a README.** Those pins caught nothing when a
tool's behavior changed (the sentence still matched) and went red whenever
someone improved the prose. They are gone; these two nets replace them.

- **`docs:language` — inventory, then ratchet.**
  `scripts/quality/markdown-language/check.mjs` reads tracked and untracked Markdown
  from Git and counts Hangul code points without pinning any prose. It scans authored
  sources, while generated `public/docs-vault/**` and byte-mirrored `.agents/**` files
  remain covered by their existing freshness/parity gates. Korean is allowed only in
  the typed `display_ko` frontmatter field and the intentionally localized
  `cli/templates/vault-ko/**` tree. Operational, current, and historical prose have
  separate ratchets so progress in one scope cannot hide regression in another. A
  lower count fails with an instruction to lower the baseline; zero scanned files,
  locale fields, templates, generated files, or mirrors also fails as an idle detector.
- **`source:language` — comments are English; localized data stays localized.**
  `scripts/quality/source-language/check.mjs` scans tracked and untracked TypeScript,
  JavaScript, Rust, C-family, Swift, CSS, HTML, YAML, TOML, shell, and supported
  dotfiles. It parses comment tokens instead of raw text, so Korean runtime strings,
  message catalogs, fixtures, and regular expressions remain untouched. Current code,
  tests/fixtures, and historical prototypes have independent zero baselines. Each scope
  must scan files and comments, preventing an empty inventory from reporting a false
  green result.
- **`cli-output-language.contract.test.ts` — the strings the CLI prints.**
  `source:language` reads *comments*, so a Korean string literal was invisible to it:
  measured 2026-08-25, the CLI carried Korean in 140 lines across 23 files while that
  gate reported a clean zero, and sixteen help rows switched language inside one
  sentence. The debt was translated rather than recorded, so this contract's baseline
  is zero. It counts Hangul code points in non-test `cli/src/**/*.mjs` and names the
  offending file and line; it pins no sentence. `cli/src/lib/absorb.mjs` is the single
  allowlisted path, because its Korean is a *matcher* for the user's own Korean
  document — the same typed data as `display_ko` — and a second assertion proves that
  allowlisted file still holds matcher syntax, so the exception cannot quietly grow to
  cover a file that was merely never translated. `cli/templates/vault-ko/**` stays
  outside the scan as the intentionally localized tree.
- **`docs:surface:check` — generate, then diff.** `scripts/build-docs-surface.mjs`
  boots the real MCP server, asks it `tools/list`, and writes every tool name,
  read/write mode, argument name, and required argument — plus the CLI command
  inventory — into `docs/.generated/mcp-surface.json`. `--check` regenerates and
  fails on any difference, then verifies that `mcp/README.md` and `cli/README.md`
  actually name every registered tool and command. Same shape as Kubernetes'
  `hack/verify-generated-docs.sh` and GitLab's `graphql-verify`. The artifact is
  committed and must stay deterministic — sorted, no timestamps (see *Generated
  manifest determinism* above, which the same discipline governs). Its first run
  found six CLI commands (`absorb`, `agent-activity`, `agent-files`, `export`,
  `index`, `moment`) that had never appeared in the CLI README's command tables.
- **`docs:comment-refs` — the other half of referential integrity.**
  `docs/GLOSSARY.md` §6 tells authors to move long rationale into a markdown file
  and leave a one-line pointer in the comment. That trade only holds if the
  pointer keeps working. The owner named the risk before the first pointer was
  written — *"If folder locations change, everything will break"* — and he was describing a hole
  that already existed: `docs:links` walks **markdown files only**, so every `.md`
  path cited from a `.ts`/`.mjs` comment was outside every gate's field of view.

  Switching it on found 261 citations and **2 genuinely dead pointers**, both
  from docs that had moved to `docs/archive/` while the comments kept the old
  path (`launch-docs-current.test.ts` → `PUBLISH-NPM.md`,
  `verify-macos/payload-contract.mjs` → `TOPOLOGY-MAP-REBUILD.md`). A reader
  following either found nothing.

  `docs/ontology/**` is excluded: that is this project's own vault, so a comment
  naming a node address under it is citing example data, not pointing at
  documentation — 5 of the first 10 hits were exactly that. The check fails on a
  zero count as well as on a missing file, because a scan that sees nothing is
  indistinguishable from a clean repo.

  ⚠️ The two gates carve out **different** things, and that is deliberate:
  `docs:links` has no vault exclusion, so it still catches a *document* citing a
  vault path that does not exist. It caught this very paragraph's first draft.

- **`docs:links` — referential integrity.** Repo-relative markdown links plus
  repo-anchored `.md` paths cited in prose. Fenced code blocks and inline code are
  skipped (examples are not claims). Root-absolute links resolve as docs-vault
  slugs first (`/guide/cli` → `docs/guide/cli.md`). External URLs are **not** in
  the default gate — a third-party outage must never red our build — run
  `pnpm docs:links:external` for those. The prose-citation half skips append-only
  history (`CHANGELOG.md`, `docs/DECISIONS.md`, `docs/archive|audits|plans|prototypes/**`)
  because naming a deleted file is what a changelog is *for*; links are still
  checked there, since a link is a promise to open.
- **`design-doc-token-integrity` — same category, but the target is **tokens**, not files
  (included in contract tests, `pnpm test:contracts`). Checks whether `--token`s cited
  in `docs/DESIGN-SYSTEM.md` inside backticks or `var(...)` actually exist in `app/globals.css`.
  **Why it was created**: The document listed 13 `--topology-*-hover-*` items as evidence that "hover is already backed by tokens," but none existed — starting an audit on that premise would itself be a blind spot (measured on 2026-08-15: **190 out of 393** cited tokens are missing from the repo, 165 of which were removed with the map). `docs:links` only looks at **file paths**, so tokens were outside its field of view.
  As a ratchet it cannot grow; cleaning up the document lowers the upper bound too.

markdownlint is deliberately **not** wired in. Measured 2026-08-01 with default
rules (excluding `node_modules`): ~15,700 violations, 84% of them
`MD013/line-length` (6,731) and `MD060/table-column-style` (6,423) — both of
which this repo violates on purpose. Turning it on would be noise that buries
existing signal, which is the same discipline `.claude/rules/design.md` states
for lint rules. Re-measure before proposing it again.

## MCP And CLI Checks

Use focused scripts first. Escalate only when you touched shared package,
verify, or release behavior.

When in doubt, ask the repo for the narrow starting point:

```bash
pnpm checks:changed
pnpm checks:changed -- cli/src/commands/mcp-verify.mjs mcp/scripts/verify.mjs
```

`pnpm checks:changed` reads tracked changes from `git diff --name-only HEAD`
plus untracked files from `git ls-files --others --exclude-standard`, excluding
local `.agents/` and `.codex/` agent state except shared repo skills,
Codex hooks, and Codex MCP config. Pass paths after `--` to inspect a planned
file set before editing. It prints first checks plus explicit
escalation gates, and is only an advisor; still add runtime/browser checks when
the touched behavior needs them. Vault helper changes route to direct sibling
`pnpm exec node --test ...` checks when available, then to their narrow package
shortcuts: `pnpm test:docs-vault`, `pnpm test:vault:validate`, or
`pnpm test:vault:audit`. Vault migration runner or migration files route to
`pnpm test:vault:migrate` and `pnpm vault:migrate --list` first, and migration
implementations also route to `pnpm test:contracts` so schema-evolution fixtures
stay checked. Public guide edits route to `pnpm test:guide-examples`; the gate
parses complete fenced node frontmatter instead of pinning prose. Any
`docs/**/*.md` change routes to `pnpm docs-vault:check`, because
the static docs vault indexes the whole docs tree, not only `docs/ontology`.
Parser/schema/validator parity changes, including the shared
`tests/fixtures/vault-schema-cases.mjs` fixture, route to
`pnpm test:contracts` before broader package or app checks. MCP core source
changes first print the direct sibling unit command (`pnpm exec node --test
mcp/src/<name>.test.mjs` when one exists), then `pnpm test:mcp:unit` before
readme-flow integration or full dogfood verification. CLI shared helper changes
do the same for `cli/src/lib/<name>.test.mjs`, so run the printed direct
`pnpm exec node --test ...` command before `pnpm test:cli:lib` when only one
helper moved.
Dogfood shortcut helpers, script helpers, focused node-test runner, and
focused-check advisor changes use the same pattern: direct
`pnpm exec node --test scripts/...test.mjs` first, then the aggregate shortcut.
Benchmark and smoke helpers use cheap command-level checks first:
`pnpm benchmark --dry-run`, `pnpm benchmark:scale --dry-run`,
`node scripts/perf-vault.mjs 10`, `pnpm perf:graph:check`, or
`pnpm smoke:onboarding` / `pnpm smoke:memory-loop`, depending on the touched
script.
App/source TypeScript changes under `app/` or `src/` first print a direct
Vitest sibling command (`pnpm exec vitest run <path>.test.ts[x]`) when that
test file exists or is part of the same changed path set.
Source TypeScript files under `src/**/*.ts[x]` also route to
`pnpm exec tsc --noEmit`, so files without sibling tests still get a focused
type-safety gate instead of no mapping.
E2E spec changes under `tests/e2e/` first print the exact Playwright command
(`pnpm exec playwright test tests/e2e/<name>.spec.ts`) so a single journey edit
does not start from the entire E2E suite.
`vitest.config.ts` / `vitest.setup.ts` changes route to a small config smoke:
`pnpm exec vitest run src/shared/lib/cn.test.ts tests/contract/vault-schema.contract.test.ts`.
`playwright.config.ts` changes route to the local-vault picker spec first,
because it exercises the Playwright webServer startup path without beginning
with every browser journey.
`postcss.config.mjs` and `app/globals.css` route to the overflow sweep spec,
which exercises global Tailwind/CSS output across the core responsive routes
without starting from every Playwright journey.
The macOS desktop readiness gate is scaffold-aware and local-first: when
`scripts/check-desktop-readiness.mjs`, `scripts/desktop-doctor.mjs`,
`scripts/desktop-smoke.mjs`, `scripts/package-macos-dmg.mjs`,
`scripts/verify-macos-app-launch.mjs`, `scripts/verify-macos-dmg.mjs`,
`scripts/verify-macos-install-smoke.mjs`,
`scripts/check-macos-download-release.mjs`,
`scripts/check-macos-release-secrets.mjs`, `scripts/check-macos-release-source.mjs`,
`scripts/check-macos-release-tag.mjs`,
`scripts/check-macos-release-slot.mjs`, `scripts/check-macos-release-github.mjs`,
`scripts/watch-macos-release-run.mjs`,
`scripts/sign-macos-app.mjs`,
`scripts/notarize-macos-dmg.mjs`,
`src/shared/lib/tauri-vault-fs.ts`, `docs/DESKTOP-MACOS.md`, `src-tauri/**`,
`package.json`, `.github/workflows/release-macos.yml`,
`.github/workflows/deploy-pages.yml`, or `next.config.ts`
changes, run `pnpm desktop:check`; checker implementation changes also route to direct
`pnpm exec node --test scripts/check-desktop-readiness.test.mjs` and doctor
implementation changes route to
`pnpm exec node --test scripts/desktop-doctor.test.mjs`. Desktop smoke
implementation changes route to
`pnpm exec node --test scripts/desktop-smoke.test.mjs`, then
`pnpm test:desktop:check`. The desktop checker suite also covers the
operator-side GitHub release gate (`scripts/check-macos-release-github.mjs`) with
a fake `gh` binary, so workflow availability, main-only environment policy,
required Apple/Tauri secret-name detection, tag/version alignment, stale
same-tag Git refs, and stale release-slot failures stay covered before protected
dispatch. It also covers `scripts/watch-macos-release-run.mjs` so the post-tag
operator command dispatches from `main` and selects the exact tag-named
workflow_dispatch run before handing control to `gh run watch`, and
`scripts/lib/macos-dmg-layout.mjs` so DMG mount parsing plus the drag-to-Applications
symlink target stay covered before install smoke.
Native vault bridge changes route to
`pnpm test:desktop:bridge`, which runs the WebView handle-shim tests plus
`cargo test --manifest-path src-tauri/Cargo.toml` for the Rust path guard.
The broader `pnpm test:desktop:check` suite caps Node's file concurrency at four:
its loopback-heavy release fixtures otherwise create a connection burst that can
fail unrelated tests with `EADDRNOTAVAIL` on a 12-core machine.
Its release-script contract checks required commands, ordering, flags, positive
bounds, and the source-dogfood exclusion semantically; harmless extra checks or
flag reordering do not invalidate the gate.
`pnpm desktop:doctor` reports local Tauri / Cargo /
rustc / Xcode command-line-tool readiness plus the dogfood vault, CLI/MCP
handoff gate, offline desktop docs, and the current local `.app` signing state
before `.app` / `.dmg` builds. Ad-hoc local prototype bundles remain a warning;
public direct downloads require Developer ID signing and notarization. `pnpm
desktop:check` also requires the `package.json`, `src-tauri/tauri.conf.json`,
and `src-tauri/Cargo.toml` versions to match so app metadata, DMG filenames, and
release tags move together, and requires the root package to stay free of
Firebase SDK, Firebase Admin, and Firebase CLI dependencies so the local-only
app package cannot silently absorb the separate Hosting deploy toolchain;
`pnpm desktop:release-tag` compares the v-prefixed Git tag to those versions
before signing; `pnpm desktop:release-source -- --mode=admit` fails closed unless
the requested tag, supplied SHA, and current default-branch head agree, while
`--mode=pin` rechecks the admitted tag/SHA after `main` is allowed to advance;
`pnpm desktop:release-slot` fails
closed before GitHub Release upload when that same tag already has a draft,
prerelease, or public release so stale DMG assets cannot mix with the freshly
signed artifacts; `pnpm desktop:smoke` verifies the built `out/` payload has
the root app entry, current locale-prefixed workbench routes, `/ontology` →
Topology and `/ontology/edit` → Workshop compatibility redirect chunks,
`_next` assets, and offline desktop docs. Missing build artifacts still point
to `pnpm build`; title/copy/component mismatches are reported as static
contract drift instead of prescribing the same build again;
`pnpm desktop:verify-app` launches the built `.app` long enough to catch early
Tauri/WebView startup crashes from inside the app executable directory and then
terminates it; the default direct-executable check now also requires the Tauri
WebView DOM probe to report a loaded `tauri://` document with non-empty
Ontology Atlas body text. The verifier takes a per-app lock before any
`--kill-existing` cleanup, so two local app checks cannot terminate each other
and produce a misleading early-exit failure. Because the app now allows a single
instance, a launch over an already-running copy would focus the running window
instead of starting one, so a run without `--kill-existing` refuses outright
rather than measuring the previous build and calling it green.
`--reset-window-state` moves the saved window geometry
(`~/Library/Application Support/<bundle id>/.window-state.json`) aside for the
run and restores it afterwards: the release preflight asserts a claim about the
*default* window, so it must not be adjudicated by whatever size a developer
last dragged the window to, and the harness must not write its own geometry back
over the owner's. The cleanup also targets stale
macOS `.app` copies with the same `Contents/MacOS/ontology-atlas` executable
name, so an installed app cannot keep the same bundle id alive beside the fresh
build under test. Add
`-- --kill-existing --open-app --require-window --require-capturable-window --require-accessibility-window --require-owner-name="Ontology Atlas" --min-window-size=1040x720 --reset-window-state`
when a local dogfood session needs to clear stale packaged-app processes,
launch through macOS LaunchServices, and fail unless the real Ontology Atlas
window appears at desktop-builder size and can produce a local screenshot
artifact before the final Computer Use observation. Add repeated
`--require-accessibility-text="..."` options when explicitly checking whether the
current app build exposes expected workbench copy through the macOS Accessibility
tree. Use `--print-window-diagnostics` with capture checks when preserving the
CoreGraphics window, AX row, and capture failure evidence is more useful than a
bare `screencapture` failure. Add `--require-frontmost` to separate foreground
activation failures from generic visible-window failures before handing the app
to Computer Use.
tree;
`pnpm desktop:verify-ai-settings:ko` is the installed-app proof for the keyless
**connect-by-address** branch (Ollama · LM Studio · llama.cpp): it opens the
settings sheet inside the packaged WebView, walks into AI connection, chooses
the local/address row, types the base URL (`--ai-settings-base-url=`, default
`http://localhost:11434`), presses the connection check, and requires a live
model list plus a chosen model. It is the first non-map interaction verifier, so
it is also the pattern to copy for the next one. **It cannot pass without a
running local runner** — an unreachable address is reported with the exact
failure sentence the user would read, never as a silent success — and after the
DOM proof it reads `<fixture vault>/.ontology-atlas/llm-audit.jsonl` and
requires a fresh `provider: "local"` verify line whose `host` matches the address
that was typed. That second check exists because the on-screen audit table never
renders the host: without it, screen wording alone could pass;
`pnpm desktop:verify-install` mounts the DMG, verifies the
Applications symlink points to `/Applications`, copies the app to a temporary
install folder, verifies that copied app through the LaunchServices app content
proof gate with stale-process cleanup, executes the copied bundle's
`Contents/MacOS/ontology-atlas-mcp` against `docs/ontology`, and only then
removes the temp install;
`pnpm desktop:release-preflight` is the local pre-tag operator shortcut that
runs desktop readiness, docs-vault freshness and vault validation, desktop
checker tests, runtime split tests, builds the bundled MCP sidecar before native
bridge tests, then runs the runtime doctor, static build, packaged-route smoke,
app/DMG build, app launch smoke, DMG mount/checksum smoke, and temporary install
launch smoke. Source-checkout MCP walking, fallback execution, and semantic
readiness remain in the separate `dogfood:release-gate` lane;
`pnpm desktop:release-artifact` is the credentialed direct-download artifact
path: it requires Developer ID/notary secrets, rebuilds the static app, route
smokes the packaged output, builds the `.app`, signs it, packages the DMG,
notarizes/staples it, verifies the signed/notarized DMG, and install-smokes the
final artifact;
`pnpm desktop:goal-audit -- --pr=<number> --tag=<tag>` requires PR and tag
evidence before starting the expensive local preflight, then chains that
preflight with the full public release/hosted download blocker audit, so a
single operator command proves both the installed-app artifact path and the
public download readiness path before a desktop goal is marked done. Unless
overridden, it writes the same final audit evidence to
`.tmp/desktop-goal-status.json` and `.tmp/desktop-goal-status.md` so the goal
handoff has stable local artifacts even when terminal output is truncated;
`pnpm desktop:release-status -- --pr=<number> --tag=<tag>` is the macOS app
completion audit after PR/release work: it accepts an already merged PR only
when that PR is the latest merged PR on the release branch, or checks
tag/package/Tauri/Cargo version alignment, PR review/merge readiness,
active macOS release workflow availability, clean local and remote same-tag Git
ref slots, required Developer ID direct-download signing/notary secret names, public stable GitHub
Release state, and public DMG/checksum download
verification in one fail-closed pass. When PR checks block the release it names
the failing or pending GitHub check rows and prints the matching `gh pr checks`
command, so operators do not have to infer the blocker from a count like
`0/1 checks successful`. Add `--json` when a goal runner, CI wrapper, or release
dashboard needs `ready`, `blockerCount`, and per-check `next` actions without
parsing human text; stdout JSON is compact so small goal-runner buffers do not
truncate it. Add `--json-file=<path>` when the command is invoked through a
package runner that may add lifecycle text around stdout or when humans need a
pretty JSON artifact, and add `--markdown-file=<path>` when a reviewer or release
operator needs a human-readable checklist artifact. The JSON snapshot
includes `schemaVersion`, `generatedAt`, `status`, `readyAt`, and `blockedAt`
so stored release evidence can be versioned, ordered, and filtered by outcome;
top-level `blockerIds`, `localBlockerIds`, `externalBlockerIds`,
`blockersByOwner`, `nextActions`, and `nextActionsByOwner` summarize the blocked
checks, and each check also carries a stable `id`, `scope`, and `owner` such as
`pull_request`, `apple_release_secrets`, `github_release`, and `download_assets`
so automation does not branch on translated or edited labels. Actionable
blockers include `commands[]` entries and Developer ID direct-download signing
blockers expose top-level `missingSecrets[]`, so follow-up runners can execute
known diagnostics,
environment-secret setup prompts, pre-dispatch source checks, post-merge tag
creation/push, exact protected workflow dispatch/watch, and public download
verification without parsing prose. The default terminal output and markdown
checklist also print the same next actions grouped by owner, so reviewers,
release operators, and website operators can see their handoff slice before the
detailed blocker list. The default terminal output prints the same command
groups under each blocker, so an operator running the audit directly does not
have to open the JSON or
Markdown artifact to find the next command.
The generated post-merge tag commands resolve the repository's current default
branch through `gh repo view ... defaultBranchRef` before `git fetch`, `git tag`,
source admission, and dispatch, so the operator uses one branch value throughout.
The Markdown checklist labels
command groups as one-shell-session commands because the default-branch
variable is intentionally shared by the following fetch, source-check, and tag
commands.
The hosted GitHub Pages website is not part of the macOS
app release gate; verify the separate website with `pnpm desktop:verify-hosted`.
`pnpm desktop:dev` launches the Tauri shell for local prototype work, and
`pnpm desktop:build:app` targets the macOS `.app`; release builds must first
pass `pnpm desktop:release-secrets`, then run `pnpm desktop:sign` with a
Developer ID Application certificate and deep hardened-runtime signing, wrap the app with
`scripts/package-macos-dmg.mjs`, run `pnpm desktop:notarize` with Apple notary
credentials, and finish with `pnpm desktop:verify-release-dmg`, which checks the
DMG checksum, mounts it read-only, verifies the `.app` plus Applications symlink target,
requires strict app code-signature verification, validates the stapled
notarization ticket, and runs Gatekeeper assessment for the app execution and
DMG open paths before release upload. The release workflow decodes the Developer
ID `.p12` with macOS `base64 -D`, and also deletes the
temporary signing keychain and decoded `.p12` with an `always()` cleanup step
after the per-architecture artifact handoff. `desktop:release-secrets --help`
names each direct-download secret by role: `APPLE_CERTIFICATE_P12_BASE64` and
`APPLE_CERTIFICATE_PASSWORD` import the Developer ID Application certificate,
`APPLE_KEYCHAIN_PASSWORD` protects only the temporary CI keychain,
`APPLE_SIGNING_IDENTITY` is passed to `codesign`. Hosted notarization uses
`APPLE_API_KEY_P8_BASE64`, `APPLE_API_KEY_ID`, and `APPLE_API_ISSUER_ID`;
the private key is materialized as a temporary `0600` file and `notarytool`
receives only its path and identifiers, never password or private-key bytes in
argv. They are required for signed and notarized public DMGs from the
project website/GitHub Releases path, not for Mac App Store submission.
For installed-app dogfood, use `pnpm desktop:deploy:app`. It calls
`desktop:build:app:local`, which overrides only
`bundle.createUpdaterArtifacts=false` so a release updater private key is not
required, then replaces `/Applications/Ontology Atlas.app` and runs the local
app/WebView proof. Do not use that local build as a release artifact:
`desktop:build:app` remains the release path and keeps updater artifacts enabled.
`pnpm desktop:build` keeps the local identity-unsigned prototype shortcut by
running the updater-disabled app build, ad-hoc signing the complete bundle, and
then packaging the DMG. The ad-hoc signature supplies bundle integrity only; it
does not claim a Developer ID identity or replace the credentialed release path.
Before a release is made public, the protected dispatched workflow runs
`pnpm desktop:verify-download -- --allow-draft` against the draft GitHub Release
assets with `github.token`; after publishing, run `pnpm desktop:verify-download`
to confirm the public GitHub Release exposes reachable Apple Silicon
(`aarch64`) and Intel (`x64`) macOS DMGs plus matching `.sha256` assets whose
contents name the same DMG files and match the downloaded DMG bytes. The two
architecture DMGs must carry the same version in their filenames, each
architecture may appear only once, and that
version must match the release tag. Any extra `ontology-atlas_*.dmg` asset with
an unsupported architecture suffix fails the gate so the GitHub Release page
cannot present stale or ambiguous downloads; draft releases intentionally fail
unless `--allow-draft` is passed because the hosted root map cannot serve
them to users. The draft path also falls back to the releases list when GitHub
hides draft releases from tag lookup, then matches the requested `tag_name`
before byte-checking assets.
After deploying the static website, run `pnpm desktop:verify-hosted` to confirm
the live `/ko/` root route renders the topology map directly (root-first-open,
no marketing landing detour) and offers the local-folder open CTA, and that
the live `/ko/download/` installation route exists, carries the absorbed
intro section, and points directly to the stable GitHub Releases page, not
`/releases/latest`. This hosted-page check is separate from `pnpm desktop:release-status`
so a GitHub Pages deployment problem cannot block the local-only macOS app release.
When `/ko/download/` returns 404, the recovery path is to merge the desktop PR
so `.github/workflows/deploy-pages.yml` is available on the default branch,
run `gh workflow run deploy-pages.yml --repo wlsdks/ontology-atlas`, then
rerun `pnpm desktop:verify-hosted`.
The installed app's native vault bridge is part of this same gate:
`src-tauri/src/lib.rs` must expose folder-pick, directory-list, read, write,
file/directory delete, mkdir, and exists commands, and
`src/shared/lib/tauri-vault-fs.ts` must wrap the same commands as a handle shim
through `@tauri-apps/api/core` `invoke` / `isTauri`, not private Tauri
internals, so the existing local-vault manifest and editor paths run inside the
WebView. The Rust bridge also canonicalizes vault paths and nearest existing
parents so symlinks inside the vault cannot redirect read, write, mkdir,
exists, or remove operations outside the selected root. The default Tauri
capability stays scoped to the `main` window with `core:default` only, without
broad filesystem, shell, HTTP, or opener plugin permissions. `src-tauri/Info.plist`
must also explain selected vault-folder access for protected macOS locations
such as Documents, Downloads, Desktop, network volumes, and removable volumes.
The installed app must also keep first-run
entry local: `src/views/root-entry/ui/RootEntryPage.tsx` routes Tauri sessions
without a restored vault to `/docs/?intent=local` without rendering the hosted
marketing page, and `DocsVaultPage` shows a vault setup welcome that opens the
native picker only after an explicit user action. Hosted browser sessions must not treat `/docs/?intent=local` as a vault
opening path; they keep local vault work disabled and leave installation as the
path to writable local work. Runtime split changes in `RootEntryPage`,
`DocsVaultPage` persistence, or `AppSettingsMenu` route to
`pnpm test:desktop:runtime` before the broader readiness gate. A loaded empty local vault must surface the
ontology starter in the main workspace pane and select the generated `README.md`
after creation, so the desktop first-run path does not dead-end behind a generic
empty document state.
`src/shared/lib/tauri-vault-fs.test.ts`
locks the handle shim against the command names and relative-path behavior used
by those flows. `VaultAgentSetupPanel` (App Settings → MCP/Agents) and
`LocalVaultPicker` (App Settings → Workspace) keep the Tauri absolute
vault path visible, copyable, and openable in Finder for local data location
proof. `OntologyStarterCta` uses that same selected path when it copies CLI
proof and JSON agent-gate commands, so first-run desktop users do not have to
`cd` into the vault before checking agent readiness. The AI agent setup panel
uses the selected path for its verification prompt, CLI graph runbook, and JSON
gate as well, and the copied setup packet, first-contact proof, setup-state
check, and repair command reuse that selected path while preserving `.` fallbacks
for browser or source-checkout contexts. The picker exposes recently opened desktop vaults from persisted
Tauri paths so close/reopen does not require another Finder selection. The
handle store filters those Tauri path records outside the Tauri runtime, so a
hosted browser session cannot resurrect installed-app vault paths as writable
local state.
`next.config.ts` is static-export source-of-truth; changes route to
`pnpm desktop:check`, `pnpm exec tsc --noEmit`, and `pnpm build`.
Next App Router entries under `app/**/*.ts[x]` and `next-env.d.ts` route to
`pnpm exec tsc --noEmit`, so route exports, metadata routes, and page/layout
type drift are caught before broader browser or build checks.
Locale routing under `src/i18n/*.ts` and message catalogs under
`messages/*.json` route to `pnpm test:i18n:messages`; changes to the message
validator test itself first print
`pnpm exec node --test scripts/validate-messages.test.mjs`; i18n TypeScript
files also route to `pnpm exec tsc --noEmit`.
`eslint.config.mjs` changes route to `pnpm lint`. `tsconfig.json` changes route
to `pnpm exec tsc --noEmit` plus the CLI/MCP repo-analysis focused integrations,
because `infer_imports` also reads TypeScript path aliases.
GitHub release and community files (`.github/workflows/release-macos.yml`,
`.github/PULL_REQUEST_TEMPLATE.md`) route to `pnpm test:mcp:docs` and
`pnpm test:mcp:package`, with `pnpm package:check` as the escalation. Routine
commit and push checks are intentionally operator-driven instead of enforced by
a local git hook.
GitHub community templates under `.github/ISSUE_TEMPLATE/*.yml` and
`.github/DISCUSSIONS-CATEGORIES.md` route to `pnpm test:mcp:docs`, so issue and
discussion intake copy is checked with the rest of the public agent workflow
docs.
CLI/MCP verify help changes route to `pnpm test:dogfood:script-refs` too,
because those help surfaces list root `pnpm ...` shortcuts.
Claude Code/Codex agent rules and skills under `.claude/rules/*.md`,
`.claude/skills/*/SKILL.md`, and
`.agents/skills/*/SKILL.md` also route to
`pnpm test:dogfood:script-refs`, because those files contain executable
workflow snippets that should not drift from package scripts.
Claude Code/Codex hook wiring and publish guard changes under
`.claude/hooks/*.sh`, `.claude/settings.json`, `.codex/hooks/*.sh`, or
`.codex/hooks.json` route to `pnpm test:claude:hooks`.
Root/MCP/CLI README changes and this file also route to that gate when they may
change scanned `pnpm ...` references.
Changes to `scripts/check-package-contracts.mjs` or its test first route to
direct `pnpm exec node --test scripts/check-package-contracts.test.mjs`, then
to `pnpm test:mcp:docs`, because that mixed contract file owns public docs and
dogfood docs assertions as well as package/release assertions.
Root `pnpm-lock.yaml` and MCP/CLI package lockfiles route to
`pnpm test:mcp:package` plus `pnpm package:check` escalation, so dependency
resolution changes are not left with a no-mapping advisor result. MCP lockfile
changes still show `pnpm dogfood:verify` as an escalation because they touch the
agent runtime package directly; CLI lockfile changes stay on package contracts
unless the changed behavior itself needs installed-style dogfood verification.
Local verification remains operator-driven. The repository intentionally does
not ship a push/PR GitHub CI workflow; run the focused commands below before
committing or publishing changes.

| Command | Use when |
|---|---|
| `pnpm package:check` | Package files, lockfiles, entrypoints, docs contracts, and graph hot-path perf budget |
| `pnpm design:ontology` | Current ontology-workbench design guard: forbidden visual patterns across Source Vault, Workshop, Insights, navigation, INDEX, and shared UI; Source Files/Graph/Agent execution contract; Workshop compass write/MCP handoff; Insights exact five-question tab set, maintenance-board/one-panel state, and tab-scoped agent handoff; Product Design OS/reference-permission contracts; and Relief/Topology token anti-pattern contracts |
| `pnpm desktop:check` | macOS desktop Tauri scaffold readiness gate for static export, image mode, docs-vault freshness, CLI/MCP verification, desktop-grade quality bar coverage, route smoke scope, and `src-tauri` shell files |
| `pnpm desktop:doctor` | Local machine prerequisite report for macOS desktop builds: Tauri CLI, Cargo, rustc, Xcode command line tools, CLI/MCP agent setup gates, and non-blocking local `.app` signing state |
| `pnpm desktop:smoke` | Built `out/` payload smoke for the packaged root entry; current EN/KO titles; Download install/vault/AI handoff copy and fact/checksum/release markers; Docs header/viewer/source-contract markers; `/ontology` → `/topology?index=expanded` and `/ontology/edit` → `/topology` contextual edit/create compatibility redirects; Topology canvas-v2/focus/path markers; Insights `maintenance-board` / `one-tab-one-question` / `tab-query` markers; `_next` assets; and offline desktop docs. Missing artifacts advise `pnpm build`; title/copy/chunk mismatches advise current-source contract review instead of a redundant rebuild. |
| `pnpm desktop:perf` | Static artifact size gate: hard-fails total `_next/static` size and the largest JS/CSS chunk, while reporting total `out/` and `.app` sizes as informational metrics. It does not measure startup; `desktop:verify-app` proves packaged runtime/WebView startup and `cli:mcp-verify` proves MCP startup separately. |
| `pnpm desktop:build:app` | Build the Tauri `.app` before optional release signing or local DMG packaging |
| `pnpm desktop:build:app:local` | Build the local dogfood `.app` with updater artifacts disabled; never use it for a public release |
| `pnpm desktop:deploy:app` | Build through the local-only path, replace `/Applications/Ontology Atlas.app`, and run installed-app/WebView verification without requiring release updater signing keys |
| `pnpm desktop:stage-hosted-updater` | Copy and validate the newest non-draft GitHub Release `latest.json` (including RC builds) into the Pages artifact at `out/update/latest.json` |
| `pnpm desktop:verify-app` | Launch the built `.app` from its executable directory long enough to catch early Tauri/WebView startup crashes and require the packaged WebView DOM to report loaded `tauri://` Ontology Atlas content, then terminate it; locks per app path before stale-process cleanup; supports `--kill-existing --open-app --require-window --require-capturable-window --require-accessibility-window --require-accessibility-text=...` for LaunchServices dogfood checks with CoreGraphics metadata, local screenshot capture, Accessibility-window assertions, and app-content text proof before separate Computer Use observation |
| `pnpm desktop:verify-ai-settings:ko` | Installed-app proof for the keyless connect-by-address LLM branch: opens the settings sheet, walks into AI connection, types the base URL, presses the connection check, requires a live model list and a chosen model, and then requires a matching fresh `provider: "local"` verify line in the fixture vault's `.ontology-atlas/llm-audit.jsonl`; fails with the on-screen failure sentence when no local runner answers |
| `pnpm desktop:verify-install` | Mount the DMG, require the `/Applications` symlink target, copy the app to a temporary install folder, verify that copied app through the LaunchServices app content proof gate (`--open-app --require-window --require-owner-name="Ontology Atlas" --min-window-size=1040x720 --require-accessibility-text="Ontology Atlas"`), execute its bundled MCP sidecar against `docs/ontology`, then clean it up |
| `pnpm desktop:release-preflight` | Local pre-tag macOS release gate: readiness, docs-vault freshness and vault validation, checker tests, runtime split tests, bundled MCP sidecar build before bridge tests, runtime doctor, build, route smoke, LaunchServices app content proof (`--open-app --require-window --require-owner-name="Ontology Atlas" --min-window-size=1040x720 --require-accessibility-text="Ontology Atlas"`), unsigned DMG, and install smoke. Source dogfood/readiness stays in `dogfood:release-gate` |
| `pnpm desktop:release-artifact` | Credential-isolating direct-download orchestrator: each of 11 build/sign/package/notarize/verify steps receives only its explicit secret allowlist |
| `pnpm desktop:goal-audit` | Full desktop goal gate: requires `--pr` and `--tag`, runs the local release preflight, then checks PR, signing, and GitHub Release / download blockers, writing default `.tmp/desktop-goal-status` evidence with `local_preflight=ok` only after the native app and DMG install proof have passed locally |
| `pnpm test:desktop:runtime` | Hosted-vs-installed runtime split tests for `/docs?intent=local`, first-run desktop routing, and hosted download routing |
| `pnpm test:desktop:bridge` | WebView handle-shim tests plus Rust path-guard tests for the native vault bridge |
| `pnpm desktop:release-secrets` | Default: require Apple 5 + Tauri updater 2 and validate both PKCS#12 and App Store Connect `.p8`; `--updater-only`: require the two Tauri values before Windows build |
| `pnpm desktop:release-source` | `--mode=admit` binds tag + SHA to current default-branch head; `--mode=pin` later rejects tag retargeting while allowing main to advance |
| `pnpm desktop:release-tag` | Fail closed before release signing when the v-prefixed Git tag does not match package.json, Tauri, Cargo, and the download page's release facts (`src/views/download/lib/release-facts.ts`) |
| `pnpm desktop:release-slot` | Fail closed before GitHub Release upload when the same tag already has a draft, prerelease, or public release |
| `pnpm desktop:release-github` | Operator-side check for active workflow, automatic main-only `release-signing`, reviewed main-only `release`, API 3 environment secrets + retained certificate/updater 4 repository secrets, no over-scoped API copies, optional tag/version alignment, and clean pre-release tag/Release slots. The explicit `--allow-obsolete-repository-secrets` transition option permits only unused legacy Apple ID/password/team names through one proof release; the normal gate remains strict before and after it. |
| `pnpm desktop:release-run` | Dispatch `release-macos.yml` from protected `main` with the tag input, then select the exact tag-named workflow_dispatch run at the admitted SHA and watch it |
| `pnpm desktop:release-status` | Completion audit for version/PR/workflow/tag state, protected environments and secrets, public stable Release/download proof, and owner-grouped handoff actions |
| `pnpm desktop:sign` | Deeply sign the built `.app` with hardened runtime when `APPLE_SIGNING_IDENTITY` and a Developer ID certificate are available |
| `pnpm desktop:notarize` | Submit, staple, validate, and re-checksum the DMG through a local keychain profile or App Store Connect API key path; password argv is rejected |
| `pnpm desktop:verify-dmg` | Mount and named-checksum smoke for the generated macOS DMG, including app bundle presence and `/Applications` symlink target, before GitHub Release upload |
| `pnpm desktop:verify-release-dmg` | Release-only DMG verifier that treats notarization as requiring strict app code signing, stapled notarization, and Gatekeeper assessment |
| `pnpm desktop:verify-download` | Public GitHub Release verifier for the hosted download CTA: requires non-draft reachable same-version Apple Silicon and Intel DMG assets, rejects unsupported or duplicate-architecture `ontology-atlas_*.dmg` names, and verifies matching `.sha256` contents and downloaded bytes |
| `pnpm desktop:verify-hosted` | Live hosted website verifier: requires `/ko/` to be promo/download-first and `/ko/download/` to exist with the stable GitHub Releases CTA plus AI-agent MCP/CLI access step, rejecting stale browser-vault CTAs and `/releases/latest` |
| `pnpm test:desktop:check` | Desktop readiness checker contract, with Node file concurrency capped at four for loopback-heavy release fixtures; use direct `pnpm exec node --test scripts/check-desktop-readiness.test.mjs` first when printed |
| `pnpm exec tsc --noEmit` | TypeScript and Next config type safety |
| `pnpm test:i18n:messages` | Locale routing/message catalog parity |
| `pnpm test:claude:hooks` | Claude Code/Codex hook wiring and npm publish guard |
| `pnpm exec vitest run <path>.test.ts[x]` | Direct app/source sibling test printed by `pnpm checks:changed` when available |
| `pnpm exec vitest run src/shared/lib/cn.test.ts tests/contract/vault-schema.contract.test.ts` | Vitest config/setup smoke for jsdom setup plus contract discovery |
| `pnpm exec playwright test tests/e2e/<name>.spec.ts` | Direct E2E spec printed by `pnpm checks:changed` for changed Playwright specs |
| `pnpm exec playwright test tests/e2e/local-vault-picker.spec.ts` | Playwright config/webServer smoke before broader E2E |
| `pnpm exec playwright test tests/e2e/overflow-sweep.spec.ts` | Global CSS/PostCSS responsive overflow smoke |
| `pnpm lint` | ESLint and FSD boundary config |
| `pnpm knip` | JavaScript/TypeScript dead-code analyzer for frontend, scripts, CLI, and MCP scope adapters. Configuration hints and empty subject lanes are fail-closed setup errors; files, dependencies, and cycles are blockers. Exact witnessed exceptions are the only exclusions, while exports/types ratchet downward only; it never auto-fixes. Rust/Tauri remains compiler- and `cargo test`-verified rather than being claimed as Knip coverage. Runs in `Checks` → `Unit · Contract` after root and MCP installs and in the repo-wide pre-push lanes. |
| `pnpm checks:changed` | Suggest first focused checks from changed paths |
| `pnpm exec playwright test tests/e2e/korean-word-break.spec.ts` | Korean text must not break **mid-word**. Walks five destinations at 1512×900, takes a `Range` per character, and at every y-change (a wrap) inspects the characters on both sides: two Hangul syllables with no whitespace between them is a word split open. Wraps at spaces are normal and are not counted. lint cannot see this layer — the violation leaves **no value in the code** (a missing `break-keep` is the *absence* of a class, and absence has no selector), and the real criterion is not the class but whether it actually broke: a wide enough column wraps cleanly with `word-break: normal`. Carries an anti-idle count of multi-line Korean texts examined, because "0 breaks" is also true when nothing ever wrapped. Found two live defects the day it was written (2026-08-12): the agent-readiness hint on `/ontology/insights` and the Windows unsigned-build warning on the gateway |
| `pnpm exec playwright test tests/e2e/open-vault-cta.spec.ts` | Dead-end CTA gate, folder edition: every painted sentence that says "open your folder" across the audited routes must have a folder-opening path inside its own box, that path must **actually call the picker** (stubbed and counted, because a button that renders and does nothing passes a visibility check), and it must degrade to the app download when FSA is unavailable. Replaces the single-route check that used to live in `screen-hierarchy.spec.ts`, which only asserted the URL changed — the destination it asserted (`/`) was itself a dead end for a web visitor with no vault. Exemptions are per-route with a written reason; two liveness guards, since a green run needs both "sentences were found" and "at least one pairing was detected" |
| `pnpm exec playwright test tests/e2e/gateway-reading-reach.spec.ts` | Can a narrow viewport still reach the reading surfaces? Walks the four gateway routes at 1512/768/390 and requires a live path to `/guide` and `/changelog`, plus **five or more distinct chapters** once you are inside the guide. Counting "links containing /guide" is not enough — the first version did that and stayed green with the chapter list deleted, because the page's own index link satisfied it. A closed disclosure is opened once before counting: hidden-until-tapped is not a dead end, missing is. Also pins the narrow chapter list equal to the wide one, so the table of contents cannot become two lists |
| `pnpm exec playwright test tests/e2e/insights-badge-agreement.spec.ts` | The insights "To-do" tab badge must equal the sum of the rendered work-group badges plus the repair queue's blocking chips. It read 7 while the group heading right below it read 8, because the verdict and the group counts each kept their own hand-maintained section list and duplicates were missing from one. The section totals now flow from a single `Record<QueueSectionKey, number>`, so adding a section fails typecheck first — this gate covers the layer after that: what the screen actually prints |
| `pnpm exec playwright test tests/e2e/screen-hierarchy.spec.ts` | Screen hierarchy across every audited route: no painted text ≥ the largest painted h1 outside it, and at most one accent-filled control per screen (tokens read from `:root` at runtime, 24×44 size floor keeps 8px data-marks out). Was one route; the single-route version stayed silent on every screen built after it. Exemptions are per-route with measured values and their own tripwires — the map/docs "no painted h1" state, the studio 14px title tie, and the edit form's twin save CTAs each fail the moment they change. `HIERARCHY_PROBE=<kind>` plants violations to prove each layer still fires |
| `pnpm exec vitest run tests/contract/schema-copy-sync.contract.test.ts` | The CLI's `schema.mjs` must stay byte-identical to the canonical `mcp/src/schema.mjs`. The two are an intentional copy (no shared package — each is baked into its own execution entrypoint), which means import-graph tools see them as unrelated files and no other check could catch drift. Siblings (absorb, parse-frontmatter, interop-format) already had sync locks; the schema was the one copy without one. On drift the failure names the first differing line and the fix direction (mcp is canonical). Carries an anti-idle floor (canonical > 10KB) so two empty files never count as "in sync" |

| `pnpm test:checks:changed` | Changed-path focused-check suggestion helper; use the direct `pnpm exec node --test scripts/lib/focused-check-suggestions.test.mjs` or `scripts/suggest-focused-checks.test.mjs` first when printed |
| `pnpm test:cli:args` | CLI argument parser contracts |
| `pnpm test:cli:lib` | CLI shared helper contracts; use the direct sibling `pnpm exec node --test cli/src/lib/<name>.test.mjs` first when `pnpm checks:changed` prints one |
| `pnpm test:cli:mcp-call` | CLI MCP wrapper parser/spawn behavior |
| `pnpm integration:cli` | Full CLI integration contracts; use when `cli/src/integration.test.mjs` itself changed |
| `pnpm integration:cli:entry` | CLI entrypoint, help, command inventory, and `init` contracts |
| `pnpm integration:cli:compile` | CLI compile / `--fix` canonicalization contracts |
| `pnpm integration:cli:diagnosis` | CLI `health` / `agent-brief` / `workspace-brief` diagnosis contracts |
| `pnpm integration:cli:graph-read` | CLI read-only graph command contracts, including `match-nodes` / `match-edges` scans, `explain` relation evidence, `domain-matrix` coupling summaries, `reachability`, bounded `all-paths --plan` traversal guards, explicit `pattern-walk` traversals, and `project-map` containment summaries |
| `pnpm integration:cli:graph-write` | CLI graph write dry-run/confirm safety contracts |
| `pnpm integration:cli:repo-analysis` | CLI `index` / `analyze` / `infer-imports` / `architecture` / `bootstrap` code-to-vault contracts |
| `pnpm integration:cli:local-vault` | CLI local vault `add` / `import` / `list` / `find` / `validate` contracts |
| `pnpm integration:cli:growth` | CLI `growth_plan` wrapper, candidate rendering, malformed payload, and argument contracts |
| `pnpm test:contracts` | Cross-package schema/parser contracts |
| `pnpm test:architecture` | Architecture profile parser/conformance, web↔MCP parity, Living Blueprint interaction, focused `inspect_architecture`, and CLI `architecture --json` contracts. Import-usage probes require declared type-only exclusions to stay non-violating, upward value imports to remain violations, and unclassified usage to remain unknown. The changed-path advisor also adds the rendered mobile reachability E2E. Probed by changing the shared fixture contract to `architecture-profile/v0`: the gate failed 10 tests, then returned green after restoration. |
| `pnpm test:mcp:docs` | Explicit root/MCP/CLI/dogfood docs contracts plus MCP registration-template guards |
| `pnpm test:mcp:registration` | Source-checkout `.mcp.json` / `.mcp.json.example` / `.codex/config.toml` registration templates |
| `pnpm test:mcp:unit` | Every `mcp/src/*.test.mjs` except the integration suite — discovered by glob, not a hand-kept list, so a new test file cannot be silently excluded. Runs in CI (`Checks` → `MCP unit tests`). Use the direct sibling `pnpm exec node --test mcp/src/<name>.test.mjs` first when `pnpm checks:changed` prints one |
| `pnpm integration:mcp` | Full MCP integration contracts; use when `mcp/src/integration.test.mjs` itself changed. Its first-answer Git trace proves `health` / `workspace_brief` / `agent_brief` preserve the stale-summary receipt while sharing one bounded union log and one object batch; the explicit `validate_vault` control proves the same verdict stays live in a fresh process. |
| `pnpm integration:mcp:surface` | MCP JSON-RPC `tools/list`, `initialize`, and `tools/call` surface contracts |
| `pnpm integration:mcp:repo-analysis` | MCP `index_project` / `analyze_repo_structure` / `infer_imports` / `inspect_architecture` code-to-vault contracts; advisor routes those implementation files here before broader read/query gates |
| `pnpm integration:mcp:graph` | MCP `compile_ontology` / `query_ontology` graph artifact/query contracts |
| `pnpm integration:mcp:vault-read` | MCP list/get/find/path/orphans/validate vault read contracts |
| `pnpm integration:mcp:read` | MCP `query_concepts` and shared read/query validation contracts |
| `pnpm integration:mcp:write` | MCP write tool handler contracts |
| `pnpm test:mcp:verify` | MCP verifier helper behavior |
| `pnpm test:mcp:verify:first-contact` | First-contact MCP safety and unknown-tool recovery guidance |
| `pnpm test:mcp:verify:timeout` | Timeout/startup retry diagnostics |
| `pnpm test:mcp:maintenance` | `maintenance_plan` cursor/filter behavior |
| `pnpm test:mcp:suggestions` | Enum and argument suggestion quality; use the direct sibling `pnpm exec node --test mcp/src/suggestions.test.mjs` first when `pnpm checks:changed` prints one |
| `pnpm test:mcp:package` | MCP/CLI package and tarball checks |
| `pnpm test:mcp:dogfood` | Focused live dogfood helper contracts |
| `pnpm dogfood:graph-db` | Executes the dogfood vault graph DB pack over real CLI commands: setup self-check, facets, health gate, node scan, focused blast-radius, edge scan, relation-name parity, frontmatter edge scan, domain matrix, structural `pattern-walk`, `project-map`, bounded path evidence, relation preflight, and relation explanation |
| `pnpm dogfood:test` | Full dogfood helper regression suite |
| `pnpm benchmark --dry-run` | Benchmark runner config without spawning Codex |
| `pnpm benchmark:scale --dry-run` | Scale benchmark config without tmp vault or Codex spawn |
| `node scripts/perf-vault.mjs 10` | Small vault walk/read/parse perf smoke |
| `node scripts/measure-graph-readability.mjs` | Edge crossings and node overlap on the map, against a built static export. Purchase (Graph Drawing 1997) found crossing minimisation dominates comprehension while angular resolution and grid snapping were not significant — so only those two are measured. Reports "not measurable" rather than a perfect score when the density gate has folded the graph into a star |
| `node scripts/measure-a11y.mjs` | axe-core census over WCAG 2.x A/AA rules, folded by rule (the prescription unit). Take this before changing the ratchet baseline in `tests/e2e/a11y-ratchet.spec.ts` — `/gate-probe` requires measuring violations before switching a rule on, and the five hand-rolled a11y specs cover roughly six of axe's 105 rules |
| `pnpm exec playwright test tests/e2e/a11y-ratchet.spec.ts` | Accessibility ratchet: zero violations outside the recorded baseline, and recorded counts may only go down. Raising the baseline is a human decision that has to show up in the diff |
| `pnpm exec playwright test tests/e2e/a11y-vault-backed.spec.ts` | The same ratchet with a **vault mounted**. The route-level ratchets open 17 URLs and measure the first screen, which leaves out every surface that only exists once data is loaded or a tab is opened. This one mounts `tests/e2e/fixture-vault.ts` through the OPFS stub picker, walks 13 states (map, five insights tabs plus the expanded cross-domain row, project detail overview/composition, project edit, project list, docs, studio compass stage), and requires per-state proof that the state actually rendered — a state that quietly empties fails as *unmeasured*, not as "no violations" |
| `node scripts/measure-contrast.mjs` | WCAG 1.4.3 text contrast **and 1.4.11 adjacent data marks** over the rendered DOM with alpha compositing resolved against ancestors, against a built static export. Answers "is it readable", which the token-set comparison in `/design-audit` §3 does not — two legitimate tokens can fail to separate. The adjacent-mark collector lives in `scripts/lib/contrast-collect.mjs` so the CI ratchet below runs the **same** function |
| `pnpm exec playwright test tests/e2e/contrast-ratchet.spec.ts` | The CI half of the two above: WCAG 1.4.3 text combinations **and 1.4.11 touching data-mark pairs**, both at baseline 0, across the 17 audited routes at 1512×900. Two liveness guards, because a baseline of 0 makes "nothing failed" and "nothing was measured" the same green — per-route minimum text combinations, and at least one adjacent-mark *structure* found. That second guard deliberately does **not** require a touching pair to exist: separating marks with a 1px gap is the outcome the charter wants, so requiring touching pairs would turn the gate red exactly when the screen improves |
| `pnpm exec playwright test tests/e2e/scroll-end-gap.spec.ts` | Scroll-end bottom clearance across the 17 audited routes at three viewports (1280×700, 768×950, **390×844**). Checks three things per route: the page box is not compressed, the gap under the last ink is ≥24px, and the last ink does not slide behind the bottom tab bar. Ink detection excludes closed disclosures, anything clipped away by an ancestor's own scroll container, and Next's injected `<script>` nodes — each of those produced a false violation when the route list widened. "No ink found" is reported as a measurement failure, never as a passing 0 |
| `pnpm exec playwright test tests/e2e/guide-inbody-links.spec.ts` | Opens every guide chapter in **both** locales and checks that each in-body internal link carries *that* locale's prefix and actually returns 200. Pairs with `tests/contract/guide-inbody-links.contract.test.ts`, which checks the markdown source's destinations: the source can be right while the renderer still drops the locale, and vice versa. `pnpm docs:links` cannot see either — it resolves a root-absolute link as a **vault slug**, not a route. Both halves carry an anti-idle count so an empty walk fails as unmeasured. The gate exists because all 34 in-body links were 404 in dev and static export alike (2026-08-07) |
| `pnpm perf:graph:check` | In-process graph compiler/query latency budget on a 1k-node generated vault, using 3-run medians; includes `agent_brief`, bounded traversal, `query_plan(match_nodes)`, `match_nodes`, `query_plan(match_edges)`, `match_edges`, and the full 10-call `graph_db_pack` used by `/ontology/insights` handoff |
| `pnpm perf:graph:scale` | Larger 1k + 5k in-process graph compiler/query latency budget for scale-sensitive changes; includes the same agent traversal strategy and graph scan hot paths |
| `pnpm smoke:onboarding` | Clean repo onboarding smoke |
| `pnpm smoke:memory-loop` | Fresh repo 10-minute memory loop smoke: init, bootstrap, MCP first-contact, node profile, and side-effect-free sync proposal |

Topology verification scripts pass
`--webview-fixture-vault=docs/ontology` to the direct executable verifier. This
option is intentionally incompatible with `--open-app`: Tauri creates an
incognito WebView, writes the fixture path only to that verifier's IndexedDB,
and leaves the installed app's normal vault handle untouched. Selected-relation
proof additionally fails if the isolated first-run tour obscures the relation
dialog.

The fast `--require-accessibility-window` / `--require-frontmost` probe reads
only the launched PID, frontmost state, and Accessibility window count. It must
not traverse the WebView AX tree: `--require-accessibility-text=...` uses the
bounded Swift AX probe for content, while the window probe stays responsive
inside its 3-second timeout.
Optional screenshot evidence gives foreground activation plus that fast AX
probe at most two attempts. A second success is logged as `recovered=true`;
two failures stay unconfirmed and preserve both `attemptErrors`. Do not turn
this into a longer timeout or an unbounded loop: permission and missing-window
failures must remain visible.
The final AX `frontmost=true` row is the success truth, not whether the
activation AppleScript returned before its timeout. If AX confirms the final
state after a command timeout, the proof passes with
`commandConfirmed=false` and a warning. The inverse remains fail-closed:
an activation return alone cannot pass without AX frontmost confirmation.

`pnpm test:mcp:docs` intentionally lists explicit test-name fragments instead
of a broad `README` token, so documentation-only changes do not accidentally
expand into unrelated package contract checks.
Focused package scripts that call Node's `--test-name-pattern` go through
`scripts/run-focused-node-test.mjs`, so a typoed pattern that matches 0 tests
fails instead of passing as all skipped, and a signal-killed `node --test`
subprocess reports the signal plus target path. The wrapper also requires an
explicit pattern and at least one test target, so accidental full-suite runs use
`node --test` directly. Node test option values such as `--test-concurrency 1`
or `--test-timeout 1000` are not counted as targets, and a missing split option
value cannot leak the following option value into the target list. The wrapper
also rejects custom reporter options from argv or `NODE_OPTIONS` before spawning
because it needs the default TAP summary to prove at least one focused test
actually ran. Focused runs with TAP summaries end with `matched=N` before the
broader file-level `tests=N`, even when a matched test fails, so reviewers can
see the exact scoped-test count without subtracting skipped tests by hand. File
setup/import failures are reported separately as `setupFailures=N` instead of
inflating the matched-test count.

## Skill Integrity (discovery instrument, not a gate)

```bash
pnpm skills:audit          # Inspect installed Claude Agent Skills bundles to measure integrity
pnpm test:skills:audit     # Test that judgment logic (pure functions)
```

**Not a gate** — failure does not block CI. It is a discovery tool created to **re-verify** whether there is an answer to the owner's question (*"Can we graph the skills themselves?"*, 2026-08-09). It is neither a product feature nor a public CLI command (both require mandatory PO Council convening).

What is measured and why:

| | What | Why |
|---|---|---|
| ① Name collision | Are multiple copies with the same name installed, **with different descriptions**? | If names collide, it is non-deterministic which one wins. If descriptions also differ, items with different activation conditions compete under the same name |
| ② Trigger overlap | Do they share words in their descriptions even if names differ? | Skill activation is determined by a single line of `description`. Overlap means one hides the other |
| ③ Self-folder reference | Does "read this file in my folder" actually exist? | Prevents the third stage of gradual rollout from quietly going missing |

### ⚠️ What is counted is everything about this tool — it was wrong twice (2026-08-09)

**① Counted references as a single block.** There were **700** references pointing to non-existent files,
but 666 of them were **conditional** like "read if it exists in the project," so they were not defects.

**② Counted files that are not loaded — this was bigger.** The first version scanned `~/.claude/plugins` wholesale and reported **207** items. Among them were ⓐ `cache/` version-specific download snapshots and ⓑ `marketplaces/` — a catalog clone containing **even uninstalled** items.
The canonical source is `~/.claude/plugins/installed_plugins.json`, which points to exactly **one** `installPath` per plugin. Narrowing the scope and counting again:

| | Whole disk | **Actually loaded** |
|---|---|---|
| Skills | 209 | **60** |
| Name collisions | 38 names | **2** |
| Strong trigger overlap | 41 pairs | **1 pair** |
| No self-folder references | 37 | **0** (all 7 were false positives for files actually existing in the repo root) |

So the initial report that "eight `frontend-design` copies are competing" was **wrong** — six of the eight were unused snapshots and catalogs, and the description differences were **version drift between versions** of a single plugin. This is the normal appearance of a download cache.

**The baseline counts only loaded items.** The whole disk is reported only with `--all`, at which point the output itself states "includes unloaded items."

This wrong number was used to write a PO Council brief, and three out of five members judged based on it before one caught it (`docs/DECISIONS.md` 2026-08-09). **If the denominator is wrong, the conclusion is wrong.** `audit-claude-skills.test.mjs` locks both classifications — it fails if conditionals are mixed into the defect list or if references actually existing in the repo root are counted as broken.

## Dogfood Shortcuts

These target this repo's own `docs/ontology` vault:

```bash
pnpm dogfood:compile
pnpm dogfood:compile-fix
pnpm test:dogfood:args
pnpm test:dogfood:script-refs
pnpm test:dogfood:compile-fix
pnpm dogfood:health
pnpm dogfood:agent
pnpm dogfood:agent-graph-db-pack
pnpm dogfood:graph-db
pnpm dogfood:agent-setup-gate
pnpm dogfood:agent-fallbacks
pnpm dogfood:brief
pnpm dogfood:growth
pnpm dogfood:maintenance
pnpm dogfood:status
pnpm test:dogfood:status
pnpm test:dogfood:graph-db
pnpm dogfood:verify
pnpm dogfood:walk
pnpm dogfood:help
```

`pnpm dogfood:compile-fix` runs `compile --fix` against docs/ontology and fails
if it leaves a git diff, so the dogfood vault stays canonicalized, and
successful runs end with `[dogfood:compile-fix] docs/ontology unchanged`. When it
does change the vault, it tells you to run `pnpm docs-vault:build` before rerunning
the shortcut. `pnpm
test:dogfood:compile-fix` checks that idempotence guard without the full dogfood
suite. `pnpm test:dogfood:args` checks the shared pnpm separator and nearest
`--help` hint helper without invoking any dogfood gate. `pnpm
test:dogfood:script-refs` checks that help text and package script body
`pnpm ...` references still resolve to root package scripts, that
`pnpm -C mcp ...` / `pnpm --dir cli ...` directory-scoped examples resolve
against the matching package scripts, that
`scripts/lib/test-name-pattern.mjs` keeps focused filter parsing stable, and
that focused Node test wrappers fail when a pattern matches 0 tests, print
matched counts for failed focused runs, and split setup/import failures into
`setupFailures=N`.
Benchmark README changes also route here because that page documents runnable
`pnpm` benchmark commands and is scanned by the package-script reference
contract.
When `pnpm checks:changed` prints direct script-helper tests such as
`pnpm exec node --test scripts/lib/test-name-pattern.test.mjs` or
`pnpm exec node --test scripts/lib/pnpm-script-refs.test.mjs`, run those before
the combined `pnpm test:dogfood:script-refs` gate.

`pnpm dogfood:maintenance` snapshots the dogfood vault `maintenance_plan` JSON
queue without running the full status preflight. `pnpm dogfood:agent-setup-gate`
prints the machine-readable agent setup gate for docs/ontology with `ok` and
`performanceOk`, so connector-less automation can separate broken setup from
slow local fallback latency without parsing the larger graph DB pack. It passes
`--exit-zero` so advisory ontology readiness stays visible in the JSON
`status`/`readiness` fields while the process exit code is reserved for fallback
commands that actually failed to execute.
`pnpm dogfood:release-gate` keeps source MCP verification, the deterministic
dogfood walk, that fallback-execution gate, and MCP dogfood contracts together;
it is deliberately separate from desktop artifact preflight.
`pnpm dogfood:graph-db` is the runtime gate for the same graph DB-style promise
shown in `/ontology/insights`: it runs the connector-less setup self-check,
facets, `health --json`, planned `match-nodes`, planned `match-edges`,
`domain-matrix`, bounded `all-paths --plan --force`, and `explain` over
`docs/ontology`, then fails if any result contract or health check is missing.
The health gate requires `status=healthy`, zero issues, zero unresolved edges,
and pass/count rows for every health check. The scan checks require follow-up packets
(`focusSlug` / `focusEdge`, MCP calls, and CLI fallbacks), and the bounded
path check requires the full completeness contract (`limit`, `searchBudget`,
`expandedStates`, `exhaustive`, `truncatedByBudget`, `totalPathsExact`, and
`evidence.status` / `reason` / `pathsComplete`).
`pnpm test:dogfood:graph-db` checks the runner and fail-closed result contract
handling without invoking the live CLI pack.
`pnpm dogfood:status` runs the
cheap human-readable health + workspace-brief + agent-brief + maintenance gates together. It
still prints workspace-brief, agent-brief, and maintenance when
health fails, then preserves the first failing exit code, ends with
`[dogfood:status] health:N · workspace-brief:N · agent-brief:N · maintenance:N`, and prints a
focused follow-up line (`pnpm dogfood:health`, `pnpm dogfood:brief`,
`pnpm dogfood:agent`, or `pnpm dogfood:maintenance` + `pnpm test:mcp:maintenance`) plus a
`pnpm dogfood:verify` follow-up hint on failure so the child statuses and next
escalation paths are visible. Use
`pnpm dogfood:verify` for the full
installed-style dogfood vault gate, and `pnpm dogfood:test` only when the dogfood
helper itself changed or the focused `test:mcp:dogfood` subset is not enough.
Use `pnpm test:mcp:maintenance` when only `maintenance_plan` filter, cursor,
resume, or formatter behavior changed.
`pnpm checks:changed` routes dogfood shortcut helper changes to their direct
`pnpm exec node --test ...test.mjs` test first, then `pnpm test:dogfood:args`,
`pnpm test:dogfood:script-refs`, `pnpm test:dogfood:graph-db`, or `pnpm test:dogfood:compile-fix` before
broader dogfood gates.
It routes dogfood MCP helper changes to direct
`pnpm exec node --test scripts/dogfood-mcp-walk.test.mjs` first, then
`pnpm test:mcp:dogfood:timeout` before the broader `pnpm test:mcp:dogfood` gate.
It routes MCP verify helper changes to `pnpm test:mcp:verify:first-contact`
and `pnpm test:mcp:verify:timeout` before the broader `pnpm test:mcp:verify`
gate.
Use `pnpm dogfood:compile-fix -- --help` / `pnpm dogfood:status -- --help`
when you need shortcut usage without running those gates; unsupported shortcut
arguments fail with exit 2 before any child check starts, and close `--help`
typos include a `Did you mean --help?` hint.

For slower filesystems:

```bash
OATLAS_DOGFOOD_TIMEOUT_MS=12000 pnpm dogfood:walk
```

## Filtered Integration Runs

Use these when the full integration suite is more than the change needs:

```bash
OATLAS_TEST_NAME_PATTERN="mcp-verify" pnpm integration:cli
pnpm integration:cli
pnpm integration:cli:entry
pnpm integration:cli:compile
pnpm integration:cli:mcp-verify
pnpm integration:cli:diagnosis
pnpm integration:cli:graph-read
pnpm integration:cli:graph-write
pnpm integration:cli:repo-analysis
pnpm integration:cli:local-vault
pnpm integration:cli:maintenance
pnpm integration:mcp
pnpm integration:mcp:surface
pnpm integration:mcp:repo-analysis
pnpm integration:mcp:graph
pnpm integration:mcp:vault-read
pnpm integration:mcp:read
pnpm integration:mcp:write
OATLAS_TEST_NAME_PATTERN="tools/list|initialize" pnpm integration:mcp
pnpm integration:mcp:readme
```

When using Node's `--test-name-pattern`, call `pnpm exec node --test ...`
directly. Do not append it after `pnpm integration:* --`; pnpm forwards `--`
as a test file.
Committed root shortcuts that use `--test-name-pattern` should go through
`scripts/run-focused-node-test.mjs`, so a stale pattern fails instead of
reporting an all-skipped pass.

## Source-Checkout Verify

From the repo root:

```bash
pnpm cli:mcp-verify docs/ontology --timeout-ms 15000
pnpm cli:mcp-verify -- --help
```

From `mcp/`:

```bash
cd mcp
OATLAS_VAULT=../docs/ontology npm run verify
npm run verify -- ../docs/ontology
npm run verify -- --vault ../docs/ontology
npm run verify -- ../docs/ontology --timeout-ms 15000
```

Timeout mistakes include a concrete retry hint, for example:

```bash
npm run verify -- --timeout-ms 15000
npm run verify -- --vault <path> --timeout-ms 15000
node $ATLAS/cli/src/index.mjs mcp-verify --vault <path> --timeout-ms 15000
```

## Release Smoke

Use this before publishing package artifacts:

```bash
pnpm smoke:packed-cli
```

It checks installed CLI/MCP behavior, `mcp-verify --help`, project-less and
empty-vault paths, strict argument/enum handling, destructive dry-runs, health
tuning, and dependency-cycle failure behavior.

Key dogfood coverage:

- `get_concepts` success and partial rows
- `workspace_brief.nextActions[]` and `workspace_brief.health.checks`
- `health`, `agent_brief`, and `workspace_brief` tuned diagnosis flags
- graph lookup smoke for `neighbors`, `path`, `all_paths`, and `project_scope`
- fail-closed JSON behavior for malformed `compile`, `cycles`, `path`,
  `health`, `agent-brief`, and `workspace-brief` payloads

For macOS app release candidates, use:

```bash
pnpm desktop:release-preflight
pnpm desktop:goal-audit -- --pr=<number> --tag=v1.0.0
# writes .tmp/desktop-goal-status.json and .tmp/desktop-goal-status.md by default

# CI-only or local credentialed release signing path:
pnpm desktop:check
pnpm desktop:doctor -- --require-runtime
pnpm desktop:release-github -- --tag=v1.0.0
git tag v1.0.0 origin/main && git push origin v1.0.0
pnpm desktop:release-source -- --mode=admit --tag=v1.0.0 --sha="$(git rev-parse origin/main)"
pnpm desktop:release-tag -- --tag=v1.0.0
pnpm desktop:release-artifact

# macOS app completion audit after PR review/merge, protected environment setup and dispatch,
# public release publication, and DMG asset verification are expected to be done:
pnpm desktop:release-run -- --tag=v1.0.0 --ref=main
pnpm desktop:release-status -- --pr=<number> --tag=v1.0.0
pnpm desktop:release-status -- --pr=<number> --tag=v1.0.0 --json
pnpm desktop:release-status -- --pr=<number> --tag=v1.0.0 --json-file=.tmp/release-status.json
pnpm desktop:release-status -- --pr=<number> --tag=v1.0.0 --markdown-file=.tmp/release-status.md
```

For local identity-unsigned smoke, `pnpm desktop:build` is the shortcut for
`pnpm desktop:build:app:local && pnpm desktop:sign:adhoc && node
scripts/package-macos-dmg.mjs`; run
`pnpm desktop:verify-app` after it to catch app startup crashes, then
`pnpm desktop:verify-install` to mount the generated DMG, copy the bundled app
to a temporary install folder, verify that installed copy through the
LaunchServices app content proof gate, and clean it up before distribution
checks.

An existing `v*` tag input dispatched from `main` runs
`.github/workflows/release-macos.yml`. Admission first binds the tag to the
current `main` SHA; each build lane then pins that SHA before docs-vault
freshness, desktop checker tests, native bridge tests, and release gates.
It builds Apple Silicon on `macos-14` and Intel on `macos-15-intel`,
route-smokes the static desktop payload, verifies `${GITHUB_SHA}` is the current
default-branch head, verifies the release tag matches the package/Tauri/Cargo
version before signing credentials enter the path, checks all Developer ID
direct-download release secrets, signs the app, packages the DMG, notarizes/staples
it, verifies the checksum/mount/signature/staple
contract, copy-and-launch smokes the DMG app from a temporary install folder,
records the generated DMG filename, byte size, and SHA-256 value in the GitHub
Actions step summary, stages the four release assets into one flat folder with
`node scripts/stage-macos-release-assets.mjs` so the workflow artifact has a
root we chose rather than a least-common-ancestor the download side cannot
guess, uploads that folder as the workflow artifact, attaches both DMGs plus
`.sha256` files, both updater archives plus `.sig` files, and `latest.json` to a
draft GitHub Release, verifies those draft assets with
`pnpm desktop:verify-download -- --tag="${RELEASE_TAG}" --allow-draft --require-updater`,
publishes the release as stable, then runs
`pnpm desktop:verify-download -- --tag="${RELEASE_TAG}" --require-updater` so the same CI run
proves the hosted download CTA can reach both public DMGs and that each checksum
asset contains a SHA-256 line for the same DMG filename and bytes. After public
verification, the publish job writes the published GitHub Release URL plus the
public DMG filenames, byte sizes, and SHA-256 values to the GitHub Actions step
summary. The separate
`.github/workflows/deploy-pages.yml` path deploys the hosted GitHub Pages
site after release publication or manual dispatch and then runs
`pnpm desktop:verify-hosted`. The verifier
rejects unsupported extra `ontology-atlas_*.dmg` names, mixed-version
architecture assets in the same release, duplicate architecture DMG assets, DMG
filenames whose version does not match the release tag, and DMG bytes whose
digest does not match the checksum.
Missing protected release secrets or structurally invalid certificate secrets
fail the workflow before upload instead of publishing an
unsigned or unnotarized artifact.
