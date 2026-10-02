---
id: "fb298301-c483-4ae7-98a3-e31f17b0cbad"
date: "2026-10-01"
task: "Runtime-Efficiency-Local-AI"
status: "in_progress"
parents: ["b1918b78-a25a-4d0f-95ba-552d4866d312"]
worktree: "fix/acp-startup-buffer"
---
# Runtime efficiency and local-AI quality campaign

Delivered to main: vault/map caching and cheaper geometry (PR 2227); bounded history selection and record-sized buffers with a Next security patch (PR 2229); cancelled/obsolete model turn ownership (PR 2232). Native directory inventory materialization and actual curl cancellation remain separate limits.

Local model setup: the later owner instruction authorized download and setup. Qwen3.8-27B MLX nvfp4 is installed; atlas-qwen3.8:27b shares its weights and sets a 16,384 context. Native generation and a synthetic read-only MCP get_concept round trip passed. This does not qualify general model or ontology quality.

Pending native slice: draft PR 2236 bounds HTTP capture to 4 MiB stdout and 64 KiB diagnostics. Seven capture cases, 46 focused Rust cases, 418 full native cases and 12 focused recommendations passed. A macOS build-dependency stripping failure was repaired while retaining the shipped binary's stripping and matching dSYM. The built app was installed and bundle identity matched. The Mac console is locked; installed response replay and landing are pending, not passing.

Current independent slice: fix/acp-startup-buffer bounds early channel events and clears stopped callbacks. Nine regression cases and four independent mutation probes protect count, total text, aggregate accounting and stop ownership. Complete recommendations and independent review remain to finish; no ACP change has landed yet.

Next product slice: an installed Map baseline showed only Claude Agent in the quiet conversation picker after local-model setup. A reviewed external specification proposes explicit Map target choice, unchanged initial Automatic priority, target-owned drafts, and guards around active turns/permissions/proposals. Actual saved-local-model readback and Map dispatch proof remain to capture together; no choice implementation has landed.

Remaining audit: ACP bounded_run pipe/deadline behavior; transcript packet allocation; actual native model cancellation; prompt/context delivery; cache/data lifetime and module responsibilities. The goal remains in progress. iCloud data and sync settings are excluded from cleanup work.
