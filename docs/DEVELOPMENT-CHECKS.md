---
title: Development checks
doc_type: runbook
status: current
area: process
---

# Development checks

> How to choose the checks for a change, where CI internals live, how a pull
> request merges, and what each lane costs. `pnpm checks:changed` is the registry of which check covers
> which path (its rules live in `scripts/lib/check-rules/`), and
> [Repository commands](#repository-commands) names the contributor commands. The reasons a gate exists
> live in the decision records and in the gate's own header, not here.

## Default gate

Start with the planner to inventory candidates without running them:

```bash
pnpm checks:changed
```

It reads the Git diff (tracked and untracked), printing direct sibling checks
and escalation candidates. Select the smallest checks that cover the actual
change and its relevant failure modes; state what ran and any remaining risk.
Escalate to `pnpm test:run`, `pnpm lint`, `pnpm build`, broad Playwright, or
desktop packaging when a failure, shared contract, routing, configuration,
release surface, or user workflow requires it. Keep required CI unchanged.

A slice of parallel work runs `pnpm checks:changed -- --run --slice`: every
check its files select except the costly repo-wide lanes (`pnpm test:contracts`,
`pnpm knip`, `pnpm typecheck`, `pnpm build`, the `test:mcp` suites), which the
lead runs once on the integration tree before its pull request.

## Where CI internals live

How main treats a reviewed PR's result, how pre-push and PR CI split the
lanes, and how browser and unit jobs are sharded belong to the code that does it: the
headers of `scripts/ci/classify-change.mjs`, `scripts/ci/run-ci-lane.mjs`,
`scripts/ci/run-playwright-ci.mjs`, `scripts/landing/pr-land.mjs`, and the workflow files
under `.github/workflows/`.

Pre-push validates the pushed commit, refuses a checkout that could mask its
inputs, and runs affected lint, Node and unit tests in parallel with the
relevant cheap checks. Message-part changes use
their composed catalogue once; cross-package imports also select their frontend
tests. Relevant documentation-registry and workflow-security checks run locally.
The whole hook includes preparation in its reported duration. Full contract,
Knip and browser suites remain CI work.

Before merge, a pull request's Checks run what its change can affect plus a fixed
core: changed-file lint, the typecheck, the contracts whose import graph
reaches the change (a message part counts as its composed catalogue), every
security and vault-format contract, and the forbidden-pattern contracts
(`FORBIDDEN_PATTERN_CONTRACTS` in `scripts/ci/classify-change.mjs`). A change
to `src/` or `app/` code or styles, or to `messages/`, also runs every ratchet;
after a merge a ratchet compares with the previous main tip. After the
merge, each push to main runs the full Checks set, including `pnpm knip` and the
full contract sweep, so a suite the plan left out turns main red rather than
the pull request; `pnpm pr:land` warns while that run is red. The unit shards split by
measured seconds (`scripts/data/vitest-file-durations.json`, refreshed with
`pnpm unit:durations`). The browser workflow keeps its own policy.

CI tooling test edits keep their regression checks without promoting unrelated
lanes to full runs. Runtime planner edits, unknown paths and invalid comparison
history stay exhaustive. Unit and performance reach excludes explicit type-only
imports; source-reading contracts retain them. Exact default Node test files run
once across command aliases; flags and lifecycle hooks keep their semantics.

Merging waits for one context, `Required checks` in `checks.yml`, which passes
only when the impact plan, Types · Lint · Docs, Unit · Contract and MCP each
succeeded. No browser spec runs before merge. The browser suite (`e2e.yml`)
runs after merge on `macos-15`: every night at 19:17 UTC on `main`, on a release
tag when `pnpm desktop:release-run` dispatches it, and on any branch dispatched
by hand. A whole run (the schedule, or a dispatch with an empty `plan_from`) is
titled `Browser suite: whole run` and runs every spec on three shards, the
static-export and web-surface specs on one more runner, and the quarantined
specs on a fifth, which never turns the run red. A stable release publishes
only over a green whole run on its own commit. The author proves screens before
merge: `pnpm checks:changed` names the mapped specs, and they run locally on
macOS, the nightly's system. To run the mapped specs plus the merge smoke set
(`scripts/ci/merge-smoke-specs.mjs`) in CI, dispatch
`gh workflow run e2e.yml --ref <branch> -f plan_from=<main sha>`.

A flaky test goes into `tests/quarantine.json` (whole files, at most 10, each for
at most 14 days, with the run where it failed and then passed on a rerun of the
same commit). Every CI lane leaves a listed file out; the nightly runs it and
prints its verdict, and an entry past `expires` turns the nightly red, which
stops stable releases. The pull request that fixes the test deletes the entry
and pastes `node scripts/ci/quarantine.mjs prove <file>`: 65 of 65 green
repeats. Local runs still execute every file.

CI rejects focused `.only` tests on every execution path. It records a trace on
the first retry, preserves that trace even when the retry passes, and uploads
full failure evidence for failed jobs. These artifacts last seven days; ordinary
passing tests produce no automatic trace. A retry passing is evidence of an
intermittent failure, not evidence that its cause was fixed.

## Merging

`pnpm pr:land <number>` merges a reviewed pull request and keeps its original
commits; `.claude/rules/git.md` owns the rest of the merge workflow. While
`main`'s latest nightly browser run is red, or older than 48 hours, it prints
one line naming that run and its failing spec files, and the pull request body
carries the same line. It still merges: whoever cuts the next stable release
owns the red, because the release browser gate refuses it until the spec is
fixed or quarantined with that run as evidence.

## Lane budgets

Every lane costs someone's afternoon, so every lane says what it costs. The
**Measured** column is a 2026-09-12 snapshot (locally on a 12-core
Apple-silicon machine, in CI over the last 20 runs) and goes stale; re-measure
before relying on it.

| Lane | Budget | Measured | What it guards |
|---|---|---|---|
| **pre-push, whole hook** | 90 s | **10-15 s** (2026-11-18, a UI and an MCP change replayed; was 80 s, then 367 s) | the common failure, found before CI |
| PR CI `contract` | — | formerly 80 s locally | full ratchets stay in CI; removed from pre-push |
| PR CI `dead_code` | — | formerly 33 s locally | whole-graph Knip stays in CI; removed from pre-push |
| pre-push `unit` | — | 6-19 s; skipped when every change since the merge base passed `checks:changed -- --run` on the same content | the tests that import the change |
| pre-push `source_language` | — | 7 s | Korean in source comments |
| pre-push `lint` | — | 1-3 s | ESLint on the changed files |
| pre-push `typecheck` · `comment_refs` · `decisions` | — | ~1 s each | types, code-comment citations, a route with no record |
| pre-push `licenses` | — | 6-23 s (2026-10-02; alone, then beside nine lanes) | the license allow-list and notice freshness, when a shipped dependency tree changes |
| **PR CI, wall clock** | 8 min | plan 25 s, then the slowest job | — |
| Checks · Check impact plan | 25 s | 21 s avg | a missing plan is RED |
| Checks · Types · Lint · Docs | 260 s | 150 s avg / 238 s max | type, lint and documentation gates |
| Checks · Unit · Contract (x3) | 310 s | 2026-11-18, 22 trains: shards 79-340 s, 4-201 s, 4-285 s; full sweep 271 / 222 / 186 s by file count | affected unit tests and reached plus core contracts; the full sweep after merge |
| Checks · MCP | 390 s | 146 s avg / 382 s max | the MCP boundary |
| Checks · Required checks | 10 s | not yet measured | the one context `main` requires: plan, gates, unit and MCP each `success` |
| Browser surfaces (macOS) | 180 s | 159 s (run 45020130503, 2026-11-22: setup 46 s, static 27 s, web 49 s) | static-export-only behaviour, the unattended gateway; nightly and before a stable release |
| Browser suite (macOS x3) | 1400 s | 16.3, 21.3 and 23.3 min per shard before rebalancing, 25 min end to end, no queue; 6,605 test-seconds against 4,071 on Linux (run 45020130503, 2026-11-22) | rendered journeys and measurements; nightly and before a stable release, never before merge |
| Vault freshness | 30 s | 24 s avg | frontmatter integrity and node drift (FYI, never fails the PR) |
| Windows beta · verify | 700 s | 582 s avg | Windows-only bundle facts |
| Windows beta · Rust audit (also in the release) | 40 s | not yet measured alone; its steps took 10 s inside the Windows job | Rust advisories and unsoundness, from a lockfile-only checkout |
| Dependency audit (manifests, lockfiles, weekly) | 40 s | not yet measured; reads lockfiles, installs nothing | a high production advisory in the app or the bundled MCP server |
| Checks · Windows install canary | 100 s | derived from the release job's 57 s of shared steps | that **any** change can break `pnpm install` on Windows, which is why it carries no path filter |
| Pages · build · deploy · verify | 120 s · 30 s · 40 s | 97 s · 9 s · 18 s | the static export builds and the hosted surface answers |

The budget is declared in the workflow as `# budget: <n>s` beside the job's
`timeout-minutes`, which must sit between the budget and 1.5x it;
`tests/contract/ci-gates/workflow-budgets.contract.test.ts` refuses a job without both.
Playwright jobs are exempt from the ceiling half, because
`ci-bounded-network.contract.test.ts` already requires them to leave half the
job for tests after a bounded 12-minute browser install.

Two things the numbers are not. The pre-push budget is **printed, not
enforced** — a gate that refused a green push because the machine was busy is
the defect `.claude/rules/testing.md` ("The timing rule") exists to stop. And a
lane's measured time is not a pass condition anywhere: only a job's own
`timeout-minutes` can fail on the clock, which is the mechanism these budgets
bound.

To re-measure a CI job: `gh run list --limit 20` then
`gh run view <id> --json jobs`.

The Windows install canary carries no path filter because any change can break
`pnpm install`; its header in `.github/workflows/checks.yml` records why.

## Repository commands

What each contributor command answers, sorted by command.

| Command | What it answers |
|---|---|
| `node scripts/ci/quarantine.mjs run-browser` · `run-unit` · `check-expiry [--today=YYYY-MM-DD]` · `prove <file>` | Run the quarantined Playwright specs or Vitest files and print passed or failed per file; fail when an entry in `tests/quarantine.json` is past its `expires` day; repeat one file 65 times in batches of 5, 10 and 50, stopping at the first failure, as the evidence that a fix holds |
| `node scripts/ci/run-playwright-ci.mjs --help` | Browser shard options, including `--only` for a named set of spec files, without discovering or running tests; unknown options fail before execution |
| `pnpm agents:check` | Each harness's instruction files are valid; Codex and Claude files need not match |
| `pnpm brand:cast` | Redraw the Work status rows for each Moru cast character (body palette and head piece) into `public/brand/mascot-<row>-row-128-<character>.png`; run after `pnpm brand:sprites` |
| `pnpm brand:cast-preview` | Regenerate the whole Moru cast preview from `scripts/brand/moru-cast/` (every clip as strips and GIFs, measurements, contact sheets, the life prototype page and the farm page) into git-ignored `output/moru-cast/`; nothing it writes ships. Plan: `docs/specs/2026-11-22-moru-cast.md` |
| `pnpm brand:room-clips` | Redraw the cast clips beyond the room rows (tools, emotions, the pair's talks) as one grey strip each into `public/brand/moru-room-<clip>.png` and `public/brand/moru-room-clips.json`; no surface reads them today, since Work status draws no Moru. Fails if a strip does not open and close on the neutral pose |
| `pnpm brand:sprites` | Rebuild Moru sprites, 85 animation exports, 16 poses and compass sizes from retained project sources; inspect `assets/brand/moru/preview.html` |
| `pnpm brand:work-clips` | Redraw the eleven code-drawn Work status clips from `scripts/brand/moru-work-clips.mjs` into `assets/brand/moru/source/motion-v10/` and their `moru-source.json` entries; run `pnpm brand:sprites` after it |
| `pnpm brief:new -- --slug=<slug> --owns=<path,...>` | A delegation brief with the port, scratch, checks and merge lines filled in |
| `pnpm build` | The two folders one Vite bundle makes: the docs vault and the messages first, together, then the type check (`ATLAS_BUILD_SKIP_TYPECHECK=1` skips it where Checks already ran it), then the app folder (`src-tauri/target/desktop-frontend`, which Tauri embeds) beside the site folder (`out/`, which the website host serves, prerendered by `scripts/web/site/prerender-site.mjs`), then the first-load budgets, the app-folder content check and a check that both committed route trees (`route-tree.gen.ts` and the app's `app-route-tree.gen.ts`) are current. `pnpm build:app` and `pnpm build:site` build one |
| `pnpm build:app` | The app folder alone: data, type check, `vite build --manifest`, then the map's first-load budget and `pnpm desktop:app-folder` |
| `pnpm build:first-load -- out en en/topology` | Per route, the JavaScript its HTML loads up front (raw and brotli KB) and any generated JSON literal over 50 KB; fails on a page naming no chunks, a missing chunk, or an oversize literal. `--allow-json=<route>` exempts a route; `--max-brotli-kb=<n>` fails a route over `n`. The app has one document for every address, so its screen is a route module: `--app-route=src/app/routes/\$locale/_app/topology --manifest=<manifest> src-tauri/target/desktop-frontend` reads the entry and that module's chunks from the build manifest. `pnpm build` runs both: the map at 1,001 KB brotli, `en/download` at 462 KB |
| `pnpm build:site` | The site folder alone: data, type check, `vite build --mode site`, the prerender, then the download page's first-load budget (what `deploy-pages.yml` builds) |
| `pnpm build:unless-built` | `pnpm build`, skipped when the app folder and the site folder were built from exactly the current inputs; fails without writing the reuse stamp if inputs change during the build |
| `pnpm bundle:plan` · `pnpm bundle:prune` | Plan a merge and its trial conflicts, then delete every branch (local and origin, also origin-only), `worktree-agent-*` twin and worktree whose head `git merge-base --is-ancestor` finds in `origin/main` (a squashed or cherry-picked copy keeps it), close open drafts, and run `git worktree prune` and `git fetch --prune` (`/merge`, `/integrate`) |
| `pnpm checks:changed` | Which gates this change needs; `-- --run --slice` leaves `test:contracts`, `knip`, `typecheck`, `build` and the `test:mcp` suites to the integration tree |
| `pnpm conflicts:scan` | Which open pull requests change the same files as this branch, and whether a trial merge conflicts |
| `pnpm decisions:find <terms>` · `pnpm decisions:check` | The decision to cite or overturn, and whether this change owes one |
| `pnpm design:tokens -- [--prefix=<name>]` | The current token ramps, resolved from app/styles |
| `pnpm desktop:app-folder` | Fails when the app folder holds a file only the website serves, a file nothing names, or an inline style in `index.html` (`--folder=<path>` checks another folder) |
| `pnpm desktop:perf` | The app folder's size budgets: bundled assets in total, the largest chunk, and (with `--require-app`) the built `.app`; fails closed when no chunk can be measured |
| `pnpm desktop:release-browser-gate -- --sha=<commit> [--tag=vX.Y.Z]` | Whether a stable release of that commit may publish: only when the newest finished `e2e.yml` run on it is a green whole run; a running, red, partial, expired or absent run refuses and prints the dispatch command for one |
| `pnpm desktop:release-promote -- --from=vX.Y.Z-beta.N --mode=<admit, stage or verify>` | Promote a published beta to `vX.Y.Z` with the same bytes: admit checks the two tags, the beta release and the browser gate; stage copies the beta's assets after checking each against its `.sha256` and writes `latest.json`; verify checks the public result |
| `pnpm desktop:smoke` | After `pnpm build`: the app folder holds `index.html`, the loading picture in every language, each screen's marker in the chunks its route loads (lazy ones included), the license texts and only what the app uses; the site folder holds the download page's title, copy and marker in every language and the crawler files |
| `pnpm dev` | Vite's dev server on `127.0.0.1:3000`, the address Tauri's `devUrl` waits for; `predev` builds the docs vault and the messages first |
| `pnpm doc:new -- --type=<kind> --area=<area> --slug=<slug>` | A new living document from its template in `docs/.templates/` |
| `pnpm docs:check` | Docs gates, including `pnpm docs:language`, `pnpm source:language`, `pnpm changelog:check`, `pnpm dev-checks:check`, `pnpm docs:meta` |
| `pnpm docs:meta` · `pnpm doc:history -- <path>` | Every living document's kind, status and area; one document's commits across moves |
| `pnpm docs:move` | Moves the documents in `docs/.moved.json` and rewrites references (`-- --check` only reports) |
| `pnpm download:repo-facts` | Records this repository's star and fork counts, with the day read, for the download page's open-source section |
| `pnpm e2e:durations -- <timings dir>` | Rebalances the browser shards from downloaded `playwright-timings-*` reports |
| `pnpm e2e:sleeps:check` | Refuses a new fixed `waitForTimeout` without a `// measurement window:` note |
| `pnpm gates:yield -- --runs=200` | Which CI checks ever failed, per run, from the lane reports CI uploads |
| `pnpm gateway:capture -- --base-url=<static export>` | Re-shoots the app screens in `public/gateway/`, in Korean and English; `--only=map,neural` re-shoots this README's two map pictures; `--only=harness-film` re-shoots the download page's harness film stills in all four languages |
| `pnpm harness:tokens -- --since=<date>` | Where Claude Code tokens went per agent type, from local transcripts, and which runs broke the compaction window or turn caps ([budget](engineering/agent-effort.md#token-budget)) |
| `pnpm integration:add <branch>` | In the integration worktree: merge one returned slice with `--no-ff` (refusing anything but a merge commit whose second parent is the slice head), stop on a conflict with its files listed, run `pnpm checks:changed -- --run --slice` on the slice's files, and leave the push to `integration:pr`; run it again after resolving a conflict or committing a fix |
| `pnpm integration:pr -- --title=<title> [--notes=<file>]` | Merge `origin/main` into the integration branch, run `pnpm checks:changed -- --run` on every path the branch changed, `pnpm test:contracts`, `pnpm knip` and `pnpm typecheck` once, push, and open or update its one draft with each component @ head sha, a `### Conflicts` section and the lanes run |
| `pnpm integration:prune -- [<integration branch>] [--apply]` | After the integration pull request merged: the integration branch and every component it merged, through `pnpm bundle:prune`, deleted only when `git merge-base --is-ancestor` puts the head in `origin/main`; exits 1 and names each branch kept |
| `pnpm integration:start <topic>` | Create `integration/<topic>-<yyyy-mm-dd>` from `origin/main` in `.claude/worktrees/integration-<topic>`, push it, and install that worktree offline; no CI runs |
| `pnpm knip` | Dead files, exports and types |
| `pnpm licenses:check` · `pnpm notice:build` · `pnpm notice:check` | Shipped packages are on the license allow-list, and `NOTICE.md` is current ([rules](engineering/third-party-code.md)) |
| `pnpm mcp:tools-list-bytes` | What `tools/list` costs a connected agent, read from the booted stdio server for the full and the construction profile: per tool, the model-read bytes (name, description and input schema), the output schema and the whole entry, then the totals and the whole `tools/list` response; `-- --json` prints the same as JSON |
| `pnpm messages:build` · `pnpm messages:check` · `pnpm messages:adopt` | Compose `messages/<locale>.json` from one file per namespace, prove it current, and carry an old branch's edits |
| `pnpm messages:coverage -- --locale <code>` | Checks one locale's strings against `en`: arguments, plurals, script, keep-terms and typography |
| `pnpm og:build` | Re-render the 1200×630 link-preview card for each locale into `public/og/` and `public/og-image.png` from the download headline; macOS for the Japanese and Chinese faces |
| `pnpm perf:app-open -- --files=2000 --files=20000 --shape=key --walk=map --walk=library --check` | macOS only, one run at a time. Builds a copy of the app with its own bundle identifier (`dev.jinan.ontology-atlas.perf`) that runs beside the installed app and never touches it. It runs with a scratch `HOME`, so its app data and index stay out of yours. Its window floats above other windows without taking keyboard focus, because WebKit pauses a hidden page; with the screen locked only the footprint and census times are measured. It opens each generated vault twice: first with no index, then again from the index. It prints every row of `scripts/perf/budgets.json`: the physical footprint of the WebView and the app (steady and peak, sampled twice a second), the time to first concepts and to loaded, the longest gap between animation frames, frame p95 and island open per `--walk`, and the `footprint` and `vmmap --summary` regions at 2,000 files or with `--vmmap`. `--build` rebuilds the app |
| `pnpm perf:builtin-model -- --model-dir=<folder>` | The app's built-in bge-m3 model from local copies of the publisher's `pytorch_model.bin` and `tokenizer.json`, with no download: the files against their pins, preparation time, f16 against fp32 on the labelled fixture, build throughput, question latency and memory after unloading, one CPU batch in f32, and cosine against Ollama's `bge-m3` when it runs; `--only=<steps>` picks steps; `--write-references` rewrites the reference vectors a fresh conversion is checked against; the first release build takes minutes |
| `pnpm perf:mcp:memory` · `pnpm perf:mcp:memory:check` | Whether the MCP server releases memory across repeated calls; about a minute |
| `pnpm perf:mcp:scale -- --files=50000 --flow=a --flow=b` | CPU of each MCP read's first and second call (`get_concepts`, `find_backlinks`, `query_ontology` `path`, `compile_ontology`, `find_evidence` with a phrase and with a word half the files hold), and memory after 20 calls, on a generated vault (`a`: every page a node; `b`: a few thousand nodes among plain pages); `--tool=validate_wiki` measures one tool instead: its first call, a repeat and a call after a one-page edit, with the source server's heap peak and heap after collection; `--flow=library` (with `--tool`) generates half sources and half wiki pages citing them; `--server=<binary>` measures a compiled server; `--check` (50,000 files, both flows) gates the compiled binary (`pnpm mcp:build-binary` output by default) at 600 ms per second call and, on macOS, a physical footprint of 185 MB after 20 calls and 470 MB at peak; RSS is printed, never gated; then it prints the source server's figures ungated |
| `pnpm perf:meaning -- --files=10000 --files=50000 --shape=key` | Search by meaning's preparation through Ollama on this computer: passages per generated vault (split by the app's index), embedding throughput per model, the preparation time it implies, one-question latency, and the runner's physical footprint, each with the load average; passage counts only without Ollama; a few minutes. `--builtin` measures the app's own job and search with the built-in model instead, on a store `perf:builtin-model --only=prepare` made (`--model-store=<folder>`; nothing is downloaded): passages per second, the app's peak footprint and heap while preparing, its footprint 60 s after, cold and loaded question latency, and `plan` on an unchanged folder, for 2,000 and 10,000 files; the first release build takes minutes |
| `pnpm perf:meaning-quality` | Recall@8 of the Wiki question desk on the labelled fixture (`tests/fixtures/meaning-search/`, 60 questions): the desk's word search against word plus meaning fused by reciprocal rank, per Ollama embedding model and per subset; word only without Ollama. Passages come from the app's index through the release `vault-index-bench`, which the first run builds; about a minute after that |
| `pnpm perf:ui-move -- --out=<result.json> [--label=vite] [--runs=3] [--build-command=…] [--dev-command=…] [--cache-dir=…]` | Criterion 1 of `docs/specs/2026-11-27-ui-on-vite.md` for one build tool, run alone. N cold (the `--cache-dir` folders deleted, `node_modules/.vite` by default) and N warm builds with `ATLAS_BUILD_SKIP_TYPECHECK=1`, each with its wall time and peak memory (the largest sum of resident memory over the command's whole process tree, sampled every 100 ms by `ps` on macOS and Linux, by PowerShell `Win32_Process` on Windows); then N cold and N warm dev starts, each timed from spawning the dev command to `waitForMapSettled` on `/en/topology/` under the faked app runtime in headless Chromium, with its console errors counted. The port comes from `--port` or `PLAYWRIGHT_BASE_URL`, and `{port}` in `--dev-command` is replaced by it. Every sample carries the load average at its start and end; the JSON in `--out` holds each sample and the median per measure, and a failed sample is kept but never enters a median. `--only=builds` or `--only=dev-starts` runs half. The browser half is `tests/e2e/perf/time-to-map.probe.ts`, which the suite never runs ([map](../scripts/perf/vite-move/README.md)) |
| `pnpm perf:vault-index -- --files=10000 --files=50000 --shape=key --shape=all --check` | The installed app's search index on generated vaults: build, reopen, one-file update, ranked search, size and peak memory against their limits; a few minutes |
| `pnpm perf:vault-open -- --files=10000 --files=50000 --shape=key --shape=all --check` | The installed app's reopen from cached rows on generated vaults: a build from files against a reopen with one changed file, heap held, and the rows and index sizes against their limits; also proves a manifest from rows equals one from files; a few minutes |
| `pnpm pr:ci <n>` | Mark a finished draft ready so its CI runs before `pnpm pr:land` |
| `pnpm pr:land --plan <n...>` | Dry-run a merge |
| `pnpm pr:land <n>` | Merge a pull request on its own CI run; a head behind `main` falls back to the dormant train code, so merge `origin/main` first. While `main`'s nightly browser run is red it names the failing specs and still merges. Disable main's linear-history requirement so its merge commits are accepted |
| `pnpm review:facts -- --base=<ref>` | The mechanical facts a reviewer would otherwise count by hand: line growth, 800-line files, export and dependency changes, untouched sibling tests, security paths |
| `pnpm seo:check` | After `pnpm build:site`: every sitemap URL in `out/` canonicalizes to itself, every other indexable page consolidates into a sitemap URL, `/` and each locale root point at `/{locale}/download/`, and titles and descriptions are unique per locale |
| `pnpm site:diff -- --next=<next out folder> --vite=out` | Page-by-page parity of the site folder with a Next export kept as an artifact: whole heads (minus each side's own scripts, stylesheets and preloads), `<html lang>`, `<a href>` and `<img>` attribute sets in document order, visible text, HTML bytes not larger, the policy meta before any script, and byte-identical `robots.txt`, `sitemap.xml`, `llms.txt` and `llms-full.txt`. `--list-allowed` prints each allowed difference with its reason. Build both from the same commit, since the sitemap's `lastmod` comes from Git |
| `pnpm typecheck` | Types across every file, the generated route tree included |
| `pnpm ui:audit -- --url=<base> --route=<path> [--setup=<module.mjs>]` | Prepare an interactive state with an optional local module, then measure rendered facts per width: horizontal overflow, occluded or unreachable controls, small touch targets, off-ramp type/radius/shadow values, low contrast, unequal repeated sets, scroll-end reserve |
| `pnpm unit:durations -- <timings dir>` | Rebalances the Unit · Contract shards from downloaded `vitest-timings-*` artifacts of a full run |
| `pnpm who-catches-what` | For each `fix` change among the 200 merged before `bf6670e469`, whether it corrected lines an earlier change wrote, which change, how long before, and what caught the fault, by the sealed rule in `scripts/records/who-catches-what-rule.md`; then how many concepts in `docs/ontology` are checked, stale or undated by `validate_vault`'s evidence rule. Reads Git, `gh` and the vault (`docs/specs/2026-11-27-when-people-cannot-keep-up.md`, criteria 2 and 3) |
| `pnpm ui:look -- --route=<path> [--vault=fixture\|sample\|<dir>] [--widths=1440] [--audit]` | Builds and serves the static export on a free port (or uses `--url`), opens each route in a test browser that answers the app's native calls (the faked app runtime) with the vault attached, and prints one screenshot path per route and width |

Use `--scope=<selector>` to audit one visible modal or region. The selector must match exactly one visible element; the report includes its measured element count.
