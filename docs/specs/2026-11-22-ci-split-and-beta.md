---
title: "Merging needs the fast checks, the browser suite runs nightly on macOS, and releases go out as a beta first"
doc_type: spec
status: draft
area: process
date: 2026-11-22
decisions: []
---

# Merging needs the fast checks, the browser suite runs nightly on macOS, and releases go out as a beta first

Read against `origin/main` at `40c9e5ae2a`. The owner approved two process changes on 2026-11-22: **A**, a light
beta release, and **B**, a split of CI. Sections 1 to 3 are B, section 4 is A.

## Person and moment

| Person | Moment | What must be true |
|---|---|---|
| A coding-agent session with a finished branch (several run at once) | Runs `pnpm pr:land <n>` | The merge waits about five minutes for types, unit, contract and MCP, and never for a screen test |
| The session that cuts a release | Tags and runs `pnpm desktop:release-run` | The owner can install the build by hand; no installed app is offered it; the stable release is the same bytes, with no waiting period |
| The owner | Installs the beta, uses it for about a day, says "promote" | One command publishes the build they used; a red browser suite on that commit refuses it |

## Today (measured)

- **Landing gate.** `main` requires eight contexts (`gh api .../branches/main/protection`): `Types · Lint · Docs`,
  `Unit · Contract`, `MCP` and five `Playwright (...)` names. `pnpm pr:land` reads the list from the API
  (`scripts/lib/landing/pr-land/github-cli.mjs:133`), counts a skipped or missing context as not green
  (`check-state.mjs:116`), and waits for or refuses on every other check as well.
- **Failures.** Of the last 60 pull-request runs `checks.yml` failed 15 (five pull requests, 8 runs on #3794) and
  `e2e.yml` 10, with 14 reruns; 10 of 55 recent trains were red.
- **Browser suite.** 225 spec files on eight Linux shards plus two surface jobs. A train runs its mapped specs and 14
  merge-smoke specs; every push to `main` runs everything (decision d3420920). Today a map-label overlap failed only
  on Linux fonts. **No pixel baseline exists**: zero `toHaveScreenshot` calls and zero PNG files under `tests/`.
- **Releases.** Ten in six days (2026-11-16 to 11-20), with same-day chains 2.2.1 to 2.2.3 and 2.3.1 to 2.3.3. Tags
  must be plain `vX.Y.Z` (`check-macos-release-tag.mjs:73`, `check-macos-release-source.mjs:6`, decision 713780f2).
- **Updater feed.** Installed apps read `https://ontologyatlas.com/update/latest.json` (`src-tauri/tauri.conf.json:80`).
  `deploy-pages.yml` writes it on each push to `main`: `pnpm desktop:stage-hosted-updater` copies the `latest.json`
  asset of the newest release that is neither a draft nor a GitHub pre-release
  (`scripts/download/stage-hosted-updater-manifest.mjs:21`). There is one feed and this spec adds no second.
- **A defect a beta would hit.** `download:release-facts:check` picks the newest non-draft release, pre-releases
  included (`generate-download-release-facts.mjs:85-91`), so a published beta would fail the next release admission.

## What others do

Repositories read through `gh api` on 2026-11-22, and public write-ups. Most pay for runners; the pattern is copied, not the volume.

| Practice | Where | Taken here |
|---|---|---|
| Heavy e2e after merge, not on the pull request | codex (`postmerge-ci`), opencode (dev/beta pushes and nightly), openclaw (hourly, full every 3 hours), n8n (nightly; on a PR only for its paths or a `force-e2e` label) | Section 1: no browser job at merge; nightly, since free macOS runs five jobs at once |
| One required summary check, defined in the repository | codex `required`, zed `tests_pass` | `Required checks`; the next change needs no settings edit |
| Quarantine with an owner and 14 days, still run nightly | opencode (`@quarantine`, `QUARANTINE.md`) | Section 3 |
| A channel above main, promoted when that commit is green | zed `-pre`, openclaw `-beta.N`, ghostty `tip`, goose canary | Section 4 |
| A fail-closed desktop beta: one tag shape per channel, the feed asserted before signing, approval before publishing | cline (`desktop-publish.yml`, Tauri) | Section 4's hard check; one feed here, so a beta writes no manifest at all |
| Rerunning failed CI on a timer | qwen-code | Not taken: `pr:land` already reruns a failed job once (4fc75f5b) |
| Route a change by what its diff touches; one script for local and CI | rentierdigital (61% of compute re-checked code), Modern Treasury (`bin/ci --group`) | Already here: `classify-change.mjs` plans the lanes and `pnpm checks:changed -- --run` runs them locally |
| One fixed, deterministic environment for pixel baselines (the Playwright Docker image, `--disable-lcd-text`, `--font-render-hinting=none`) | Argos and others | Section 2: it answers pixel diffs, which this suite has none of; kept as the rule for a first one |
| Trust a flake fix only after repeated green batches (5, 10, 50, 100) | thoughtbot | Section 3: quarantine exit |

## Decisions that cross slices

1. **The landing gate drops the browser suite entirely; it keeps no impact-scoped subset.** A scoped subset is what
   runs today (mapped specs plus the smoke set) and it is the 10 red runs in 60. `pr:land` waits on every check, so
   any browser job on a pull request gates in practice, and on macOS, where five jobs run at once, subsets from
   parallel sessions would queue behind each other and behind release builds. The impact plan stays as the opt-in,
   this repository's `force-e2e`: `gh workflow run e2e.yml --ref <branch> -f plan_from=<main sha>`.
2. **One required context, `Required checks`**: a job in `checks.yml` (key `required`) that needs `plan`, `gates`,
   `unit-required` and `mcp` and fails unless each concluded `success`.
3. **Owner action, the one thing that blocks S2.** Agents do not edit branch protection. The owner runs **O1** before
   S2 merges and **O2** after S2 is on `main`. Reversed, every merge waits forever on five contexts no workflow
   reports. In this order each is safe at any moment, because `pr:land` keeps waiting on unrequired lanes.
   - O1: `gh api -X DELETE repos/{owner}/{repo}/branches/main/protection/required_status_checks/contexts -f 'contexts[]=Playwright (static export)' -f 'contexts[]=Playwright (web surface)' -f 'contexts[]=Playwright (chromium 1/3)' -f 'contexts[]=Playwright (chromium 2/3)' -f 'contexts[]=Playwright (chromium 3/3)'`
   - O2: `gh api -X PUT repos/{owner}/{repo}/branches/main/protection/required_status_checks/contexts -f 'contexts[]=Required checks'`
4. **`e2e.yml` keeps its file name and two promises S1 reads**: `workflow_dispatch` with an empty `plan_from` runs
   the whole suite on the dispatched ref, a tag included, and a whole run uploads `playwright-timings-full-<shard>`
   artifacts. `fullBrowserRunKind` stays exported from `scripts/lib/landing/pr-land/main-health.mjs`.
5. **Quarantine is a registry the CI executors read**, `tests/quarantine.json`, whole files; not a Playwright project
   or a tag, and local runs still execute everything. S2's workflows call
   `node scripts/ci/quarantine.mjs run-browser | run-unit | check-expiry`, which S3 provides with `prove <file>`.
6. **The native lanes stay before merge.** `windows-beta-check.yml` is path-filtered to native inputs and is the only
   place a Windows compile error shows before a release build; a change under `src-tauri/` still waits for it.
7. **Version files say `X.Y.Z` on a beta; only the tag carries `-beta.N`.** The promoted build is the same bytes and
   the updater compares versions, so the app cannot call itself `2.5.0-beta.1`.
8. **Promotion is a second workflow, `promote-release.yml`.** `release-macos.yml` keeps the job set and
   write-permission map that `workflow-security.contract.test.ts` pins, so S1 does not edit that test.
9. **Words and records.** "Beta release" is the channel (`channel: 'beta' | 'stable'` in scripts); "Windows x64 beta"
   stays the platform's label. Two decision records, texts below; `chore(release):` and `chore(ci):` commits.

## 1. Landing: the fast checks (B1, B5)

- `checks.yml` keeps its triggers and plan and gains `Required checks`. `Windows install canary` stays after merge.
- `pr:land` needs no change to find the gate, since it reads protection; after O2 the three lanes are unrequired
  checks it still waits for and refuses on. `pnpm pr:ci <n>` now starts Checks alone.
- `main-health.mjs`: the browser row reads `e2e.yml`'s newest `schedule` run (was `push`), is named "nightly browser
  run", lists failing specs as today and turns stale after 48 hours. Its red text says merging continues and a stable
  release of that commit cannot publish. The line still goes into each train body.
- **Screen evidence before merge is the author's**: `pnpm checks:changed` names the mapped specs and they run locally
  on macOS, the nightly's system.
- **Integration branch (B5)** is already written down (`AGENTS.md:71-72,136`, `.claude/rules/git.md:45`, `/integrate`,
  decisions 77b860b5 and 9f2c7994). S2 adds one sentence to `git.md`: the integration pull request's one CI run is
  Checks, and rendered slices attach their local spec runs.

## 2. Browser suite: nightly and release gate, on macOS (B2, B3)

| | Today | Target |
|---|---|---|
| Triggers | `pull_request`, `merge_group`, `push: main`, schedule 19:17 UTC, dispatch | Schedule 19:17 UTC and `workflow_dispatch`; draft guards and the `Playwright (chromium k/3)` carrier job removed |
| Plan and build | `ubuntu-latest` | Unchanged: the static export is built once on Linux and downloaded |
| Suite | 8 shards, `ubuntu-latest` | 3 shards on `macos-15`: `Browser suite (macOS k/3)` |
| Surfaces | Two Linux jobs | One `macos-15` job, `Browser surfaces (macOS)`, running the static and web lanes in turn |
| Quarantine | None | `Quarantined specs` (`macos-15`, `continue-on-error`) and `Quarantine expiry` (`ubuntu-latest`) |
| Concurrency | Cancels superseded runs | One group per ref and plan, never cancelled: a release-gate run must finish |
| Workflow name | `E2E smoke` | `Browser suite` |

- **Five macOS jobs is the free ceiling** (20 jobs overall). The nightly peaks at five; a release-gate run beside a
  release's own `test-macos` and `build-macos` asks for seven, so two queue for some minutes. Estimate, not measured:
  4,600 test-seconds (Linux, 2026-11-18) over three shards of two workers is about 13 minutes plus setup. S2 measures
  it and writes each job's budget from the run. `setup-playwright` takes the cache path from the system and runs its
  apt steps on Linux only.
- **Where the suite runs: macOS, alone.** Today's failure was not a pixel diff. A geometry assertion (labels must not
  overlap) held on macOS and failed under wider Linux fonts.

  | Choice | What it measures | Free-runner cost | Verdict |
  |---|---|---|---|
  | `macos-15` runners | The shipped platform's fonts and compositor; the system authors already run specs on, so a red night reproduces locally | 5 jobs at once, 3 cores each; about 13 minutes on 3 shards (estimate) | Chosen |
  | A fixed Linux image in Docker | The same pixels everywhere, on fonts no user of the app has | 20 jobs at once, 4 cores; 9.4 minutes on 8 shards (measured 2026-11-18) plus an image pull per job; local runs need Docker | Not for geometry: it would tune layout to fonts that do not ship. It is the rule for pixels: a first `toHaveScreenshot` baseline is made in that image with the two flags, never on a macOS runner |
  | Both | Geometry on two font sets | The two costs added, and two verdicts to read each morning | Not now: the Linux-only reds are what blocked `main`. Record 2's falsifier brings back a non-gating Linux run of the gateway specs |

- **Baselines.** There are none to migrate or regenerate. What moves is calibration: thresholds were tuned against
  Linux fonts. S2 runs the whole suite once on macOS from its branch (capture R1). A spec red there and green in
  main's last Linux run is quarantined with R1 as evidence, not rewritten here; more than ten such specs stops the
  slice and goes to the owner. `pnpm e2e:durations` is refreshed from R1 so shards balance on macOS seconds.
- **Release gate.** `pnpm desktop:release-browser-gate -- --sha=<commit>` passes only when the newest finished
  `e2e.yml` run on that commit is a whole run that concluded `success`; running, red, partial, expired and absent
  each refuse and print the dispatch command. Only `push`, `schedule` and `workflow_dispatch` runs count: a fork's
  pull request can carry the release commit as its head. A whole run is marked by its title, which `e2e.yml` sets
  to `Browser suite: whole run` for a scheduled run and a dispatch with no `plan_from`, so the evidence outlives the
  repository's one-day artifact retention and a promotion days later still passes; S2 keeps that `run-name`. A run
  without the title counts only while its `playwright-timings-full-*` artifacts exist; once they expire it is
  `expired`, not `partial`. It runs in `publish-macos` before a stable release is published and in promotion's
  admission. A beta cut does not wait: `desktop:release-run` dispatches `e2e.yml` on the tag and the suite runs while
  the owner uses the build.
- **A red nightly** shows on every `pnpm pr:land` and in every train body, with its failing spec files. Whoever cuts
  the next release owns it, because the gate refuses them: fix it, or quarantine it with that run as evidence. The
  first bad merge is found locally with `git bisect --first-parent` over at most a day of merges.

## 3. Quarantine (B4)

- **File.** `tests/quarantine.json`: `{ "entries": [{ "file", "reason", "evidence", "issue", "added", "expires" }] }`.
  `file` is a Playwright spec under `tests/e2e/` or a Vitest file; `evidence` is the Actions run where it failed and
  then passed on a rerun of the same commit; `issue` is the GitHub issue that tracks the fix.
- **Shape rules** in `tests/contract/ci-gates/quarantine.contract.test.ts`, none reading today's date: the file
  exists; it is not under `tests/contract/` and not one of the 14 `MERGE_SMOKE_SPECS`; `expires` is at most 14 days
  after `added`; at most 10 entries; no file twice. `node:test` files cannot be quarantined in this version.
- **Effect.** `run-playwright-ci.mjs` drops listed specs from every gating run and `run-ci-lane.mjs` passes
  `--exclude` for listed Vitest files, so they block neither a merge nor the release gate. They still run every night
  without failing the run: `quarantine.mjs run-browser` in `e2e.yml` and `run-unit` in a `continue-on-error` step of
  the scheduled `checks.yml`, each printing passed or failed per file.
- **Who.** The session whose lane, nightly or gate run it blocked adds the entry and opens the issue, in a `test:`
  pull request of its own. A renewal is a new entry with a new `added` and new evidence.
- **Exit.** The pull request that fixes the test deletes the entry and pastes the output of
  `node scripts/ci/quarantine.mjs prove <file>`, which repeats the file in batches of 5, 10 and 50, stops at the
  first failure and prints the count. 65 of 65 is the bar; a fix that passes once is not accepted.
- **Expiry never reaches a landing lane.** `quarantine.mjs check-expiry` runs only in `e2e.yml`. An entry past
  `expires` fails that run and names the entry, so `pr:land` prints it and the release gate refuses, the way
  `acp:registry:check` gates releases and not pull requests.

## 4. The beta release (A)

- **Tag.** `vX.Y.Z-beta.N`, N from 1, at `main` head, with `package.json`, `tauri.conf.json` and `Cargo.toml` at
  `X.Y.Z`. `scripts/lib/release-tag.mjs` (`parseReleaseTag`) is the one parser. `release-macos.yml` accepts
  `vX.Y.Z` and `vX.Y.Z-beta.N` and refuses every other shape; `promote-release.yml` accepts only a beta tag.
- **Hard check: a `-beta.N` tag never writes `latest.json` and never writes the download page.** Four places hold
  it and a test proves each: `stage-macos` builds and uploads no manifest when the channel is beta;
  `desktop:verify-download -- --beta` refuses a release that carries one; the stager skips pre-releases; and
  `download:release-facts` refuses a pre-release, with `--allow-prerelease` removed. One feed exists, so no build
  can point at a wrong one, and `updater-feed.contract.test.ts` pins the single endpoint.
- **Cut: `release-macos.yml`, same jobs, channel read from the tag.** Build, sign, notarize, the native tests and the
  Windows build run as today. For a beta the draft is created with `prerelease: true`, `publish-macos` runs
  `gh release edit --draft=false --prerelease=true` and skips the download facts and the browser gate, and the MCP
  registry job skips a suffixed tag as it already does (`publish-mcp-registry.yml:67`). The `release` approval stays
  on both channels; for a beta it may be given without installing the draft, since the beta day is the install.
  `latestPublishedTag()` skips pre-releases, so admission still compares the facts with the newest plain release.
- **Promotion: `promote-release.yml` ("Promote Desktop Beta"), dispatched from `main` with `beta_tag`.** The operator
  first pushes `vX.Y.Z` at the beta's commit; the workflow creates no tag and names no `target_commitish`.
  1. `admit-promotion` (no write token): both tags peel to one commit; the beta release is published, a pre-release,
     complete and without a manifest; no release holds `vX.Y.Z`; the browser gate passes for that commit;
     `download:release-facts:check` passes. ACP registry freshness was checked at the cut and is not rechecked.
  2. `stage-promotion` (`contents: write`): `pnpm desktop:release-promote -- --from=<beta tag>` downloads the beta's
     assets, checks each against its `.sha256`, builds `latest.json` pinned to `vX.Y.Z`, creates the draft `vX.Y.Z`
     from those files and runs `desktop:verify-download -- --allow-draft --require-updater`. No job builds or signs
     and the file names no signing secret.
  3. `publish-promotion` (`environment: release`): pin recheck, `gh release edit --draft=false --prerelease=false`,
     public verification, the release-facts artifact. The facts pull request then merges as today, and its push to
     `main` lets `deploy-pages.yml` stage the feed.
- **Windows.** The unsigned installer is built at the cut, sits on the pre-release and is copied unchanged at
  promotion. It has no in-app update, so no channel logic applies; `/download` links the stable one only.
- **A direct `vX.Y.Z` cut stays** for a same-day fix, with the browser gate at publication. A fix found during a
  beta day merges to `main` and is cut as `-beta.2`, which the owner installs by hand.
- **What the release session runs.**
  ```bash
  pnpm desktop:release-github -- --tag=v2.5.0-beta.1 && pnpm desktop:release-preflight
  git fetch origin main --tags && git tag v2.5.0-beta.1 origin/main && git push origin v2.5.0-beta.1
  pnpm desktop:release-run -- --tag=v2.5.0-beta.1 --ref=main      # cut; also starts e2e.yml on the tag
  # the owner installs the DMG from the pre-release page and uses it for about a day
  git tag v2.5.0 "v2.5.0-beta.1^{commit}" && git push origin v2.5.0
  pnpm desktop:release-run -- --tag=v2.5.0 --promote-from=v2.5.0-beta.1   # promote, facts PR, registry listing
  ```

## Slices

| | Owns | Reads | Budget |
|---|---|---|---|
| **S1 Beta release.** Must be on `main` before `v2.5.0-beta.1` | `.github/workflows/release-macos.yml`, `.github/workflows/promote-release.yml` (new), `scripts/desktop-release/**`, `scripts/download/**`, `scripts/lib/release-tag.mjs` (new), `package.json`, `tests/contract/release/**`, `tests/contract/security/updater-feed.contract.test.ts`, `tests/contract/security/promote-release-workflow.contract.test.ts` (new), `docs/DESKTOP-MACOS.md`, `docs/engineering/deployment.md`, `docs/features/download.md`, Record 1 | `main-health.mjs`, `e2e.yml`, `deploy-pages.yml`, `publish-mcp-registry.yml`, `workflow-security.contract.test.ts`, `workflow-budgets.contract.test.ts` | 5 h |
| **S2 Landing gate and nightly browser suite.** Waits for O1 | `.github/workflows/checks.yml`, `e2e.yml`, `windows-beta-check.yml` (its `merge_group` comment), `.github/actions/setup-playwright/action.yml`, `scripts/ci/classify-change.mjs` and test, `scripts/ci/merge-smoke-specs.mjs`, `scripts/lib/check-rules/ci.mjs`, `scripts/lib/landing/pr-land/{main-health,github-cli,recorded-rollup}.mjs` and tests, `scripts/data/playwright-file-durations.json`, `playwright.config.ts` and `tests/e2e/post-merge-specs.ts` (comments), `tests/contract/ci-gates/{workflow-budgets,e2e-change-scope,e2e-suite-split,ci-bounded-network}.contract.test.ts`, `tests/contract/security/workflow-security.contract.test.ts`, `.claude/rules/{git,testing,surfaces}.md`, `docs/DEVELOPMENT-CHECKS.md`, `docs/ARCHITECTURE.md`, Record 2 | S3's `scripts/ci/quarantine.mjs` interface, `release-macos.yml` | 5 h and one macOS run |
| **S3 Quarantine** | `tests/quarantine.json`, `scripts/lib/ci/quarantine.mjs`, `scripts/ci/quarantine.mjs`, `tests/contract/ci-gates/quarantine.contract.test.ts` (all new), `scripts/ci/run-playwright-ci.mjs` and test, `scripts/ci/run-ci-lane.mjs` and test | `merge-smoke-specs.mjs`, `vitest.config.ts`, `e2e.yml` | 2 h |

New `node:test` cases go into existing test files or, for S1, into files S1 registers in `package.json`; S2 and S3
add no package script.

**Acceptance (each can fail).**

- **S1.** `node --test scripts/lib/release-tag.test.mjs scripts/desktop-release/check-macos-release-source.test.mjs scripts/desktop-release/promote-beta-release.test.mjs scripts/desktop-release/check-release-browser-gate.test.mjs scripts/desktop-release/watch-macos-release-run.test.mjs scripts/download/stage-hosted-updater-manifest.test.mjs scripts/download/generate-download-release-facts.test.mjs scripts/download/check-macos-download-release.test.mjs`;
  `pnpm exec vitest run tests/contract/release tests/contract/security tests/contract/ci-gates/workflow-budgets.contract.test.ts`;
  `V=$(node -p "require('./package.json').version"); pnpm desktop:release-tag -- --tag=v$V-beta.1` exits 0, and with `-rc.1`, `-beta.0` and `-beta.1.2` exits 1.
  **Gate probe**, each planted case red and its twin green. For the hard check: removing the channel condition from
  the manifest step turns the workflow contract red; a pre-release that is the newest release and carries
  `latest.json` is never staged; `--beta` refuses a release with a manifest and one that is not a pre-release;
  `download:release-facts -- --tag=<beta>` exits 1 and the check ignores a newer pre-release. Then: the browser gate
  refuses a running, a red, a partial and an absent run; promotion refuses one changed byte in an asset and two tags
  on different commits; the contract goes red when `environment: release` or the pin recheck leaves `promote-release.yml`.
- **S2.** `gh api repos/{owner}/{repo}/branches/main/protection/required_status_checks --jq '.contexts[]' | grep -c Playwright` prints 0 (O1 done);
  `node --test scripts/ci/classify-change.test.mjs scripts/lib/landing/pr-land/main-health.test.mjs scripts/lib/landing/pr-land/check-state.test.mjs scripts/landing/pr-land.test.mjs`;
  `pnpm exec vitest run tests/contract/ci-gates tests/contract/security/workflow-security.contract.test.ts`; `pnpm agents:check`.
  **Capture R1**: `gh workflow run e2e.yml --ref <branch>` then `gh run watch --exit-status`, with minutes per shard,
  queue time and every spec red on macOS. **Gate probe**: on a throwaway branch a planted failing unit test turns
  `Required checks` red (`gh workflow run checks.yml --ref <branch>`) and removing it turns it green (two run URLs);
  `main-health.test.mjs` holds a red nightly, a stale one and a night with no whole run.
- **S3.** `node --test scripts/ci/run-playwright-ci.test.mjs scripts/ci/run-ci-lane.test.mjs`;
  `pnpm exec vitest run tests/contract/ci-gates/quarantine.contract.test.ts`. **Gate probe**: an entry for a
  merge-smoke spec, one for a missing file, one 15 days long and an eleventh entry each turn the contract red; with
  one planted entry `node scripts/ci/quarantine.mjs check-expiry --today=2099-01-01` exits 1 and the gating inventory
  lacks that spec; with the registry empty `run-browser` exits 0 saying nothing is quarantined; `prove` on a fixture
  that fails on its seventh run exits 1 and prints 6 of 65.

**Gaps no command covers.** The first scheduled macOS night (S2's author adds its URL to the pull request the next
morning); the first real promotion, which is `v2.5.0`; O1 and O2; Windows and Linux fonts.

## Order

1. **S1 alone, now**, by its own draft and `pnpm pr:land`, after #3803 merges (it rewrites `package.json`). It edits
   `release-macos.yml`, so its merge waits for the Windows lane once. Then the 2.5.0 version pull request, then
   `v2.5.0-beta.1`. Until S2 merges, the beta's browser run is today's Linux suite, dispatched on the tag.
2. **S3 and S2 in parallel** on `integration/ci-split-2026-11-22` (`/integrate`): merge S3, then S2. The owner runs
   **O1** before `pnpm pr:land` of the integration pull request and **O2** once it is on `main`.

## Risks, and what protects against each

| Risk | Protection | A reviewer must check |
|---|---|---|
| A screen or motion defect reaches `main` | The author's local mapped specs; the nightly; the line in `pr:land`; the release gate on the exact commit; the beta day | That the gate reads the release commit, not `main` head |
| The nightly is red and unread (decision df55e37f: red on five of ten, unnoticed) | A stable release cannot publish from a red or unrun commit | That no flag skips `desktop:release-browser-gate` |
| S2 merges before O1 | S2's first acceptance command; `pr:land` waits and merges nothing | The protection output pasted in the pull request |
| `Required checks` goes green over a skipped lane | It requires `success`, not "not failure"; the planted-failure runs | That `needs` is the three lanes plus `plan` |
| Quarantine becomes a place to park tests | Cap of 10, 14 days, smoke and contract files barred, expiry stops releases | That `evidence` is a red-then-green pair on one commit |
| macOS runners differ: virtual GPU, 3 cores, frame timing | R1 before the switch; budgets from R1 | Motion and frame specs in R1, not only the totals |
| A beta reaches installed apps or the download page | The hard check's four places and their tests | That no path uploads `latest.json` or writes the facts when the channel is beta |
| Promotion publishes other bytes than the owner used | SHA-256 against the beta's checksum assets; no build or sign job in the workflow | That the script cannot fall back to rebuilding |
| GitHub refuses the workflow token a release when workflow files changed since the commit (`docs/DESKTOP-MACOS.md:193-198`) | The operator pushes the tag; staging fails before anything is public; a direct cut at `main` head remains | The first promotion's stage log |

## Out of scope

The "receive betas" setting and a beta feed; paid runners or services; rewriting or re-tuning the suites (quarantine
holds what macOS turns red); quarantining `node:test` files; Windows or Linux browser runs; moving the native lanes
off the pull request. **Later**: a staged rollout, which Sparkle does with `phasedRolloutInterval` and which here
would need a server in front of `latest.json`; labels by risk or blast radius (Rootly), beyond what the impact plan
already routes; a pull-request evidence template and a cap on open pull requests per author (openclaw, zed).

## Decision record text (the implementer runs `pnpm record:new`)

**Record 1 (S1): A release may go out first as `vX.Y.Z-beta.N`, and the same bytes become `vX.Y.Z`.**
**Why**: owner, 2026-11-22. Ten releases in six days with two same-day chains of three patches: 713780f2's
falsifier, a fix within 48 hours, fired. **Prior**: overturns 2026-09-27 713780f2 ("every release is a plain vX.Y.Z
tag", "no flag re-enables one"); keeps its staged draft and `release` approval, 2026-10-03 d7a8ee52 (Apple Silicon
only) and 2026-08-01 "Ship Windows x64 as a public unsigned beta", whose installer rides both channels.
**Decision**: section 4. **Dissent**: one person for one day finds what one person does; two betas of a version look
alike in the app, which says `X.Y.Z` for both; a day per release against a cadence of two a day; a fix needs a new
beta, never a patched promotion. **Falsifier**: a promoted release needing a fix within 48 hours for something a
day's use shows; a beta offered to an installed app or named on `/download`; promoted assets whose SHA-256 differ
from the beta's; three stable releases in a row cut without a beta.

**Record 2 (S2, S3): Merging needs the fast checks; the browser suite runs nightly on macOS and gates stable releases; flaky tests are quarantined for 14 days.**
**Why**: owner, 2026-11-22. 15 of 60 Checks runs and 10 of 60 browser runs red, 14 reruns, 10 of 55 trains red; a
label overlap failed only on Linux fonts, which the product does not ship on. **Prior**: overturns 2026-11-18
d3420920 (a train's specs and smoke set, the whole suite on every push) and the pull-request half of 2026-10-09
df55e37f; replaces the Linux shards and carried `Playwright (chromium k/3)` names of 2026-09-27 31ac0de3; narrows
2026-09-12 "One pull request is one CI run" to Checks. Keeps 2026-11-18 fcd74815 and 4fc75f5b, 2026-11-21 77b860b5
and 9f2c7994, (96), and 2026-09-12 "A gate may check the product, never the clock": no landing lane reads a date,
and expiry is read where ACP registry freshness is, at the nightly and the release. **Decision**: sections 1 to 3.
**Dissent**: a screen defect is found up to a day late by whoever reads the line, which went unread before; Linux
and Windows fonts go unmeasured, where one fixed Linux image would at least be deterministic; a quarantined file
parks its healthy tests too; five macOS jobs make a release and
the nightly queue each other; an impact-scoped subset at merge would catch some of this sooner. **Falsifier**: the
nightly red three nights running with no fix and no entry; a stable release published over a red or absent browser
run; a defect a merge-smoke spec covers reaching a stable release; the macOS run over 25 minutes or delaying a
release build over 10; a layout defect a visitor reports on Linux or Windows that a run there would have caught
(add a non-gating Linux run of the gateway specs); the registry full for two weeks; more than 3 of 30 merges red then green on rerun once
quarantine exists.

## Revisions

- 2026-11-22: first draft, from the owner's approval of both changes the same day. Research on agent-heavy
  repositories folded in: the single required check, the 14-day quarantine, promotion on a green commit, cline's
  fail-closed beta as the hard check, and n8n's scoped e2e as the question decision 1 answers.
- 2026-11-22: public write-ups weighed. The suite's environment is decided in section 2 (macOS for geometry, one
  fixed Linux image reserved for a first pixel baseline); quarantine exit needs 65 green repeats; staged rollout
  and risk labels are listed as later work.
- 2026-11-22: S1 review folded in. The release gate reads a durable whole-run title instead of artifacts that expire
  after a day, names an expired state, and counts only push, schedule and dispatch runs; promotion refuses a
  superseded beta and late-uploaded assets, and compares digests again before publishing; the person table says no
  waiting period.
