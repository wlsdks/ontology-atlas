---
slug: capabilities/builder-relation-write-confirm
kind: capability
title: Builder Relation Write Confirm
domain: views
elements: [builder-relation-proposal, builder-relation-write-confirm-panel]
---

`/ontology/edit` does not write a vault↔vault edge immediately after a drag. It opens a confirmation step that explains the inferred relation key and the reason for that inference, lets the user choose an alternate frontmatter key, and breaks the write scope into the file path, changed markdown files, unchanged markdown files, frontmatter key, graph meaning, and mutation before touching disk.

The confirmation uses the same schema-level graph vocabulary as the vault and MCP server. It can save `domains`, `capabilities`, `elements`, `dependencies`, `contains`, `describes`, or `relates`, so a project-to-domain drag becomes project frontmatter `domains` instead of a vague semantic `relates` edge.

Existing `depends_on` entries created by CLI/MCP flows are treated as the same dependency relation during confirmation preflight. That prevents the builder from offering a duplicate relation just because the dependency arrived through the public agent-facing name.

If the user confirms a dependency write on a source file that already has `depends_on`, the builder merges those refs into `dependencies` and clears `depends_on` in the same frontmatter patch. This keeps the editor from splitting one dependency relation across two graph keys after a mixed UI/agent workflow.

Relation writes are source-file mutations: dragging `source -> target` appends the target slug to the selected frontmatter key in `source.md`; `target.md` is named as unchanged so the user does not assume both vault documents will be patched.

The panel now also names the graph effect separately from the file mutation: `source --relation--> target`, the relation label that topology/path/impact/MCP will read from the source frontmatter key, plus the surfaces that will read it (`topology`, `path`, `impact`, and MCP). It also provides post-save handoff links into `/topology` Path mode for the source/target pair and Focus mode for each endpoint, so the user can visually inspect the saved edge before running the graph sync gate. If the user picks a relation key different from the inferred one, the panel warns that the alternate key should be saved only when it is the clearer graph meaning.

The confirmation also runs a relation preflight against the current manifest. Exact duplicates block saving, and the direct MCP write payload is copyable only when preflight is `safe_to_add`; the broader review packet stays copyable but replaces the write tool call with a blocked-by-preflight note for duplicate, inverse, or existing-path decisions. Inverse edges are surfaced for direction review, same-direction direct edges under another key are treated as an existing path, and already-connected node pairs show the existing path so the user adds a direct edge only when it carries clearer ontology meaning. The panel exposes the preflight evidence as three visible rows — exact edge, inverse edge, existing path — before the save action, making the write decision auditable even when the high-level decision is `safe_to_add` or `review_path`.

The same review shows and can copy the matching `oh-my-ontology relation-check ... [vault]` command, the MCP `add_relation` args (`from`, `to`, `type`), the exact `add_relation` tool-call payload, a bounded `all-paths --plan` traversal-completeness check, the `all_paths` evidence contract fields to report, post-save topology handoff URLs, and the shared post-save sync gate (`health`, `cycles`, `growth`, `maintenance`, `validate`) as both CLI commands and a reusable MCP/CLI packet, so Claude Code, Codex, PR notes, or a teammate can inspect the intended graph mutation before it becomes source of truth and verify the graph immediately after it lands. The panel now also has a save decision checklist that separates selected-key review, preflight result, bounded traversal evidence, and post-save sync gate status into visible `ready` / `review` / `blocked` / `required` badges. The same checklist is embedded in the portable packet, so a teammate or agent can see whether the relation is ready to save, needs semantic review, or is blocked by an exact duplicate without reconstructing the UI state. The `all_paths` follow-up is part of the pre-save packet because one existing path is only a prompt to review, not proof that the graph relation is fully explained.

The confirm panel now stays open if the underlying vault write fails, including conflict or filesystem errors. A successful write or a duplicate no-op closes it, but a failed write keeps the inferred key, selected alternative, write scope, preflight evidence, and sync-gate copy actions visible so the user or agent can repair the problem without reconstructing the relation context.

This keeps builder edits aligned with the MCP/CLI relation-check mental model: frontmatter is the graph, but every graph mutation should be understandable before it becomes source of truth.
