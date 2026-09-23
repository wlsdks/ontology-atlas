---
id: "1fbe84c7-b04a-4206-932d-4ec3b67da82d"
date: "2026-09-23"
task: "PERF-DEPENDENCY-WITNESS"
status: "done(local witness parsing optimization and verification)"
parents: []
worktree: "main-3"
---
# Dependency witness parsing: preserve the rule, remove repeated scans

## Product pass and boundary

After PR #1807 merged as `42626e7b89cccce25a4b6728621c65599446a83b`, the owner asked to continue improvements, keeping the largest measured bottleneck first. A probe of the real 97-node vault found dependency-witness checks spending about 47 ms repeatedly parsing the same source text.

- Prior: 2026-09-23 decision `bd98ff72-6ec2-4338-8373-0a1b1d03fcc2`, "A dependency witness is an import, not a word", remains standing. Its import grammar, direct-path rule, case sensitivity, module-root handling, rationale-file lookup, and warning policy are unchanged.
- Human outcome: `judge`; preserve which declared edges have a witnessed import while reducing repeated diagnosis cost. Evidence is observed. Router: reversible, two-way solo; truth, transfer, agent-write, and human-correction boundaries unchanged.
- Recovery proof: identical source bytes, targets, and rationale files yield identical findings; a bare word remains unwitnessed, a distinct rationale file must supply its own imports, and a later call must read changed source bytes.
- PO run: `7f4bb8f3-a6f3-4033-882d-a380e5228909`. Owner clarity and later independent reuse are unmeasured.

## Implementation and measurement

Within one `dependencyWitnessFinding` call, each distinct candidate text is parsed once into module-name segments. Repeated edges reuse this set. The map is released at the end of the call; the existing file reads, path clamps, and complete import patterns are unchanged.

Paired measurement on the real 97-node vault, same process and inputs, one warmup for each implementation, eleven alternating-order samples: median **45.36 ms before, 19.56 ms after**, a **56.9% reduction** in this check. Large-text pattern scans decreased from 848 to 368 across 43 distinct source texts. This is the witness-check slice, not the speed of the whole product.

The current persistent MCP probe reported repeated health at 102.65 ms and agent brief at 106.71 ms. These are supporting runtime samples, not a paired end-to-end speedup claim. The first health call still walks Git history and took about 1.18 seconds.

## Verification

- Meaning-findings suite: 59 tests passed, including a 12-dependency work-count regression, distinct source/rationale files, next-call source changes, and the existing positive and negative witness cases.
- Exact before/after comparison: 480 cases across JS/TS, Python, Rust, Go, C-family, and Ruby; 178 witnessed cases and 302 unwitnessed cases. Includes multiline syntax, module roots, case differences, bare words, literal paths, empty text, and rationale-file witnesses.
- Three deliberate defects each turn the guard RED: parse again for every edge, use one file's module set for a different file, and retain source text globally across calls. Each was restored and the whole suite returned GREEN.
- No new command or CI gate: the existing `test:mcp:unit` inventory and MCP CI lane include this file; `checks:changed` recommends both the direct suite and the full MCP unit suite.
- Ontology inspection: `elements/meaning-gap-findings` already describes the same responsibility and boundaries. No meaning or relation delta; no vault write. Construction rules and write behavior are preserved rather than extended.

## Delivery boundary

This record captures local implementation and proof before its PR lands. No release, installed-app, browser-FPS, or semantic-qualification claim. Baseline and scripts are under `/tmp/atlas-performance-main-3/` (`witness-paired-results.json`, `witness-differential.mjs`, and RED/GREEN logs).
