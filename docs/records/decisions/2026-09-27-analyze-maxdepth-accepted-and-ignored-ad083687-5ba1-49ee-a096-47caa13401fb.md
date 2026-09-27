---
id: ad083687-5ba1-49ee-a096-47caa13401fb
date: 2026-09-27
---
## 2026-09-27 — analyze_repo_structure documents maxDepth as accepted and ignored

**Why**: `analyze_repo_structure` validates `maxDepth` (0 to 10, default 2) and never reads it; its only use is the empty statement `if (maxDepth > 0);` in `mcp/src/analyze/repo-structure.mjs`. Its schema still said "Higher → more elements", `index_project` called it a folder walk depth forwarded to the analyzer, and the CLI help for `analyze --max-depth` said the same, so an agent that raised it to get more elements got an identical result.
**Prior**: none; `pnpm decisions:find maxDepth` finds no record.
**Decision**: keep the field and its 0 to 10 validation on both tools and both CLI flags, and say in the `analyze_repo_structure` and `index_project` descriptions and in the CLI help that the value is accepted and ignored; the generated MCP surface, which lists argument names, is unchanged.
**Dissent**: remove the field, which shrinks the surface and cannot mislead, but breaks callers that pass it: both tools and the CLI `analyze` and `index` flags forward it, and `index_project` echoes it in `reviewCalls`. Or honour it with a deeper element walk, which changes what the analyzer proposes and needs its own field trial.
**Falsifier**: a caller is seen setting `maxDepth` to change the analysis after this description ships, or a product need for a depth-bounded element walk appears; either reopens removal or implementation.
**Owner**: Stark (proposed in the pull request that fixes the docs/ontology walk; landing it accepts this record)
