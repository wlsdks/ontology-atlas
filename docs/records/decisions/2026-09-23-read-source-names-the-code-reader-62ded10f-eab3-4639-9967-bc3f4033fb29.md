---
id: 62ded10f-eab3-4639-9967-bc3f4033fb29
date: 2026-09-23
---
## 2026-09-23 — read_source refuses a code path by naming the call that reads it

**Why**: a Rust trial builder working growth_plan's first next read asked read_source for `src/options.rs` lines 276-470 and was told only that the path must sit under `sources/`. It found analyze_repo_structure `sourceReads` unaided; a less persistent agent would have stopped with the read undone.
**Prior**: 2026-09-22 "A replay on two unknown repositories names the next four gaps" standing (outline reads live on `sourceReads`); 2026-09-23 "A dependency witness is an import" standing.
**Decision**: read_source stays a vault-sources reader. Given a repository path it refuses with the exact `sourceReads` call (outline, then a bounded range); a traversal path is refused on the path rule with no reader offered. Its description opens with which files it reads.
**Dissent**: a second reader name for code would be clearer than a refusal that redirects; not taken, because two tools reading two different roots under one name is the confusion being fixed.
**Falsifier**: in the next replay a builder calls read_source on a code path and stops, or ignores the named call.
**Owner**: Stark
