---
id: 65881343-b4f8-4846-bf72-def5ddf792c8
date: 2026-09-27
kind: tool-efficiency
status: reported
harness_area: landing
---
**Observed**: I needed to show that `perf/desktop-memory` still builds and tests once merged with #2042 (`fix/repo-config-exec-hardening-and-vault-scope`). A worktree was not an option, because it would have to be deleted afterwards and subagents may not delete worktrees. So I ran `cargo test` on the `git merge-tree --write-tree` result, exported with `git archive <tree> src-tauri` into the scratchpad. It failed three times, one missing input at a time: first `resource path binaries/ontology-atlas-mcp-aarch64-apple-darwin doesn't exist`, then `resource path ../LICENSE doesn't exist`, then `couldn't read src/../../tests/fixtures/llm-provider-hosts.json` for three `include_str!` fixtures. The fourth run passed (378 tests), with the sidecar binary and `out/` linked in and `LICENSE`, `NOTICE.md` and the three fixtures exported beside the tree.
**Cost**: three failed builds, about 8 minutes, estimated.
**Suspected cause**: the crate reads files outside `src-tauri/` (`bundle.resources`, `bundle.externalBin`, `build.frontendDist`, and `include_str!("../../tests/fixtures/…")`), and nothing lists them for a tree tested out of place.
**Proposed change**: script: `pnpm desktop:test-tree <tree-ish>`, which exports `src-tauri`, the bundle resources and the included fixtures from a tree-ish, links the sidecar binary and `out/`, and runs `cargo test` there. The trial-merge step in `/land-bundle` would call it.
