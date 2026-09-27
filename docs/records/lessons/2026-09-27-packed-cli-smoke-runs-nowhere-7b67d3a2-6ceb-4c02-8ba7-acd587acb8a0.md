---
id: 7b67d3a2-6ceb-4c02-8ba7-acd587acb8a0
date: 2026-09-27
kind: gate-gap
status: reported
harness_area: packaging
---
**Observed**: `pnpm smoke:packed-cli` fails on `origin/main` 0f2b81da9 with its own manifests (checked by restoring them): the installed CLI's `init ontology --quick-start` "expected exit 3, got 2", because the packed MCP server throws `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING` for `node_modules/ontology-atlas-mcp/src/analysis-record.mts` (added in #1492, 2026-09-07). `docs/DEVELOPMENT-CHECKS.md:922` lists the smoke as a check, but no workflow runs it and no check rule recommends it: `scripts/lib/check-rules/mcp.mjs:128` and `packaging.mjs:18,38` match the smoke script only to recommend `dogfood:verify` and `package:check`. Found while running it for the `"private": true` change in #2043.
**Cost**: one failed run and a second on the base manifests to prove the failure was not this change, about 10 minutes; how long the packed install path has been broken is unknown.
**Suspected cause**: the smoke is manual-only. A TypeScript source file inside the published `files` of `mcp/` works from the checkout and the bundled binary, but not from an installed tarball, and nothing that runs routinely installs the tarball.
**Proposed change**: gate: have the `packaging` or `mcp` rule recommend `pnpm smoke:packed-cli` when `mcp/src/**` or either package manifest changes, and either fix the packed path (compile or exclude `.mts` from `files`) or retire the smoke and its DEVELOPMENT-CHECKS entry if the packed channel is not a product.
