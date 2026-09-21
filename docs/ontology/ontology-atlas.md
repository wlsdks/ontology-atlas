---
uid: 465072fe-a912-4968-91ac-dba3004f8f82
slug: ontology-atlas
kind: project
title: Ontology Atlas
display_en: Ontology Atlas
display_ko: 온톨로지 아틀라스
domains: [domains/agent-access, domains/code-evidence, domains/human-workbench, domains/meaning-layer]
capabilities: []
elements: []
created_by: "agent:claude-code"
relation_notes: { domains/meaning-layer: You asked which domains this product has; you approved the meaning layer as one of the four., domains/code-evidence: You asked which domains this product has; you approved code evidence as one of the four., domains/human-workbench: You asked which domains this product has; you approved the human workbench as one of the four., domains/agent-access: You asked which domains this product has; you approved agent access as one of the four. }
---

Ontology Atlas is a local-first workbench that keeps one reviewable Markdown record of what this codebase builds, why it has its current boundaries, and what a change would affect, shared by the people who own the system and the AI agents that change its code.

## Includes
- The meaning record lives as Markdown in the person's own folder, with Git as its history, so a change to meaning is inspectable as an ordinary diff.
- Four delivery surfaces over one codebase and one build: the desktop app, the CLI, the MCP server, and the static website.
- Human judgment as the final authority over what a recorded meaning says; an agent may propose, a person decides.

## Excludes
- A general-purpose ontology editor for knowledge unrelated to a codebase.
- A structural code index or search tool; structural health is not accepted meaning.
- Any backend, login, account, or hosted store holding the person's meaning.

## Uncertainty
- Built from `README.md`, `AGENTS.md`, `docs/PRODUCT-DIRECTION.md`, `docs/ARCHITECTURE.md` and section 0 of `docs/FEATURES.md`, plus a file-level reading of all four domains. `docs/ontology` was deliberately not read; the rest of `docs/FEATURES.md` was scanned by heading only.
- Nothing in this map was run, rendered, or tested. Every node describes code that was read (usually its header and its import receipts, not its full body), and several of the largest modules were identified only from their headers and their edges.
- The `src-tauri/` native layer was never opened. Where a capability depends on it, that dependence is described from the web-side bridge rather than from the native code.

## Competency answers

### scope: answered

What product/system outcome and user problem define the ontology scope?

A person who delegates a change to an AI agent needs to know what the agent understood, what changed, and what is still uncertain, without rebuilding the whole system in their head or taking the agent's own summary as proof. Atlas exists so that understanding is written down once, in files they can read and correct, and survives into the next task.

- Concepts: `ontology-atlas`
- Evidence: `docs/PRODUCT-DIRECTION.md`, `AGENTS.md`

### domains: answered

Which stable business responsibilities or decision boundaries form its domains?

Four boundaries, split by who the meaning is for and what proves it rather than by folder: the meaning layer owns the record and its format, code evidence owns the link back to the source that proves it, the human workbench owns inspection and judgment, and agent access owns the interfaces agents use as formal users. Reading all four at file level did not move any boundary, but it did move one capability between them.

- Concepts: `domains/meaning-layer`, `domains/code-evidence`, `domains/human-workbench`, `domains/agent-access`
- Relations: `ontology-atlas` --domains--> `domains/meaning-layer`, `ontology-atlas` --domains--> `domains/code-evidence`, `ontology-atlas` --domains--> `domains/human-workbench`, `ontology-atlas` --domains--> `domains/agent-access`
- Evidence: `AGENTS.md`, `docs/FEATURES.md`

### abilities: answered

Which observable abilities realize those outcomes inside each domain?

Twenty-nine abilities, each with one entry point a reader can open. The meaning layer holds six: it compiles and queries the record, guards and validates writes, tells writers how to build well, absorbs an existing instruction document, and carries a second cited-prose page format. Code evidence holds seven: it scans structure, infers imports, binds a project to its folder, reports drift, checks reviewed architecture, gates bulk construction behind an independent evaluator, and keeps every past run readable. The workbench holds nine: it maps the graph, diagnoses it, holds a proposed change for decision, turns sources into cited pages and answers questions from them, shows the folder's history, chooses which folder is open, saves a named scope, moves part of the graph between folders, and shows what an agent is doing. Agent access holds seven: the tool server, the terminal, the task brief, connector setup, an external coding agent hosted in the app, Atlas's own conversation over the vault, and a check that the agent runtime works.

- Concepts: `capabilities/vault-graph-query`, `capabilities/meaning-write-safety`, `capabilities/vault-validation`, `capabilities/construction-guidance`, `capabilities/document-absorption`, `capabilities/wiki-pages`, `capabilities/repo-structure-analysis`, `capabilities/import-dependency-inference`, `capabilities/project-source-binding`, `capabilities/evidence-drift-detection`, `capabilities/architecture-conformance`, `capabilities/construction-qualification-gate`, `capabilities/analysis-archive`, `capabilities/ontology-map`, `capabilities/ontology-insights`, `capabilities/meaning-write-review`, `capabilities/library-workspace`, `capabilities/vault-git-history`, `capabilities/vault-folder-session`, `capabilities/saved-constellations`, `capabilities/graph-block-exchange`, `capabilities/agent-work-visibility`, `capabilities/mcp-tool-server`, `capabilities/cli-commands`, `capabilities/task-agent-brief`, `capabilities/agent-connector-setup`, `capabilities/in-app-coding-agent`, `capabilities/vault-conversation-agent`, `capabilities/agent-environment-doctor`
- Relations: `domains/meaning-layer` --capabilities--> `capabilities/vault-graph-query`, `domains/code-evidence` --capabilities--> `capabilities/repo-structure-analysis`, `domains/human-workbench` --capabilities--> `capabilities/ontology-map`, `domains/agent-access` --capabilities--> `capabilities/mcp-tool-server`
- Evidence: `AGENTS.md`, `docs/FEATURES.md`

### evidence: answered

Which source artifacts provide implementation evidence for each ability?

Every one of the twenty-nine abilities names a single file as its entry point, and all of them resolve inside the bound code folder. No ability rests on a folder alone, because a folder cannot be checked for drift. Beneath them the four domains record fifty-six implementation roles, each naming its own file, so eighty-five distinct source files are now cited by this map.

- Concepts: `capabilities/vault-graph-query`, `capabilities/meaning-write-safety`, `capabilities/vault-validation`, `capabilities/construction-guidance`, `capabilities/document-absorption`, `capabilities/wiki-pages`, `capabilities/repo-structure-analysis`, `capabilities/import-dependency-inference`, `capabilities/project-source-binding`, `capabilities/evidence-drift-detection`, `capabilities/architecture-conformance`, `capabilities/construction-qualification-gate`, `capabilities/analysis-archive`, `capabilities/ontology-map`, `capabilities/ontology-insights`, `capabilities/meaning-write-review`, `capabilities/library-workspace`, `capabilities/vault-git-history`, `capabilities/vault-folder-session`, `capabilities/saved-constellations`, `capabilities/graph-block-exchange`, `capabilities/agent-work-visibility`, `capabilities/mcp-tool-server`, `capabilities/cli-commands`, `capabilities/task-agent-brief`, `capabilities/agent-connector-setup`, `capabilities/in-app-coding-agent`, `capabilities/vault-conversation-agent`, `capabilities/agent-environment-doctor`
- Evidence: `AGENTS.md`, `docs/FEATURES.md`
- Paths: `mcp/src/tools/graph.mjs`, `mcp/src/write-consent.mjs`, `mcp/src/validate.mjs`, `mcp/src/construction-rules.mjs`, `mcp/src/absorb.mjs`, `mcp/src/wiki-schema.mjs`, `mcp/src/analyze/repo-structure.mjs`, `mcp/src/infer-imports.mjs`, `mcp/src/tools/project-source.mjs`, `mcp/src/detect-drift.mjs`, `mcp/src/architecture-profile.mjs`, `mcp/src/construction-lifecycle.mjs`, `mcp/src/analysis-records.mjs`, `src/widgets/ontology-map/index.ts`, `src/views/ontology-insights/ui/OntologyInsightsPage.tsx`, `src/features/ontology-change-review/index.ts`, `src/views/library/ui/LibraryPage.tsx`, `src/views/git/index.ts`, `src/features/vault-switch/index.ts`, `src/features/saved-constellations/model/use-saved-constellations.ts`, `src/features/ontology-blocks/model/merge-plan.ts`, `src/features/agent-activity/model/use-agent-activity-feed.ts`, `mcp/src/server/registry.mjs`, `cli/src/lib/cli-commands.mjs`, `mcp/src/agent-brief-compact.mjs`, `src/features/mcp-connectors/index.ts`, `src/features/acp-session/model/use-acp-session.ts`, `src/features/vault-agent/model/agent-loop.ts`, `src/features/acp-doctor/model/acp-doctor.ts`

### impact: partial

Which typed dependencies explain change impact across the model?

Eighty-five dependencies are declared, and seventy-three of them were read out of source imports rather than inferred from names, covering all four domains. The tool server is the hub: it reaches the schema, the file store, the graph engine, the validator, the import scanner, the construction rules, the task brief and the qualification evaluator, so a change there is felt almost everywhere. Beneath it the file store rests on the parser and the schema; the analyzer rests on six readers; the source binding rests on its probe, witnesses, receipt store and remedy map; one frame loop carries the whole map; and the library workspace rests on the wiki page contract the meaning layer owns. Reading the code corrected three first-pass claims: the graph query entry point was mis-cited, drift detection does not depend on source binding because that module imports nothing, and the library is an authoring loop rather than a document shelf.

- Concepts: `capabilities/mcp-tool-server`, `capabilities/task-agent-brief`, `capabilities/vault-validation`, `elements/vault-file-store`, `elements/graph-engine`, `capabilities/ontology-map`, `elements/map-frame-loop`, `capabilities/library-workspace`, `capabilities/wiki-pages`, `capabilities/repo-structure-analysis`, `capabilities/construction-qualification-gate`, `capabilities/project-source-binding`
- Relations: `capabilities/mcp-tool-server` --depends_on--> `capabilities/task-agent-brief`, `capabilities/mcp-tool-server` --depends_on--> `elements/graph-engine`, `capabilities/ontology-map` --depends_on--> `elements/map-frame-loop`, `capabilities/library-workspace` --depends_on--> `capabilities/wiki-pages`, `capabilities/repo-structure-analysis` --depends_on--> `capabilities/construction-qualification-gate`, `capabilities/project-source-binding` --depends_on--> `capabilities/vault-validation`
- Evidence: `mcp/src/server/registry.mjs`, `src/widgets/ontology-map/ui/use-topology-loop.ts`
- Gap: every dependency here is a static import read from source, which is navigation and not proof of runtime behaviour; nothing was executed. Twelve capabilities still carry no implementation roles, the native `src-tauri/` layer contributes no edges at all, and the 1,261 module edges the scanner measured have never been reconciled against these declarations.
