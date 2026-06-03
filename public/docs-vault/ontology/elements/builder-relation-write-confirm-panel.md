---
slug: elements/builder-relation-write-confirm-panel
kind: element
title: Builder Relation Write Confirm Panel
domain: views
---

`src/views/ontology-edit/ui/RelationWriteConfirm.tsx` is the confirmation panel shown after dragging between two persisted vault nodes.

It presents the inferred edge with a dedicated inferred-key row and the schema reason behind that inference, selectable relation keys, and the relation preflight result before touching disk. The default view is now a compact write-decision surface: endpoint meaning, selected relation key, duplicate/inverse/path evidence, graph effect, save checklist, and sticky copy/cancel/save actions stay visible without forcing the user to read every proof packet first.

The detailed evidence is still present, but it is grouped behind native disclosure sections. Traversal completeness, bounded `all-paths --plan`, the `all_paths` evidence contract, CLI/MCP preflight copy actions, endpoint review links, post-save topology/query handoff links, and the full write-scope table are collapsed by default. This keeps the human-facing modal simple while preserving the exact Claude Code / Codex proof packets and frontmatter write evidence for users or agents who need to inspect them.

The write-scope disclosure contains the source markdown file, changed file list, unchanged target file list, explicit source-only write boundary, frontmatter key, relation meaning, exact mutation, frontmatter patch snippet, MCP `add_relation` args, and MCP write policy. The boundary still says the builder writes only the source frontmatter while the target file remains unchanged, which keeps a drag operation from feeling like an implicit two-file edit. The copied relation review packet carries the same write-boundary line for Claude Code / Codex handoff.

The preflight card breaks the result into explicit evidence rows for exact edge, inverse edge, and existing path, so the user can see whether the save is clear, blocked, or intentionally overriding existing graph context instead of reading only a summary decision label. The deeper traversal disclosure keeps the CLI and MCP preflight copy actions: CLI copies `relation-check` plus bounded `all-paths --plan`, while MCP copies the matching `query_ontology(...)` checks.

The panel also shows a save decision checklist before the sticky action area: selected-key match, preflight result, bounded traversal evidence, and post-save sync gate each get a compact state badge. Clear inferred-key and preflight rows show as ready, alternate keys and existing graph context show as review, exact duplicates show as blocked, and post-save sync is always marked required. The sticky write action area repeats the decision as the next action: clear preflight can be saved after reviewing the patch, review states keep the packet copyable but ask for read checks first, and exact duplicates explain that no frontmatter write is needed.

Its selectable keys cover the schema-level writable graph arrays (`domains`, `capabilities`, `elements`, `dependencies`, `contains`, `describes`, `relates`) rather than only the four older builder fields. The inspector can also show and edit those arrays, so a confirmed relation write stays visible after it lands in frontmatter.

The save action is disabled for exact duplicates. The direct MCP write copy action is stricter: it is enabled only for `safe_to_add`, while inverse, existing-path, direct alternate-key, and alternate-key warning cases remain possible but visible through the human save flow so the user can make an intentional ontology modeling decision. Direct existing paths are shown in the path row inside the traversal disclosure instead of being hidden because they are only two hops.

The panel only closes after the relation write reports success or a duplicate no-op. If the vault write fails, the pending relation remains visible with the selected key, preflight evidence, write-scope disclosure, and sync-gate copy actions intact, avoiding a failure mode where the user loses the modeling context after a conflict or filesystem error.

After a successful write, `src/views/ontology-edit/ui/RelationPostSaveHandoff.tsx` keeps a compact saved-relation handoff on the canvas instead of leaving only a transient toast. It repeats the exact `source.key -> target` edge, tells the user to inspect the saved edge in Topology Path mode and endpoints in Focus mode, links to those exact destinations with explicit `Source topology focus` / `Target topology focus` labels, and exposes the same post-change sync-gate copy action so the next Claude Code / Codex run can verify graph health without reconstructing the relation from memory.

The handoff also copies a saved-edge proof packet with the Topology Path URL, endpoint Focus URLs, focused source-node Insights URL, CLI `relation-check` / `path` / bounded `all-paths --plan` commands, matching MCP `query_ontology(relation_check)` / `path` / `query_plan(all_paths)` / `all_paths` calls, the `all_paths` evidence contract, a structural containment replay section for `pattern_walk` / `project_map`, the `14 checks` dogfood graph DB runtime gate, and the shared post-change sync gate. That makes the post-save state as portable as the pre-save review packet: the next agent can prove what was written, not only run a generic health check.

The panel is treated as the active write decision surface. It is modal to assistive technology, sits above the mobile bottom navigation, stays within the viewport, and keeps the copy / cancel / save actions in a sticky footer so long preflight, scope, or graph-effect evidence cannot hide the final decision controls.