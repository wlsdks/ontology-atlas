---
id: 7c0a8fd4-34c4-4aa8-93df-be0614f6d11c
date: 2026-09-28
kind: tool-efficiency
status: reported
harness_area: e2e
---
**Observed**: `docker run -v <worktree>:<worktree> mcr.microsoft.com/playwright:v1.62.0-noble node node_modules/@playwright/test/cli.js ...` failed with "Cannot find module .../@playwright/test/cli.js"; inside the container `ls` reported "cannot read symbolic link 'node_modules/@playwright/test': Operation not permitted", as root and as the host uid. Plain files on the same mount read fine. Overlaying a dereferenced copy (`cp -RL` of `@playwright/test`, `playwright`, `playwright-core`, `axe-core` from `node_modules/.pnpm`, 18 MB) with `-v <copy>/node_modules:<worktree>/node_modules` ran the specs.
**Cost**: about 15 minutes and five container runs, measured 2026-09-28.
**Suspected cause**: the Rancher Desktop file share does not let the VM read pnpm's relative symlinks.
**Proposed change**: script: a `pnpm e2e:linux -- <spec...>` wrapper that builds the dereferenced package set once and runs the Playwright image with `PLAYWRIGHT_STATIC=1` against `out/`.
