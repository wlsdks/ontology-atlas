---
id: 16174ba8-7cd5-468b-ae6b-2325853c71c2
date: 2026-09-28
kind: gate-gap
status: reported
harness_area: ci-gates
---
**Observed**: `pnpm package:check` failed on origin/main `63146edc7` with `AssertionError: mcp: src/confined-source-fs.mjs is reachable from package entrypoints/scripts but missing from package.json#files`, and after that was listed, the same for `src/hardened-git.mjs`. #2095 and #2083 each added an MCP module that the server imports without adding it to `mcp/package.json#files`, and both landed through the train.
**Cost**: two extra commits and a re-run of the check plan on #2087; a packed MCP server from main would fail to import both modules.
**Suspected cause**: the landing CI does not run the `package:check` contract that `checks:changed` recommends as an escalation, so a missing `files` entry reaches main.
**Proposed change**: gate | run `node scripts/check-package-contracts.mjs` in the CI lane that runs when `mcp/src/**` or `cli/src/**` gains a file.
