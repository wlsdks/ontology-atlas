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

## Pre-commit hook — generated vault freshness

`pnpm install` points `core.hooksPath` at `.githooks/` (the `prepare` script;
nothing to run by hand). One hook lives there: **`pre-commit` refuses a commit
whose staged set touches the vault's markdown or its generated outputs while
`node scripts/build-docs-vault.mjs --check` reports drift.**

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
| Docs vs code surface | `pnpm docs:check` | `pnpm test:docs:checks` |
| macOS desktop readiness | `pnpm desktop:check` | `pnpm desktop:doctor`, then `pnpm test:desktop:check` / `pnpm test:desktop:runtime` / `pnpm test:desktop:bridge` |
| Vault integrity | `pnpm vault:validate` | `pnpm vault:audit` |
| CLI argument parsing | `pnpm test:cli:args` | `pnpm test:cli:lib` |
| MCP core units | `pnpm test:mcp:unit` | `pnpm integration:mcp:readme` |
| Business meaning corpus | `pnpm test:meaning-corpus` | source-hidden field trial and fixture-specific review |
| MCP/docs contract | `pnpm test:mcp:docs` | `pnpm package:check` |
| Graph hot-path perf | `pnpm perf:graph:check` | `pnpm perf:graph:scale` |
| Dogfood MCP smoke | `pnpm dogfood:status` | `pnpm dogfood:verify` |
| Packed CLI release | `pnpm smoke:packed-cli` | `pnpm test:mcp:package` |
| Decision ledger triggers | `pnpm decisions:check` | `pnpm exec vitest run tests/contract/design-spec-ledger.contract.test.ts` |
| Design don't-list drift | `pnpm exec vitest run tests/contract/design-donts-parity.contract.test.ts` | `pnpm test:contracts` |
| Design-system TOC drift | `pnpm design:toc:check` (in `pnpm docs:check`) | `pnpm design:toc` regenerates |
| Implicit `<b>` weight (browser default 700) | `pnpm exec vitest run tests/contract/implicit-bold-weight.contract.test.ts` | `pnpm test:contracts` |
| Drawing-surface type (canvas `ctx.font`, inline SVG attrs) | `pnpm exec vitest run tests/contract/drawing-surface-type.contract.test.ts` | `pnpm test:contracts` |
| Focus ring presence (value layer emits it) | `pnpm exec vitest run tests/contract/focus-ring-presence.contract.test.ts` | `pnpm test:contracts` |
| Raw colour literals (now `src/` + `app/` + `.css`) | `pnpm check:tokens` | `pnpm test:check:tokens` |
| Guide in-body link targets (markdown source) | `pnpm exec vitest run tests/contract/guide-inbody-links.contract.test.ts` | `pnpm exec vitest run tests/contract/schema-copy-sync.contract.test.ts` | The CLI's `schema.mjs` must stay byte-identical to the canonical `mcp/src/schema.mjs`. The two are an intentional copy (no shared package — each is baked into its own execution entrypoint), which means import-graph tools see them as unrelated files and no other check could catch drift. Siblings (absorb, parse-frontmatter, interop-format) already had sync locks; the schema was the one copy without one. On drift the failure names the first differing line and the fix direction (mcp is canonical). Carries an anti-idle floor (canonical > 10KB) so two empty files never count as "in sync" |
| `pnpm exec playwright test tests/e2e/korean-word-break.spec.ts` | Korean text must not break **mid-word**. Walks five destinations at 1512×900, takes a `Range` per character, and at every y-change (a wrap) inspects the characters on both sides: two Hangul syllables with no whitespace between them is a word split open. Wraps at spaces are normal and are not counted. lint cannot see this layer — the violation leaves **no value in the code** (a missing `break-keep` is the *absence* of a class, and absence has no selector), and the real criterion is not the class but whether it actually broke: a wide enough column wraps cleanly with `word-break: normal`. Carries an anti-idle count of multi-line Korean texts examined, because "0 breaks" is also true when nothing ever wrapped. Found two live defects the day it was written (2026-08-12): the agent-readiness hint on `/ontology/insights` and the Windows unsigned-build warning on the gateway |
| `pnpm exec playwright test tests/e2e/guide-inbody-links.spec.ts` |
| `pnpm exec playwright test tests/e2e/open-vault-cta.spec.ts` | Dead-end CTA gate, folder edition: every painted sentence that says "open your folder" across the audited routes must have a folder-opening path inside its own box, that path must **actually call the picker** (stubbed and counted, because a button that renders and does nothing passes a visibility check), and it must degrade to the app download when FSA is unavailable. Replaces the single-route check that used to live in `screen-hierarchy.spec.ts`, which only asserted the URL changed — the destination it asserted (`/`) was itself a dead end for a web visitor with no vault. Exemptions are per-route with a written reason; two liveness guards, since a green run needs both "sentences were found" and "at least one pairing was detected" |
| `pnpm exec playwright test tests/e2e/gateway-reading-reach.spec.ts` | Can a narrow viewport still reach the reading surfaces? Walks the four gateway routes at 1512/768/390 and requires a live path to `/guide` and `/changelog`, plus **five or more distinct chapters** once you are inside the guide. Counting "links containing /guide" is not enough — the first version did that and stayed green with the chapter list deleted, because the page's own index link satisfied it. A closed disclosure is opened once before counting: hidden-until-tapped is not a dead end, missing is. Also pins the narrow chapter list equal to the wide one, so the table of contents cannot become two lists |
| `pnpm exec playwright test tests/e2e/insights-badge-agreement.spec.ts` | The insights "할 일" tab badge must equal the sum of the rendered work-group badges plus the repair queue's blocking chips. It read 7 while the group heading right below it read 8, because the verdict and the group counts each kept their own hand-maintained section list and duplicates were missing from one. The section totals now flow from a single `Record<QueueSectionKey, number>`, so adding a section fails typecheck first — this gate covers the layer after that: what the screen actually prints |
| `pnpm exec playwright test tests/e2e/screen-hierarchy.spec.ts` | Screen hierarchy across every audited route: no painted text ≥ the largest painted h1 outside it, and at most one accent-filled control per screen (tokens read from `:root` at runtime, 24×44 size floor keeps 8px data-marks out). Was one route; the single-route version stayed silent on every screen built after it. Exemptions are per-route with measured values and their own tripwires — the map/docs "no painted h1" state, the studio 14px title tie, and the edit form's twin save CTAs each fail the moment they change. `HIERARCHY_PROBE=<kind>` plants violations to prove each layer still fires |

### Decision-ledger gate (`pnpm decisions:check`)

Fails when a change trips a mechanical council trigger without appending to
`docs/DECISIONS.md` in the same change. Three triggers:

1. **새 표면 / 표면 제거** — `app/[locale]/**/page.tsx` added or deleted.
2. **공개 계약 변경** — `cli/src/lib/cli-commands.mjs` or `mcp/src/index.js` edited.
3. **규격 변경** (2026-08-03) — the design system's vocabulary or ramps moved.

Trigger 3 does **not** fire on «the file appears in the diff». Those files are
among the most frequently touched in the repo (79 of the last 300 commits), so a
path-only rule produced 63 false positives. It compares a *census* instead —
cva axes/options/defaults, ramp token names and values, exported primitives, and
the scale-contract numbers in `.claude/rules/design.md` — and 16 of those 79
survive. Class-string edits, comments, whitespace and reordering do not count.
Reasoning in full: `scripts/lib/design-spec-census.mjs`.

The trigger file list lives **only** in `.claude/rules/design.md` («규격을
바꾸려면 「체계」를 부른다»); the gate parses it from there, so adding a bullet
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

## Vault Checks

```bash
pnpm vault:validate              # frontmatter integrity audit
pnpm vault:validate /your/vault  # validate any folder
pnpm vault:validate -- --help    # print validator usage without scanning
pnpm test:vault:validate         # focused validator CLI argument contract
pnpm docs-vault:check            # static dogfood manifest freshness
pnpm test:docs-vault             # focused docs-vault build/check helper contract
pnpm docs-vault:build            # refresh static dogfood manifest and public md
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
  in JSON have broken `tsc`. Take either side and regenerate:
  `git checkout --ours src/entities/docs-vault/data public/docs-vault && pnpm docs-vault:build`.

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
pnpm docs:check                  # both gates below
pnpm docs:surface:check          # regenerate the MCP/CLI surface and diff it
pnpm docs:surface:build          # refresh docs/.generated/mcp-surface.json
pnpm docs:links                  # broken repo links + cited file paths
pnpm docs:links:external         # opt-in: resolve http(s) links over the network
pnpm test:docs:checks            # focused helper contracts for both scripts
```

**One rule decides what these may check** (2026-08-01 — `docs/DECISIONS.md`):

> 기계가 만들 수 있는 것만 검사한다. 사람이 판단해서 쓴 문장은 검사하지 않는다.

The suite that preceded them was 3,419 lines and 2,126 assertions, **1,915 of
which (90%) pinned a sentence in a README.** Those pins caught nothing when a
tool's behavior changed (the sentence still matched) and went red whenever
someone improved the prose. They are gone; these two nets replace them.

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
- **`docs:links` — referential integrity.** Repo-relative markdown links plus
  repo-anchored `.md` paths cited in prose. Fenced code blocks and inline code are
  skipped (examples are not claims). Root-absolute links resolve as docs-vault
  slugs first (`/guide/cli` → `docs/guide/cli.md`). External URLs are **not** in
  the default gate — a third-party outage must never red our build — run
  `pnpm docs:links:external` for those. The prose-citation half skips append-only
  history (`CHANGELOG.md`, `docs/DECISIONS.md`, `docs/archive|audits|superpowers|plans|prototypes/**`)
  because naming a deleted file is what a changelog is *for*; links are still
  checked there, since a link is a promise to open.
- **`design-doc-token-integrity` — 같은 갈래인데 대상이 파일이 아니라 **토큰**이다
  (계약 테스트, `pnpm test:contracts` 에 포함). `docs/DESIGN-SYSTEM.md` 가 백틱이나
  `var(...)` 안에서 인용한 `--토큰` 이 `app/globals.css` 에 실재하는지 본다.
  **왜 생겼나**: 그 문서가 `--topology-*-hover-*` 13개를 「호버는 이미 토큰으로
  뒷받침된다」는 근거로 나열하는데 하나도 없었다 — 그 전제로 감사를 시작하면 그
  자체가 사각이다(2026-08-15 실측: 인용 393 중 **190개가 저장소에 없다**, 165개가
  없어진 지도 화면의 것). `docs:links` 는 **파일 경로**만 봐서 토큰은 시야 밖이었다.
  래칫이라 늘지 못하고, 문서를 정리해 줄이면 상한도 같이 내린다.

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
and produce a misleading early-exit failure. The cleanup also targets stale
macOS `.app` copies with the same `Contents/MacOS/ontology-atlas` executable
name, so an installed app cannot keep the same bundle id alive beside the fresh
build under test. Add
`-- --kill-existing --open-app --require-window --require-capturable-window --require-accessibility-window --require-owner-name="Ontology Atlas" --min-window-size=1040x720`
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
proof gate with stale-process cleanup, and removes the temp install;
`pnpm desktop:release-preflight` is the local pre-tag operator shortcut that
runs desktop readiness, docs-vault freshness, desktop checker tests, runtime
split tests, native bridge tests, runtime doctor, `cli:mcp-verify` against
`docs/ontology`, the `dogfood:agent-setup-gate` JSON fallback/performance gate,
static build, packaged-route smoke, app/DMG build, app launch smoke, DMG
mount/checksum smoke, and temporary install launch smoke;
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
`pnpm desktop:build` keeps the local unsigned prototype shortcut by running the
app build and DMG packager.
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
Claude Code/Codex agent rules and skills under `.claude/LOOP-PRINCIPLES.md`,
`.claude/rules/*.md`, `.claude/skills/*/SKILL.md`, and
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
| `pnpm desktop:smoke` | Built `out/` payload smoke for the packaged root entry; current EN/KO titles; Download install/vault/AI handoff copy and fact/checksum/release markers; Docs header/viewer/source-contract markers; `/ontology` → `/topology?index=expanded` and `/ontology/edit` → `/ontology/studio` compatibility redirects; Topology canvas-v2/focus/path markers; Insights `maintenance-board` / `one-tab-one-question` / `tab-query` markers; `_next` assets; and offline desktop docs. Missing artifacts advise `pnpm build`; title/copy/chunk mismatches advise current-source contract review instead of a redundant rebuild. |
| `pnpm desktop:perf` | Static artifact size gate: hard-fails total `_next/static` size and the largest JS/CSS chunk, while reporting total `out/` and `.app` sizes as informational metrics. It does not measure startup; `desktop:verify-app` proves packaged runtime/WebView startup and `cli:mcp-verify` proves MCP startup separately. |
| `pnpm desktop:build:app` | Build the Tauri `.app` before optional release signing or local DMG packaging |
| `pnpm desktop:build:app:local` | Build the local dogfood `.app` with updater artifacts disabled; never use it for a public release |
| `pnpm desktop:deploy:app` | Build through the local-only path, replace `/Applications/Ontology Atlas.app`, and run installed-app/WebView verification without requiring release updater signing keys |
| `pnpm desktop:verify-app` | Launch the built `.app` from its executable directory long enough to catch early Tauri/WebView startup crashes and require the packaged WebView DOM to report loaded `tauri://` Ontology Atlas content, then terminate it; locks per app path before stale-process cleanup; supports `--kill-existing --open-app --require-window --require-capturable-window --require-accessibility-window --require-accessibility-text=...` for LaunchServices dogfood checks with CoreGraphics metadata, local screenshot capture, Accessibility-window assertions, and app-content text proof before separate Computer Use observation |
| `pnpm desktop:verify-ai-settings:ko` | Installed-app proof for the keyless connect-by-address LLM branch: opens the settings sheet, walks into AI connection, types the base URL, presses the connection check, requires a live model list and a chosen model, and then requires a matching fresh `provider: "local"` verify line in the fixture vault's `.ontology-atlas/llm-audit.jsonl`; fails with the on-screen failure sentence when no local runner answers |
| `pnpm desktop:verify-install` | Mount the DMG, require the `/Applications` symlink target, copy the app to a temporary install folder, verify that copied app through the LaunchServices app content proof gate (`--open-app --require-window --require-owner-name="Ontology Atlas" --min-window-size=1040x720 --require-accessibility-text="Ontology Atlas"`), then clean it up |
| `pnpm desktop:release-preflight` | Local pre-tag macOS release gate: readiness, docs-vault, checker tests, runtime split tests, bridge tests, runtime doctor, CLI/MCP handoff, agent JSON setup gate, build, route smoke, LaunchServices app content proof (`--open-app --require-window --require-owner-name="Ontology Atlas" --min-window-size=1040x720 --require-accessibility-text="Ontology Atlas"`), unsigned DMG, and install smoke |
| `pnpm desktop:release-artifact` | Credential-isolating direct-download orchestrator: each of 11 build/sign/package/notarize/verify steps receives only its explicit secret allowlist |
| `pnpm desktop:goal-audit` | Full desktop goal gate: requires `--pr` and `--tag`, runs the local release preflight, then checks PR, signing, and GitHub Release / download blockers, writing default `.tmp/desktop-goal-status` evidence with `local_preflight=ok` only after the native app and DMG install proof have passed locally |
| `pnpm test:desktop:runtime` | Hosted-vs-installed runtime split tests for `/docs?intent=local`, first-run desktop routing, and hosted download routing |
| `pnpm test:desktop:bridge` | WebView handle-shim tests plus Rust path-guard tests for the native vault bridge |
| `pnpm desktop:release-secrets` | Default: require Apple 5 + Tauri updater 2 and validate both PKCS#12 and App Store Connect `.p8`; `--updater-only`: require the two Tauri values before Windows build |
| `pnpm desktop:release-source` | `--mode=admit` binds tag + SHA to current default-branch head; `--mode=pin` later rejects tag retargeting while allowing main to advance |
| `pnpm desktop:release-tag` | Fail closed before release signing when the v-prefixed Git tag does not match package.json, Tauri, Cargo, and the download page's release facts (`src/views/download/lib/release-facts.ts`) |
| `pnpm desktop:release-slot` | Fail closed before GitHub Release upload when the same tag already has a draft, prerelease, or public release |
| `pnpm desktop:release-github` | Operator-side check for active workflow, automatic main-only `release-signing`, reviewed main-only `release`, seven environment secret names, no repository copies, optional tag/version alignment, and clean pre-release tag/Release slots |
| `pnpm desktop:release-run` | Dispatch `release-macos.yml` from protected `main` with the tag input, then select the exact tag-named workflow_dispatch run at the admitted SHA and watch it |
| `pnpm desktop:release-status` | Completion audit for version/PR/workflow/tag state, protected environments and secrets, public stable Release/download proof, and owner-grouped handoff actions |
| `pnpm desktop:sign` | Deeply sign the built `.app` with hardened runtime when `APPLE_SIGNING_IDENTITY` and a Developer ID certificate are available |
| `pnpm desktop:notarize` | Submit, staple, validate, and re-checksum the DMG through a local keychain profile or App Store Connect API key path; password argv is rejected |
| `pnpm desktop:verify-dmg` | Mount and named-checksum smoke for the generated macOS DMG, including app bundle presence and `/Applications` symlink target, before GitHub Release upload |
| `pnpm desktop:verify-release-dmg` | Release-only DMG verifier that treats notarization as requiring strict app code signing, stapled notarization, and Gatekeeper assessment |
| `pnpm desktop:verify-download` | Public GitHub Release verifier for the hosted download CTA: requires non-draft reachable same-version Apple Silicon and Intel DMG assets, rejects unsupported or duplicate-architecture `ontology-atlas_*.dmg` names, and verifies matching `.sha256` contents and downloaded bytes |
| `pnpm desktop:verify-hosted` | Live hosted website verifier: requires `/ko/` to be promo/download-first and `/ko/download/` to exist with the stable GitHub Releases CTA plus AI-agent MCP/CLI access step, rejecting stale browser-vault CTAs and `/releases/latest` |
| `pnpm test:desktop:check` | Desktop readiness checker contract; use direct `pnpm exec node --test scripts/check-desktop-readiness.test.mjs` first when printed |
| `pnpm exec tsc --noEmit` | TypeScript and Next config type safety |
| `pnpm test:i18n:messages` | Locale routing/message catalog parity |
| `pnpm test:claude:hooks` | Claude Code/Codex hook wiring and npm publish guard |
| `pnpm exec vitest run <path>.test.ts[x]` | Direct app/source sibling test printed by `pnpm checks:changed` when available |
| `pnpm exec vitest run src/shared/lib/cn.test.ts tests/contract/vault-schema.contract.test.ts` | Vitest config/setup smoke for jsdom setup plus contract discovery |
| `pnpm exec playwright test tests/e2e/<name>.spec.ts` | Direct E2E spec printed by `pnpm checks:changed` for changed Playwright specs |
| `pnpm exec playwright test tests/e2e/local-vault-picker.spec.ts` | Playwright config/webServer smoke before broader E2E |
| `pnpm exec playwright test tests/e2e/overflow-sweep.spec.ts` | Global CSS/PostCSS responsive overflow smoke |
| `pnpm lint` | ESLint and FSD boundary config |
| `pnpm checks:changed` | Suggest first focused checks from changed paths |

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
| `pnpm integration:cli:repo-analysis` | CLI `index` / `analyze` / `infer-imports` / `bootstrap` code-to-vault contracts |
| `pnpm integration:cli:local-vault` | CLI local vault `add` / `import` / `list` / `find` / `validate` contracts |
| `pnpm integration:cli:growth` | CLI `growth_plan` wrapper, candidate rendering, malformed payload, and argument contracts |
| `pnpm test:contracts` | Cross-package schema/parser contracts |
| `pnpm test:mcp:docs` | Explicit root/MCP/CLI/dogfood docs contracts plus MCP registration-template guards |
| `pnpm test:mcp:registration` | Source-checkout `.mcp.json` / `.mcp.json.example` / `.codex/config.toml` registration templates |
| `pnpm test:mcp:unit` | Every `mcp/src/*.test.mjs` except the integration suite — discovered by glob, not a hand-kept list, so a new test file cannot be silently excluded. Runs in CI (`Checks` → `MCP unit tests`). Use the direct sibling `pnpm exec node --test mcp/src/<name>.test.mjs` first when `pnpm checks:changed` prints one |
| `pnpm integration:mcp` | Full MCP integration contracts; use when `mcp/src/integration.test.mjs` itself changed |
| `pnpm integration:mcp:surface` | MCP JSON-RPC `tools/list`, `initialize`, and `tools/call` surface contracts |
| `pnpm integration:mcp:repo-analysis` | MCP `index_project` / `analyze_repo_structure` / `infer_imports` code-to-vault contracts; advisor routes those implementation files here before broader read/query gates |
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
pnpm skills:audit          # 설치된 Claude Agent Skills 뭉치를 훑어 무결성을 잰다
pnpm test:skills:audit     # 그 판정 로직(순수 함수)의 시험
```

**게이트가 아니다** — 실패해도 CI 를 막지 않는다. 소유자 질문(*"스킬 그 자체를
graph 화 시킬 수는 없나?"*, 2026-08-09)에 답이 있는지 **재 보려고** 만든 발견
도구다. 제품 기능도, 공개 CLI 명령도 아니다(둘은 PO 카운슬 필수 소집 사안이다).

재는 셋과 그 이유:

| | 무엇을 | 왜 |
|---|---|---|
| ① 이름 충돌 | 같은 이름이 여러 벌 설치됐나, **설명까지 다른가** | 이름이 겹치면 무엇이 이기는지 비결정적이다. 설명까지 다르면 발동 조건이 다른 것들이 같은 이름으로 경쟁한다 |
| ② 트리거 겹침 | 이름이 달라도 설명이 같은 낱말을 공유하나 | 스킬 발동은 `description` 한 줄이 정한다. 겹치면 하나가 다른 하나를 가린다 |
| ③ 자기 폴더 참조 | 「내 폴더의 이 파일을 읽어라」가 실재하나 | 점진적 공개의 3단이 조용히 비는 것을 막는다 |

### ⚠️ 무엇을 세는지가 이 도구의 전부다 — 두 번 틀렸다 (2026-08-09)

**① 참조를 한 덩어리로 셌다.** 없는 파일을 가리키는 참조가 **700건**이었는데
666건은 「프로젝트에 있으면 읽어라」식 **조건부**라 결함이 아니었다.

**② 로드되지 않는 파일을 셌다 — 이게 더 컸다.** 첫 판은 `~/.claude/plugins` 를
통째로 훑어 **207개**를 보고했다. 그 안에는 ⓐ `cache/` 버전별 다운로드 스냅샷
ⓑ `marketplaces/` — **설치하지 않은 것까지** 담은 카탈로그 클론이 섞여 있다.
정본은 `~/.claude/plugins/installed_plugins.json` 이고 플러그인당 `installPath`
를 **하나만** 지목한다. 좁혀서 다시 세니:

| | 디스크 전체 | **실제 로드** |
|---|---|---|
| 스킬 | 209 | **60** |
| 이름 충돌 | 38개 이름 | **2개** |
| 강한 트리거 겹침 | 41쌍 | **1쌍** |
| 자기 폴더 참조 없음 | 37 | **0** (7건 전부 저장소 루트에 실재하는 오탐) |

즉 「`frontend-design` 8벌이 경쟁한다」는 첫 보고는 **틀렸다** — 여덟 중 여섯은
안 쓰이는 스냅샷과 카탈로그였고, 설명 차이는 한 플러그인의 **버전 간 드리프트**
였다. 다운로드 캐시의 정상 모습이다.

**기본은 로드되는 것만 센다.** 디스크 전체는 `--all` 로만 보고, 그때는 출력이
스스로 「로드되지 않는 것을 포함한다」고 말한다.

이 잘못된 숫자로 PO 카운슬 브리프를 썼고 다섯 자리 중 셋이 그것을 근거로 판정한
뒤 한 자리가 잡아냈다(`docs/DECISIONS.md` 2026-08-09). **분모를 틀리면 결론이
틀린다.** `audit-claude-skills.test.mjs` 가 두 분류를 다 잠근다 — 조건부가 결함
목록에 섞이거나, 저장소 루트에 실재하는 참조를 깨진 것으로 세면 실패한다.

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
slow local fallback latency without parsing the larger graph DB pack.
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

For local unsigned smoke, `pnpm desktop:build` is the shortcut for
`pnpm desktop:build:app && node scripts/package-macos-dmg.mjs`; run
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
