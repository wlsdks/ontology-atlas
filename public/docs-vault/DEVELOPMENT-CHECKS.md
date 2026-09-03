# Development checks

> Which command to run first for an area of this repository, what a pass
> proves, and when to escalate. The reasons a gate exists live in
> `docs/DECISIONS.md` and in the gate's own header, not here.

## Default gate

Start every change with the planner, and let it run what it recommends:

```bash
pnpm checks:changed -- --run
```

It reads the Git diff (tracked and untracked), prints the direct sibling
checks first and the escalation gates after, and stops at the first failure.
Do not hand-pick from its list. Escalate to `pnpm test:run`, `pnpm lint`,
`pnpm build`, broad Playwright, or desktop packaging only when a shared
contract, routing, configuration, release surface, or user workflow requires
it; the entries below name that condition per area.

## How to read an entry

Every entry under `## Checks` is the template below, and
`pnpm dev-checks:check` (part of `pnpm docs:check`) refuses anything else:
one area, the first command to run, what a pass proves, the escalation
command and its condition, and optionally what to change when it is red.
Every `pnpm` command named here must be a real `package.json` script.

```md
### <area a contributor recognizes>

**Run**: `<first command>`
**Proves**: <what a pass means, in one sentence>
**Escalate**: `<broader command>` when <condition>, or none
**Fix**: <what to change when it is red>
```

On 2026-09-02 this reference was condensed from 114 KB of matrix rows plus
incident narrative into these entries; the narrative stays in Git history
before commit `5eb3ba9ff`, and its decisions are in the ledger.

## Checks

### App/type safety

**Run**: `pnpm exec tsc --noEmit`
**Proves**: TypeScript and Next.js config type safety across the app, including route exports, metadata routes, and page/layout files.
**Escalate**: `pnpm build` when the change may also affect static export output
**Fix**: fix the reported type error at its source location.

### Lint/style

**Run**: `pnpm lint`
**Proves**: ESLint rules and the FSD import-direction boundary config pass.
**Escalate**: `pnpm test:run` when the change may affect behavior, not just style
**Fix**: fix the reported ESLint or FSD boundary violation.

### Static deploy safety

**Run**: `pnpm build`
**Proves**: the app still compiles to a static export without errors.
**Escalate**: `pnpm exec tsc --noEmit` to isolate a type only failure
**Fix**: fix the reported build error; keep the change compatible with static export (no server-only routes, actions, or APIs).

### CI impact plan

**Run**: `pnpm test:ci:impact`
**Proves**: `scripts/classify-change.mjs` and `scripts/run-ci-lane.mjs` route every changed path to evidence or a full-boundary promotion, with no unexplained green skip and default-branch verification exhaustive.
**Escalate**: Run the workflow contracts above, inspect all eight required statuses on a narrow PR, then confirm the exhaustive sweep on the following `main` push
**Fix**: update `scripts/classify-change.mjs`'s path-to-check rules so the new or moved path is classified instead of falling through as unknown.

### GitHub Pages deploy

**Run**: `pnpm build`
**Proves**: the static export that GitHub Pages serves at the `ontologyatlas.com` root builds on push to `main` or a release publication.
**Escalate**: `pnpm desktop:verify-hosted` after deploy
**Fix**: fix the reported build error before the deploy workflow runs.

### Static dogfood manifest

**Run**: `pnpm docs-vault:check`
**Proves**: `docs-vault:build`'s committed artifacts (`manifest.json`, `content.json`, `sample-storefront.*`, `dogfood-census.generated.ts`, `public/docs-vault/**`) are still byte-identical to what the vault source generates.
**Escalate**: `pnpm test:docs-vault`
**Fix**: run `pnpm docs-vault:build && git add src/entities/docs-vault/data public/docs-vault` to refresh and stage the generated artifacts.

### Gateway evidence specimen

**Run**: `pnpm gateway:specimen:check`
**Proves**: the vault file shown verbatim on `/download` still matches the current vault source.
**Escalate**: `pnpm gateway:specimen` to refresh
**Fix**: run `pnpm gateway:specimen` to regenerate the specimen from the vault.

### Docs vs code surface

**Run**: `pnpm docs:check`
**Proves**: `docs:surface:check`, `docs:language`, `source:language`, `docs:links`, and `docs:comment-refs` each pass, so the generated MCP/CLI surface inventory, prose language ratchets, and doc/comment links are current and machine-derived.
**Escalate**: `pnpm test:docs:checks`
**Fix**: regenerate the surface with `pnpm docs:surface:build`, fix the broken link or comment reference, or lower the reported language baseline.

### Source comment language

**Run**: `pnpm source:language`
**Proves**: comments in tracked and untracked source, tests, and prototypes are English, with independent zero baselines for current code, tests/fixtures, and historical prototypes.
**Escalate**: `pnpm test:source:language`
**Fix**: translate the flagged comment to English; localized data such as `display_ko` and `cli/templates/vault-ko/**` stays exempt.

### CLI printed-output language

**Run**: `pnpm test:contracts`
**Proves**: `cli-output-language.contract.test.ts` counts zero Hangul code points in non-test `cli/src/**/*.mjs` printed strings, the blind spot the comment-only `source:language` scan misses.
**Escalate**: `tests/contract/cli-output-language.contract.test.ts` to isolate the CLI printed-string language failure
**Fix**: translate the flagged printed string to English; `cli/src/lib/absorb.mjs` stays the sole allowlisted matcher exception.

### Agent instruction files

**Run**: `pnpm agents:check`
**Proves**: the agent-file drift checks (`claude-agents-bridge`, `skill-copy`, `agent-copy`, `at-refs`, `agent-language`, `mcp-grants`, `codex-size-cap`) all pass.
**Escalate**: the `tests/contract/` contracts named below (`agent-files`, `nested-agents-pointers`, `skill-routing`, `rules-path-scope`, `secret-read-guard`, `node-test-reachability`, `agent-file-citations`)
**Fix**: fix the reported drift: a broken `@AGENTS.md` import, a `.claude`/`.agents` byte mismatch, a dead `@reference`, non-English text, an undeclared MCP grant, or an oversized instruction set.

### macOS desktop readiness

**Run**: `pnpm desktop:check`
**Proves**: the macOS desktop Tauri scaffold readiness gate passes for static export, image mode, docs-vault freshness, CLI/MCP verification, desktop-grade quality bar coverage, route smoke scope, and `src-tauri` shell files.
**Escalate**: `pnpm desktop:doctor`, then `pnpm test:desktop:check` / `pnpm test:desktop:runtime` / `pnpm test:desktop:bridge`
**Fix**: keep `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` versions matched so app metadata, DMG filenames, and release tags move together.

### Vault integrity

**Run**: `pnpm vault:validate`
**Proves**: The vault frontmatter audit passes: valid kinds, required fields, and structural rules hold across every node.
**Escalate**: `pnpm vault:audit` to check the dogfood vault path has not drifted from source

### Vault section shape

**Run**: `pnpm test:run tests/contract/vault-section-shape.contract.test.ts`
**Proves**: Every vault markdown section stays within the 6,000-byte ratchet, with a non-empty section inventory.
**Escalate**: none
**Fix**: Split an oversized section under a second meaningful heading.

### Capability quantifier integrity

**Run**: `node scripts/run-focused-node-test.mjs --test-name-pattern "bounded-evidence omissions" mcp/src/meaning-evaluation.test.mjs`
**Proves**: Capability quantifier claims never omit their bounding evidence.
**Escalate**: `pnpm test:mcp:unit`, then source/bundle MCP parity and a four-phase source-hidden field trial

### Claim-local semantic evidence

**Run**: `node scripts/run-focused-node-test.mjs --test-name-pattern "every selected safe section|mixed README policy boundaries|selected deprecated ability prose|mixed selected instructions|over-bound policy split|line-scoped review unit|ordinary prose overlap" mcp/src/analyze.test.mjs mcp/src/analyze-adversarial.test.mjs mcp/src/meaning-evaluation.test.mjs`
**Proves**: Selected evidence stays claim-local: safe sections share evidence and ordinary prose is not falsely linked.
**Escalate**: `pnpm test:mcp:unit`, then verify source MCP and replay a fresh field trial

### Semantic source path case

**Run**: `node scripts/run-focused-node-test.mjs --test-name-pattern "exact-case source selection|lowercase root readme|lowercase workspace readme|root readme case resolution" mcp/src/analyze.test.mjs`
**Proves**: Source path selection emits exact root/workspace bytes and rejects ambiguous case folds, non-files, and path escapes.
**Escalate**: none

### First-pass construction completion

**Run**: `node scripts/run-focused-node-test.mjs --test-name-pattern "unfinished-scope project exclusion|redundant domain edge" mcp/src/construction-lifecycle.test.mjs mcp/src/ontology-engine.test.mjs`
**Proves**: An unfinished-scope project stays excluded and a redundant domain edge stays rejected during first-pass construction.
**Escalate**: none

### Agent ontology workflow helpers

**Run**: `pnpm test:agent-skills`
**Proves**: The agent-facing ontology workflow helpers (schema discovery, packet and bootstrap examples, seal witnesses, audit access) hold schema/runtime parity and never substitute for source hiding, human approval, or MCP write verification.
**Escalate**: `pnpm agents:check`, then a fresh timed parallel field trial

### Project source witness parity

**Run**: `node --test mcp/src/project-meaning-evidence.test.mjs mcp/src/project-meaning-inventory.test.mjs mcp/src/project-source-connect.test.mjs && pnpm exec vitest run src/views/home/lib/project-source-witnesses.test.ts tests/contract/project-source-connect.contract.test.ts`
**Proves**: A literal repository-root path stays rejected beside valid sibling evidence, keeping unsafe source-witness paths red.
**Escalate**: none

### Exact task-navigation truth

**Run**: `node --test mcp/src/task-navigation-evidence.test.mjs && node --test --test-name-pattern="validates compact agent_brief truth fields" cli/src/lib/query-result-contract.test.mjs`
**Proves**: Compact agent_brief truth fields stay exact, probing source-currentness, the 12,000-byte cap, and stop_on_match independently.
**Escalate**: `pnpm test:mcp:unit`, then current-source MCP/CLI integration and a prospective field trial

### Compact task-claim routing

**Run**: `node scripts/run-focused-node-test.mjs --test-name-pattern "persisted responsibility|task boundaries|claim boundaries" mcp/src/agent-brief-compact.test.mjs mcp/src/integration.test.mjs`
**Proves**: Compact `agent_brief` honors Definition/Includes/Excludes polarity and refuses conflicts, unsupported claims, and ties.
**Escalate**: `pnpm test:mcp:unit`, then `pnpm integration:mcp` and a source-hidden replay before a product claim

### CLI argument parsing

**Run**: `pnpm test:cli:args`
**Proves**: The CLI argument parser's contracts pass.
**Escalate**: `pnpm test:cli:lib` for shared CLI helper contracts
**Fix**: Run the direct sibling `pnpm exec node --test cli/src/lib/<name>.test.mjs` first when `pnpm checks:changed` names one.

### MCP core units

**Run**: `pnpm test:mcp:unit`
**Proves**: Every mcp/src/*.test.mjs unit suite (excluding integration) passes; suites are discovered by glob, not a hand-kept list.
**Escalate**: `pnpm integration:mcp:readme` for the readme-flow integration suite
**Fix**: Run the direct sibling `pnpm exec node --test mcp/src/<name>.test.mjs` first when `pnpm checks:changed` names one.

### Business meaning corpus

**Run**: `pnpm test:meaning-corpus`
**Proves**: The business meaning corpus fixtures evaluate as expected.
**Escalate**: a source-hidden field trial and fixture-specific review

### Vault validator argument contract

**Run**: `pnpm test:vault:validate`
**Proves**: The vault validator CLI's argument handling (paths, flags, `--help`) behaves as a focused contract.
**Escalate**: none

### Vault audit argument contract

**Run**: `pnpm test:vault:audit`
**Proves**: The vault audit CLI's argument handling behaves as a focused contract, independent of a live dogfood scan.
**Escalate**: none

### Vault migration runner

**Run**: `pnpm test:vault:migrate`
**Proves**: The migration runner's list, help, dry-run, write, idempotency, and dirty-tree guard behavior all hold.
**Escalate**: none

### Public guide examples

**Run**: `pnpm test:guide-examples`
**Proves**: Every public guide node example satisfies the live UID schema.
**Escalate**: none

### Claude/Codex hook wiring

**Run**: `pnpm test:claude:hooks`
**Proves**: Claude Code and Codex hook wiring, including the npm publish guard, is correctly wired.
**Escalate**: none

### MCP/CLI surface documentation parity

**Run**: `pnpm docs:surface:check`
**Proves**: The generated mcp-surface.json (every MCP tool name, mode, argument) matches the live server, and mcp/README.md and cli/README.md name every registered tool and command.
**Escalate**: none

### Docs Korean-language ratchet

**Run**: `pnpm docs:language`
**Proves**: Tracked and untracked Markdown carries no unexplained Hangul outside the typed display_ko field and the vault-ko template tree.
**Escalate**: `pnpm test:docs:language` for the inventory and exception contracts

### Repo link and citation integrity

**Run**: `pnpm docs:links`
**Proves**: Repo-relative markdown links and repo-anchored .md path citations in prose resolve, including a document citing a nonexistent vault path.
**Escalate**: `pnpm docs:links:external` to also resolve external http(s) links over the network

### Code-comment doc reference integrity

**Run**: `pnpm docs:comment-refs`
**Proves**: Every .md path cited from a code comment, outside the docs/ontology example vault, resolves to a real file.
**Escalate**: none

### MCP/docs contract

**Run**: `pnpm test:mcp:docs`
**Proves**: Root, MCP, CLI, and dogfood docs contracts hold, including the tracked `.mcp.json`, `.mcp.json.example`, and `.codex/config.toml` templates pointing at `node ./mcp/src/index.js` with `OATLAS_VAULT=./docs/ontology`.
**Escalate**: `pnpm package:check` when package files, lockfiles, entrypoints, docs contracts, or the graph hot-path perf budget need checking.
**Fix**: Use `pnpm test:mcp:registration` when only the MCP registration templates changed.

### Graph hot-path perf

**Run**: `pnpm perf:graph:check`
**Proves**: In-process graph compiler and query latency stay within budget on a 1k-node generated vault (3-run medians), covering `agent_brief`, bounded traversal, match_nodes/match_edges query plans, and the 10-call `graph_db_pack` used by /ontology/insights.
**Escalate**: `pnpm perf:graph:scale` for scale-sensitive changes, using a larger 1k plus 5k vault.

### Dogfood MCP smoke

**Run**: `pnpm dogfood:status`
**Proves**: The cheap health, workspace-brief, agent-brief, and maintenance gates pass together against docs/ontology, printing the first failing exit code with a focused follow-up command.
**Escalate**: `pnpm dogfood:verify` for the full installed-style dogfood vault gate.

### Packed CLI release

**Run**: `pnpm smoke:packed-cli`
**Proves**: Installed CLI/MCP behavior, `mcp-verify --help`, project-less and empty-vault paths, strict argument/enum handling, destructive dry-runs, health tuning, and dependency-cycle failure behavior all work from the packed artifact.
**Escalate**: `pnpm test:mcp:package` for MCP/CLI package and tarball checks.

### Atlas product outcome and risk routing

**Run**: `pnpm po:route -- --help`
**Proves**: The router derives a door and risk from supplied change/boundary facts, evidence, and a human-recovery outcome, routing an Atlas product decision to maintenance checks, a solo pass, or Evidence plus one specialist.
**Escalate**: `pnpm test:po` replays derived change/boundary routes and the known one-way and reversible controls.

### Atlas PO pilot sunset

**Run**: `pnpm po:pilot -- --check`
**Proves**: A pending due pilot, or an unsupported `keep`, fails with the rejected metric, while the live collecting register stays green.
**Escalate**: none.

### Decision ledger triggers

**Run**: `pnpm decisions:check`
**Proves**: A change tripping a mechanical significant-decision trigger (new/removed page route, edited public CLI/MCP contract, or design-system specification change) has a matching append to `docs/DECISIONS.md`.
**Escalate**: `pnpm exec vitest run tests/contract/design-spec-ledger.contract.test.ts` verifies the trigger file list itself is not duplicated and stays non-empty.
**Fix**: Supply evidence and change/boundary facts to `pnpm po:route -- --help` for a routed review.

### Copy that names the reader's surface

**Run**: `pnpm exec vitest run tests/contract/surface-naming-ratchet.contract.test.ts`
**Proves**: Copy names the reader's actual surface rather than an unnamed or wrong one, and the ratchet count only moves down.
**Escalate**: `pnpm test:contracts`.

### Markdown table shape (rows vs their header)

**Run**: `pnpm exec vitest run tests/contract/markdown-table-shape.contract.test.ts`
**Proves**: Every Markdown table's rows have the same column count as its header, so no row silently loses or gains a cell.
**Escalate**: `pnpm test:contracts`.

### Design don't-list drift

**Run**: `pnpm exec vitest run tests/contract/design-donts-parity.contract.test.ts`
**Proves**: Every `dont:` marker in `.claude/rules/forbidden.md` still pairs with a row in `docs/DESIGN-SYSTEM.md`'s Don'ts list, so the two lists cannot silently diverge.
**Escalate**: `pnpm test:contracts`.

### Design-system TOC drift

**Run**: `pnpm design:toc:check` (in `pnpm docs:check`)
**Proves**: The generated table of contents for `docs/DESIGN-SYSTEM.md` matches its current headings.
**Escalate**: `pnpm design:toc` regenerates it.

### Implicit b weight (browser default 700)

**Run**: `pnpm exec vitest run tests/contract/implicit-bold-weight.contract.test.ts`
**Proves**: No rendered `<b>`/`<strong>` element relies on the browser's implicit 700 default weight instead of an explicit token.
**Escalate**: `pnpm test:contracts`.

### Drawing-surface type (canvas ctx.font, inline SVG attrs)

**Run**: `pnpm exec vitest run tests/contract/drawing-surface-type.contract.test.ts`
**Proves**: Canvas `ctx.font` calls and inline SVG text attributes use the correct drawing-surface value type instead of a CSS-only convention a canvas or SVG context cannot read.
**Escalate**: `pnpm test:contracts`.

### Focus ring presence (value layer emits it)

**Run**: `pnpm exec vitest run tests/contract/focus-ring-presence.contract.test.ts`
**Proves**: The value layer itself emits a focus ring, so keyboard focus stays visible without relying on a component that might omit it.
**Escalate**: `pnpm test:contracts`.

### Raw colour literals (src/, app/, and .css)

**Run**: `pnpm check:tokens`
**Proves**: No raw colour literal appears in `src/`, `app/`, or `.css` outside the token system.
**Escalate**: `pnpm test:check:tokens`.

### Pixel identity palette, frame continuity, and safe map lane

**Run**: `pnpm exec vitest run tests/contract/mascot-palette-boundary.contract.test.ts tests/contract/mascot-motion.contract.test.ts`
**Proves**: The mascot's fixed palette stays out of CSS/data/status/control colour, its animation frames stay continuous, and it stays clear of the map's functional lane.
**Escalate**: `pnpm exec playwright test tests/e2e/agent-mascot-presence.spec.ts`.

### Demo clip declaration vs shipped asset

**Run**: `pnpm exec vitest run tests/contract/demo-clip-assets.contract.test.ts`
**Proves**: Every declared demo clip reference matches a shipped asset file.
**Escalate**: `pnpm test:contracts`.

### Demo clip locale (played source vs poster)

**Run**: `pnpm exec playwright test tests/e2e/demo-clip-locale.spec.ts`
**Proves**: The locale of the clip actually played matches the locale of its poster image, so a viewer does not see one language's poster before hearing another's audio.
**Escalate**: `pnpm exec playwright test` for the full suite.

### CI preparation step infinite wait

**Run**: `pnpm exec vitest run tests/contract/ci-bounded-network.contract.test.ts`
**Proves**: A CI preparation or retry step cannot wait on the network forever; retries stay bounded.
**Escalate**: `pnpm test:desktop:check` unit-tests the retry runner itself.

### Integration check list vs screen text

**Run**: `pnpm exec vitest run tests/contract/agent-doctor-checks.contract.test.ts`
**Proves**: The integration check list a screen prints matches the checks the doctor actually runs.
**Escalate**: `cargo test` (src-tauri)'s `acp_doctor` test.

### Guide in-body link targets (markdown source)

**Run**: `pnpm exec vitest run tests/contract/guide-inbody-links.contract.test.ts`
**Proves**: Every in-body internal link inside a guide chapter's Markdown source resolves to a real destination.
**Escalate**: `pnpm exec playwright test tests/e2e/guide-inbody-links.spec.ts` opens both locales and checks the rendered link carries that locale's prefix and returns 200.

### CLI re-exports the MCP schema instead of copying it

**Run**: `pnpm exec vitest run tests/contract/schema-copy-sync.contract.test.ts`
**Proves**: `cli/src/lib/schema.mjs`, `validate.mjs`, `absorb.mjs`, `suggestions.mjs`, and `parse-frontmatter.mjs` stay thin re-exports of the MCP modules through `loadMcpModule`; a function or class body in any of them means a copy came back.
**Escalate**: none.
**Fix**: Replace the copied logic with a re-export from the canonical `mcp/src/` module; mcp is canonical.

### Ontology workbench design guard

**Run**: `pnpm design:ontology`
**Proves**: No forbidden visual pattern appears across Source Vault, Workshop, Insights, navigation, INDEX, or shared UI. Source Files/Graph/Agent execution, Workshop compass handoff, Insights' six-tab set, Product Design OS permissions, and Relief/Topology token rules all hold.
**Escalate**: none.

### macOS desktop payload smoke

**Run**: `pnpm desktop:smoke`
**Proves**: The built `out/` payload has the root app entry, current locale-prefixed workbench routes, redirect chunks, `_next` assets, and offline desktop docs.
**Escalate**: none.
**Fix**: Missing artifacts mean run `pnpm build`; title/copy/component mismatches are static contract drift, not a rebuild.

### macOS static artifact size budget

**Run**: `pnpm desktop:perf`
**Proves**: Total `_next/static` size and the largest JS/CSS chunk stay within budget; it reports `out/` and `.app` sizes informationally and does not measure startup.
**Escalate**: `pnpm desktop:verify-app` for packaged runtime/WebView startup, or `pnpm cli:mcp-verify` for MCP startup.

### Installed-app dogfood deploy proof

**Run**: `pnpm desktop:deploy:app`
**Proves**: The local-only build replaces `/Applications/Ontology Atlas.app`, its SHA-256 bundle inventory matches the built app exactly before and after copy, and the installed MCP sidecar answers a lowercase-only fixture repository correctly.
**Escalate**: none.

### Packaged app launch smoke

**Run**: `pnpm desktop:verify-app`
**Proves**: The built `.app` launches from its executable directory without an early Tauri/WebView crash, and the packaged WebView reports a loaded `tauri://` document with non-empty Ontology Atlas body text.
**Escalate**: none.
**Fix**: Add `--kill-existing --open-app --require-window` flags for a LaunchServices dogfood check with screenshot evidence.

### Keyless local LLM connection proof

**Run**: `pnpm desktop:verify-ai-settings:ko`
**Proves**: The packaged app's AI connection sheet reaches a local runner by address (Ollama, LM Studio, llama.cpp), lists live models, and records a matching fresh `provider: "local"` line in `.ontology-atlas/llm-audit.jsonl`.
**Escalate**: none.
**Fix**: An unreachable address must show the exact on-screen failure sentence, not a silent pass.

### DMG install smoke

**Run**: `pnpm desktop:verify-install`
**Proves**: The DMG mounts, its `/Applications` symlink target is correct, and the app copied to a temporary install folder passes the LaunchServices app content proof before its bundled MCP sidecar runs against `docs/ontology`.
**Escalate**: none.

### Local pre-tag release preflight

**Run**: `pnpm desktop:release-preflight`
**Proves**: Desktop readiness, docs-vault freshness, vault validation, checker/runtime/bridge tests, the runtime doctor, the static build, packaged-route smoke, app/DMG build, app launch smoke, and DMG install smoke all pass locally before tagging a release.
**Escalate**: none.
**Fix**: Source-checkout MCP walking and semantic readiness stay in the separate `pnpm dogfood:release-gate` lane.

### Credentialed direct-download artifact build

**Run**: `pnpm desktop:release-artifact`
**Proves**: The signed and notarized public DMG rebuilds, route-smokes, signs, packages, notarizes/staples, verifies, and install-smokes in one pass, with each step receiving only its own explicit secret allowlist.
**Escalate**: none.

### Desktop release goal audit

**Run**: `pnpm desktop:goal-audit -- --pr=<number> --tag=v1.0.0`
**Proves**: A desktop release goal is complete only after the local preflight, the PR, signing, and GitHub Release/download blockers all pass, writing evidence to `.tmp/desktop-goal-status.json`/`.md`.
**Escalate**: none.
**Fix**: Add `--json`, `--json-file`, or `--markdown-file` for machine or reviewer-readable blocker output grouped by owner.

### Release secret readiness

**Run**: `pnpm desktop:release-secrets`
**Proves**: The Apple signing/notary secrets and Tauri updater secrets are present and structurally valid before a signed build begins.
**Escalate**: none.
**Fix**: Use `--updater-only` to require just the two Tauri updater values before a Windows build.

### Release tag/SHA admission

**Run**: `pnpm desktop:release-source`
**Proves**: With `--mode=admit`, the requested tag, supplied SHA, and current default-branch head agree before a release is admitted.
**Escalate**: none.
**Fix**: Use `--mode=pin` afterward to reject tag retargeting while letting `main` keep advancing.

### ACP agent-runtime registry snapshot

**Run**: `pnpm acp:registry:check`
**Proves**: The committed `src-tauri/src/acp-registry.json` snapshot matches what the app actually launches, and a compatibility-pinned runtime has not moved beyond the newest upstream version whose permission behavior was reviewed. The app still never fetches this list at runtime.
**Escalate**: none.
**Fix**: For an ordinary registry move, run `pnpm acp:registry` and read the diff. For a compatibility-pin failure, first rerun the installed permission matrix named by the diagnostic; update the reviewed upstream identity only after that evidence. Only measured runtimes are marked `verified`.

### Release tag version alignment

**Run**: `pnpm desktop:release-tag`
**Proves**: The v-prefixed Git tag matches `package.json`, Tauri, Cargo, and the download page's release facts before signing.
**Escalate**: none.

### Release slot cleanliness

**Run**: `pnpm desktop:release-slot`
**Proves**: The same tag has no existing draft, prerelease, or public release before a GitHub Release upload, so stale DMG assets cannot mix with fresh ones.
**Escalate**: none.

### Operator-side release workflow readiness

**Run**: `pnpm desktop:release-github`
**Proves**: The release workflow is active, main-only signing/review gates hold, the required environment and repository secrets are present without over-scoped copies, and tag/version alignment plus release slots stay clean.
**Escalate**: none.
**Fix**: `--allow-obsolete-repository-secrets` permits only unused legacy Apple ID/password/team names through one proof release.

### Post-release completion audit

**Run**: `pnpm desktop:release-status -- --pr=<number> --tag=v1.0.0`
**Proves**: The merged PR, version/tag alignment, workflow availability, protected secrets, and the public GitHub Release/download assets are all in the completed state, with owner-grouped next actions for anything blocking.
**Escalate**: none.
**Fix**: Add `--json`, `--json-file`, or `--markdown-file` for automation or a reviewer checklist artifact.

### Bundled MCP sidecar binary parity

**Run**: `pnpm mcp:build-binary`
**Proves**: The compiled app-bundled MCP's first-contact contract matches source, and a lowercase-only `readme.md` fixture stays exact project evidence in the compiled executable.
**Escalate**: none.

### Generated DMG checksum smoke

**Run**: `pnpm desktop:verify-dmg`
**Proves**: The generated DMG mounts, its checksum matches, and the app bundle plus `/Applications` symlink target are present, before GitHub Release upload.
**Escalate**: none.

### Release DMG signature and notarization

**Run**: `pnpm desktop:verify-release-dmg`
**Proves**: The release DMG's app carries strict code-signature verification, a validated stapled notarization ticket, and a passing Gatekeeper assessment for both the app and the DMG open path.
**Escalate**: none.

### Download page release-facts freshness

**Run**: `pnpm download:release-facts:check`
**Proves**: `src/views/download/model/macos-release.generated.ts` matches the newest published (non-draft) GitHub Release by byte comparison, not just by tag, so a forgotten handoff cannot ship a stale download page.
**Escalate**: none.
**Fix**: Regenerate with `pnpm download:release-facts` and land the file in an ordinary pull request; the release token cannot push to protected `main`.

### Public download asset verification

**Run**: `pnpm desktop:verify-download`
**Proves**: The public GitHub Release exposes reachable same-version Apple Silicon and Intel DMGs with matching `.sha256` contents and downloaded bytes, and rejects unsupported or duplicate-architecture assets.
**Escalate**: none.
**Fix**: Draft releases need `--allow-draft`; the hosted map cannot serve them to users otherwise.

### i18n message catalog parity

**Run**: `pnpm test:i18n:messages`
**Proves**: Locale routing and message catalogs stay in parity across locales.
**Escalate**: none.
**Fix**: Changes to the validator itself first print `pnpm exec node --test scripts/validate-messages.test.mjs`.

### Claude/Codex hook wiring and publish guard

**Run**: `pnpm test:claude:hooks`
**Proves**: Claude Code/Codex hook wiring under `.claude/hooks/`, `.claude/settings.json`, `.codex/hooks/`, and `.codex/hooks.json`, plus the npm publish guard, are wired correctly.
**Escalate**: none.

### Vitest config/setup smoke

**Run**: `pnpm exec vitest run src/shared/lib/cn.test.ts tests/contract/vault-schema.contract.test.ts`
**Proves**: A `vitest.config.ts` or `vitest.setup.ts` change still boots jsdom setup and contract discovery correctly, without needing the entire suite.
**Escalate**: none.

### Playwright config/webServer smoke

**Run**: `pnpm exec playwright test tests/e2e/local-vault-picker.spec.ts`
**Proves**: A `playwright.config.ts` change still exercises the webServer startup path, before running the whole browser journey suite.
**Escalate**: none.

### Global CSS/PostCSS overflow smoke

**Run**: `pnpm exec playwright test tests/e2e/overflow-sweep.spec.ts`
**Proves**: A `postcss.config.mjs` or `app/globals.css` change does not overflow the core responsive routes.
**Escalate**: none.

### Dead-code and dependency lint

**Run**: `pnpm knip`
**Proves**: No unused file, dependency, or export/type exists in frontend, scripts, CLI, or MCP scope; a configuration hint or an empty subject lane is a fail-closed setup error.
**Escalate**: none.
**Fix**: Exports/types ratchet downward only; exact witnessed exceptions are the only exclusions, and it never auto-fixes.

### Changed-path focused-check advisor

**Run**: `pnpm checks:changed`
**Proves**: The changed tracked and untracked file set maps to first checks and explicit escalation gates.
**Escalate**: none.

### Focused-check advisor helper contract

**Run**: `pnpm test:checks:changed`
**Proves**: The changed-path focused-check suggestion helper behaves correctly.
**Escalate**: none.
**Fix**: Use the direct `pnpm exec node --test scripts/lib/focused-check-suggestions.test.mjs` or `scripts/suggest-focused-checks.test.mjs` first when printed.

### Korean word-break rendering

**Run**: `pnpm exec playwright test tests/e2e/korean-word-break.spec.ts`
**Proves**: Korean text never breaks mid-word at a line wrap across the audited destinations; wraps at spaces are normal.
**Escalate**: none.

### Dead-end folder-open CTA

**Run**: `pnpm exec playwright test tests/e2e/open-vault-cta.spec.ts`
**Proves**: Every sentence telling a visitor to open their folder has a folder-opening path in its own box that actually calls the picker, and degrades to the app download when the File System Access API is unavailable.
**Escalate**: none.

### Gateway reading-surface reach

**Run**: `pnpm exec playwright test tests/e2e/gateway-reading-reach.spec.ts`
**Proves**: A narrow viewport still reaches `/guide` and `/changelog` from the gateway routes, and the guide exposes five or more distinct chapters, matching the wide-viewport chapter list.
**Escalate**: none.

### Insights to-do badge agreement

**Run**: `pnpm exec playwright test tests/e2e/insights-badge-agreement.spec.ts`
**Proves**: The Insights "To-do" tab badge equals the sum of the rendered work-group badges plus the repair queue's blocking chips.
**Escalate**: none.

### Screen hierarchy and accent discipline

**Run**: `pnpm exec playwright test tests/e2e/screen-hierarchy.spec.ts`
**Proves**: No painted text is larger than the route's largest h1 outside it, and at most one accent-filled control appears per screen, across every audited route.
**Escalate**: none.
**Fix**: Set `HIERARCHY_PROBE=<kind>` to plant a violation and confirm the layer still fires.

### CLI MCP wrapper parser/spawn

**Run**: `pnpm test:cli:mcp-call`
**Proves**: The CLI's MCP wrapper parses arguments and spawns the MCP process correctly.
**Escalate**: none.

### Full CLI integration contracts

**Run**: `pnpm integration:cli`
**Proves**: The complete CLI integration suite passes.
**Escalate**: none.
**Fix**: Use `OATLAS_TEST_NAME_PATTERN` to filter, or run a narrower `integration:cli:*` shortcut first when only one area changed.

### CLI entrypoint and command inventory

**Run**: `pnpm integration:cli:entry`
**Proves**: The CLI entrypoint, `--help`, command inventory, and `init` behave correctly.
**Escalate**: none.

### CLI compile/--fix canonicalization

**Run**: `pnpm integration:cli:compile`
**Proves**: The CLI's `compile` and `--fix` canonicalization behave correctly.
**Escalate**: none.

### CLI diagnosis commands

**Run**: `pnpm integration:cli:diagnosis`
**Proves**: The CLI's `health`, `agent-brief`, and `workspace-brief` diagnosis commands behave correctly.
**Escalate**: none.

### CLI read-only graph commands

**Run**: `pnpm integration:cli:graph-read`
**Proves**: The CLI's read-only graph commands (`match-nodes`/`match-edges` scans, `explain`, `domain-matrix`, `reachability`, bounded `all-paths --plan`, `pattern-walk`, `project-map`) behave correctly.
**Escalate**: none.

### CLI graph write safety

**Run**: `pnpm integration:cli:graph-write`
**Proves**: The CLI's graph write dry-run/confirm safety behaves correctly.
**Escalate**: none.

### CLI code-to-vault commands

**Run**: `pnpm integration:cli:repo-analysis`
**Proves**: The CLI's `index`, `analyze`, `infer-imports`, `architecture`, and `bootstrap` code-to-vault commands behave correctly.
**Escalate**: none.

### CLI compact bootstrap totals

**Run**: `node scripts/run-focused-node-test.mjs --test-name-pattern "compact import delivery preserves review totals" cli/src/integration.test.mjs`
**Proves**: A compact bootstrap receipt keeps candidate and unresolved totals while exit 3, approval-required state, and zero writes remain unchanged.
**Escalate**: `pnpm integration:cli:repo-analysis`

### CLI local vault commands

**Run**: `pnpm integration:cli:local-vault`
**Proves**: The CLI's local vault `add`/`import`/`list`/`find`/`validate` commands behave correctly.
**Escalate**: none.

### CLI growth_plan wrapper

**Run**: `pnpm integration:cli:growth`
**Proves**: The CLI's `growth_plan` wrapper, candidate rendering, malformed-payload handling, and arguments behave correctly.
**Escalate**: none.

### Architecture profile parser/conformance

**Run**: `pnpm test:architecture`
**Proves**: The architecture profile parser and conformance checks, web/MCP parity, Living Blueprint interaction, focused `inspect_architecture`, and CLI `architecture --json` all hold; declared type-only import exclusions stay non-violating and unclassified usage stays unknown.
**Escalate**: none.

### MCP registration templates

**Run**: `pnpm test:mcp:registration`
**Proves**: The source-checkout `.mcp.json`, `.mcp.json.example`, and `.codex/config.toml` registration templates are correct.
**Escalate**: none.

### Full MCP integration contracts

**Run**: `pnpm integration:mcp`
**Proves**: The complete MCP integration suite passes, including that `health`/`workspace_brief`/`agent_brief` preserve the stale-summary receipt while sharing one bounded union log and object batch.
**Escalate**: none.

### MCP JSON-RPC surface

**Run**: `pnpm integration:mcp:surface`
**Proves**: The MCP `tools/list`, `initialize`, and `tools/call` JSON-RPC surface behaves correctly.
**Escalate**: none.

### MCP code-to-vault tools

**Run**: `pnpm integration:mcp:repo-analysis`
**Proves**: The MCP `index_project`, `analyze_repo_structure`, `infer_imports`, and `inspect_architecture` code-to-vault tools behave correctly.
**Escalate**: none.

### MCP graph artifact/query tools

**Run**: `pnpm integration:mcp:graph`
**Proves**: The MCP `compile_ontology` and `query_ontology` graph artifact/query tools behave correctly.
**Escalate**: none.

### MCP vault read tools

**Run**: `pnpm integration:mcp:vault-read`
**Proves**: The MCP list/get/find/path/orphans/validate vault read tools behave correctly.
**Escalate**: none.

### MCP query_concepts and shared read validation

**Run**: `pnpm integration:mcp:read`
**Proves**: The MCP `query_concepts` tool and shared read/query validation behave correctly.
**Escalate**: none.

### MCP write tool handlers

**Run**: `pnpm integration:mcp:write`
**Proves**: The MCP write tool handlers behave correctly.
**Escalate**: none.

### MCP verifier helper

**Run**: `pnpm test:mcp:verify`
**Proves**: The MCP verifier helper behaves correctly.
**Escalate**: none.
**Fix**: Route first-contact/timeout changes to `pnpm test:mcp:verify:first-contact` or `pnpm test:mcp:verify:timeout` first.

### MCP first-contact safety

**Run**: `pnpm test:mcp:verify:first-contact`
**Proves**: First-contact MCP safety and unknown-tool recovery guidance behave correctly.
**Escalate**: none.

### MCP verify timeout/retry

**Run**: `pnpm test:mcp:verify:timeout`
**Proves**: Timeout and startup retry diagnostics behave correctly.
**Escalate**: none.

### MCP maintenance_plan behavior

**Run**: `pnpm test:mcp:maintenance`
**Proves**: `maintenance_plan` cursor, filter, resume, and formatter behavior is correct.
**Escalate**: none.

### MCP enum/argument suggestions

**Run**: `pnpm test:mcp:suggestions`
**Proves**: Enum and argument suggestion quality is correct.
**Escalate**: none.
**Fix**: Use the direct sibling `pnpm exec node --test mcp/src/suggestions.test.mjs` first when printed.

### Focused live dogfood helper contracts

**Run**: `pnpm test:mcp:dogfood`
**Proves**: The focused live dogfood helper contracts pass.
**Escalate**: none.

### Dogfood graph DB command pack

**Run**: `pnpm dogfood:graph-db`
**Proves**: The connector-less setup self-check, facets, `health --json`, planned `match-nodes`/`match-edges`, `domain-matrix`, bounded `all-paths --plan --force`, and `explain` all run over `docs/ontology`, with every result contract and health check present.
**Escalate**: none.
**Fix**: `status=healthy` with zero issues and zero unresolved edges is required; a missing follow-up packet field fails closed.

### Full dogfood helper regression

**Run**: `pnpm dogfood:test`
**Proves**: The full dogfood helper regression suite passes.
**Escalate**: none.

### Benchmark runner config smoke

**Run**: `pnpm benchmark --dry-run`
**Proves**: The benchmark runner's configuration is valid without spawning Codex.
**Escalate**: none.

### Scale benchmark config smoke

**Run**: `pnpm benchmark:scale --dry-run`
**Proves**: The scale benchmark's configuration is valid without a temp vault or Codex spawn.
**Escalate**: none.

### Small vault perf smoke

**Run**: `node scripts/perf-vault.mjs 10`
**Proves**: A small vault's walk/read/parse performance is within an acceptable range.
**Escalate**: none.

### Map edge-crossing and overlap measurement

**Run**: `node scripts/measure-graph-readability.mjs`
**Proves**: Edge crossings and node overlap on the map, measured against a built static export, stay within range; reports "not measurable" rather than a false perfect score when density folding hides it.
**Escalate**: none.

### Accessibility rule census

**Run**: `node scripts/measure-a11y.mjs`
**Proves**: An axe-core census over WCAG 2.x A/AA rules, folded by rule, measures current violations before any ratchet baseline changes.
**Escalate**: none.
**Fix**: Run this before changing the baseline in `tests/e2e/a11y-ratchet.spec.ts`.

### Accessibility ratchet (route-level)

**Run**: `pnpm exec playwright test tests/e2e/a11y-ratchet.spec.ts`
**Proves**: Zero accessibility violations outside the recorded baseline across the audited routes; recorded counts may only go down.
**Escalate**: none.

### Accessibility ratchet (vault-mounted)

**Run**: `pnpm exec playwright test tests/e2e/a11y-vault-backed.spec.ts`
**Proves**: The same accessibility ratchet holds with a real vault mounted, across map, insights tabs, project detail/edit/list, docs, and studio compass states, each required to actually render.
**Escalate**: none.

### Text and data-mark contrast measurement

**Run**: `node scripts/measure-contrast.mjs`
**Proves**: WCAG 1.4.3 text contrast and 1.4.11 adjacent data-mark contrast, measured over the rendered DOM with alpha compositing resolved, against a built static export.
**Escalate**: none.

### Contrast ratchet (CI)

**Run**: `pnpm exec playwright test tests/e2e/contrast-ratchet.spec.ts`
**Proves**: WCAG 1.4.3 text combinations and 1.4.11 touching data-mark pairs stay at the recorded baseline of zero across the 17 audited routes.
**Escalate**: none.

### Scroll-end bottom clearance

**Run**: `pnpm exec playwright test tests/e2e/scroll-end-gap.spec.ts`
**Proves**: The page box is not compressed, the gap under the last ink is at least 24px, and the last ink does not slide behind the bottom tab bar, across the audited routes and viewports.
**Escalate**: none.

### Clean-repo onboarding smoke

**Run**: `pnpm smoke:onboarding`
**Proves**: A clean repository checkout can complete first-time onboarding.
**Escalate**: none.

### Fresh-repo memory loop smoke

**Run**: `pnpm smoke:memory-loop`
**Proves**: A fresh repository can complete init, bootstrap, MCP first-contact, node profile, and a side-effect-free sync proposal within about ten minutes.
**Escalate**: none.

### Skill bundle integrity audit

**Run**: `pnpm skills:audit`
**Proves**: Discovery measurement of installed Claude Agent Skills, scoped to items actually loaded via `installed_plugins.json`: name collisions with differing descriptions, trigger-description overlap, and missing self-folder references
**Escalate**: `pnpm test:skills:audit` when the audit script's own judgment logic changes, or none for routine use
**Fix**: Rename or remove the colliding or overlapping skill, or add the missing self-folder file; never widen the counted scope back to the whole disk, which `--all` reports separately

### Dogfood vault canonicalization

**Run**: `pnpm dogfood:compile-fix`
**Proves**: Running `compile --fix` against `docs/ontology` leaves no git diff, ending with `[dogfood:compile-fix] docs/ontology unchanged`
**Escalate**: `pnpm docs-vault:build` when the fix changes the vault, then rerun; `pnpm test:dogfood:compile-fix` checks the idempotence guard alone
**Fix**: Regenerate outputs with `pnpm docs-vault:build`, then rerun `pnpm dogfood:compile-fix` until it reports unchanged

### Source-checkout MCP dependency preflight

**Run**: `node scripts/lib/check-mcp-source-dependencies.mjs`
**Proves**: The MCP runtime dependency inventory is non-empty, every declaration is exactly pinned, and each installed version matches `mcp/package.json`, including pnpm-linked installations.
**Escalate**: `pnpm test:dogfood:script-refs` when the command guard changes; `pnpm test:cli:lib` when its shared resolver changes
**Fix**: Run `pnpm --dir mcp install --frozen-lockfile`; dependency installation remains an explicit contributor action.

### Dogfood script-reference parity

**Run**: `pnpm test:dogfood:script-refs`
**Proves**: Help text and package-script bodies' `pnpm` references, including directory-scoped mcp/cli examples, resolve to real scripts, and focused Node test wrappers fail on a 0-match pattern instead of passing
**Escalate**: none; run the printed direct sibling test for `scripts/lib/test-name-pattern.mjs` or `scripts/lib/pnpm-script-refs.mjs` first when `checks:changed` names one
**Fix**: Correct the stale script name or path in the referencing help text or README, or fix the focused-pattern parsing helper it names

### Dogfood shortcut argument helper

**Run**: `pnpm test:dogfood:args`
**Proves**: The shared pnpm-separator parsing and nearest `--help` hint helper used by every dogfood shortcut behave correctly, independent of any live dogfood gate
**Escalate**: none
**Fix**: Fix the shared argument or help helper the dogfood shortcuts import; an unsupported shortcut argument must keep failing with exit 2 before any child check starts

### Dogfood connector-less agent setup gate

**Run**: `pnpm dogfood:agent-setup-gate`
**Proves**: Machine-readable `ok`/`performanceOk` JSON for `docs/ontology` separates broken agent setup from slow local-fallback latency, with `--exit-zero` keeping advisory readiness visible without failing the process
**Escalate**: `pnpm dogfood:graph-db` for the full graph DB pack semantics behind the same readiness promise
**Fix**: Repair the failing setup step named in the JSON `status`/`readiness` fields before treating slow fallback latency as a defect

### Dogfood runtime graph DB pack

**Run**: `pnpm dogfood:graph-db`
**Proves**: The connector-less setup self-check, facets, `health --json`, planned node/edge scans, `domain-matrix`, bounded `all-paths`, and `explain` all succeed over `docs/ontology` with complete result contracts, healthy status, and zero unresolved edges
**Escalate**: `pnpm test:dogfood:graph-db` to check the runner and fail-closed contract handling without invoking the live CLI pack
**Fix**: Fix the missing health check, unresolved edge, or incomplete path-evidence field that the failing contract names

### Dogfood release gate

**Run**: `pnpm dogfood:release-gate`
**Proves**: Source MCP verification, the deterministic dogfood walk, the fallback-execution gate, and MCP dogfood contracts pass together, deliberately kept separate from desktop artifact preflight
**Escalate**: `pnpm desktop:release-preflight` when the change also touches the packaged macOS app path
**Fix**: Rerun the specific failing sub-gate it reports, mcp verify, dogfood walk, or fallback execution, before rerunning the whole lane

### Focused integration test runs

**Run**: `OATLAS_TEST_NAME_PATTERN="mcp-verify" pnpm integration:cli`
**Proves**: The narrower CLI or MCP integration subset, by test-name pattern or a scoped `integration:cli:*` / `integration:mcp:*` script, passes without running the full integration file
**Escalate**: `pnpm integration:cli` or `pnpm integration:mcp` (the full file) when the focused subset is not enough, or none otherwise
**Fix**: Call `node --test` directly for a `--test-name-pattern` filter; never append it after `pnpm integration:cli --`, since pnpm forwards that flag as a test file argument instead

### Source-checkout MCP verify

**Run**: `pnpm cli:mcp-verify docs/ontology --timeout-ms 15000`
**Proves**: The source-checkout CLI can spawn and verify the local MCP server against a real vault within a bounded timeout, run from the repo root
**Escalate**: none; run `OATLAS_VAULT=../docs/ontology npm run verify` from `mcp/` for the package-local path, or `pnpm cli:mcp-verify -- --help` for usage
**Fix**: Increase `--timeout-ms` per the printed retry hint, or pass an explicit `--vault <path>` / `OATLAS_VAULT` when the target vault is not the default

### macOS release candidate smoke

**Run**: `pnpm desktop:release-preflight`
**Proves**: The local pre-tag gate (readiness, docs-vault freshness, vault validation, checker/runtime/bridge tests, build, route smoke, app launch, DMG mount, install smoke) passes, and the root package stays free of Firebase SDK, Firebase Admin, and Firebase CLI dependencies so the local-only app package cannot silently absorb the separate Hosting deploy toolchain
**Escalate**: `pnpm desktop:goal-audit -- --pr=<number> --tag=<tag>` before publishing, which requires PR and tag evidence first
**Fix**: Rerun the specific failing preflight step it names (desktop:check, desktop:doctor, build, or app/DMG verify) before proceeding to credentialed signing
