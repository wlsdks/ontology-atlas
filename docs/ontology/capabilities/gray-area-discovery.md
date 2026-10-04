---
uid: 43ba88e7-268c-49f8-adef-d713362b45c2
slug: capabilities/gray-area-discovery
kind: capability
title: Gray Area discovery
display_en: Gray Area discovery
display_ko: 놓친 부분 살펴보기
domain: domains/human-workbench
elements: []
path: src/features/gray-area/ui/GrayAreaInspector.tsx
created_by: "agent:codex-mcp-client"
relates: [capabilities/import-dependency-inference]
relation_notes: { capabilities/import-dependency-inference: "Gray Area reads the existing infer_imports output as bounded evidence for a person's investigation, without promoting an observed import into accepted meaning (src-tauri/src/gray_area.rs:190-206)." }
---

Helps a person investigate overlooked code references, source changes and recorded uncertainties around a selected concept, set or recorded project, then optionally continue that question with ACP and review a separate improvement.

## Includes
- A stable Analysis status entry on the map, including without a selection. One unambiguous recorded project is a scope; ambiguous scopes require selection, and an empty vault offers first construction (`src/views/home/model/gray-area/use-topology-gray-area.tsx`; `src/views/home/ui/TopologyCommandChrome.tsx`).
- Explicit bounded inspection of the connected code folder in the installed app. Source recovery grants source reading separately from vault writing. Oversized or invalid selections offer narrowing rather than repeating an unchanged scan (`src/features/gray-area/ui/GrayAreaInspector.tsx`; `src-tauri/src/source_access.rs`; `src-tauri/src/gray_area.rs`).
- Up to three visible reasons to investigate: static imports missing from the recorded graph, source changes behind a dependency, and authored reading gaps. Each states an observation, relation to the selection, unknowns and a next read; folded suggestions remain session-local (`src/features/gray-area/model/candidates.ts`).

## Continued analysis contract
- Inspectable source witnesses and exact request disclosure, with the bound folder, coding runtime, provider-cost notice and model unknown where not confirmed. Analyze next sends one deliberately chosen question after live source, selection, runtime and permission checks. Busy, stale or withdrawn pending requests do not become delayed sends (`src/features/gray-area/model/investigation.ts`; `src/features/acp-session/model/investigation/guard.ts`; `src/widgets/acp-chat-panel/ui/AcpChatPanel.tsx`).
- Dated saved results associated with the exact project UID, selected/target UIDs, question, originating turn and source/graph/body/witness basis. Historical source freshness remains unchecked until explicit inspection; unrelated or missing provenance earns no matching credit. Recent history lookup exposes its limits (`src/features/gray-area/model/investigation-record.ts`; `src/features/gray-area/model/investigation/use-investigation-history.ts`).
- A separate editable, unsent improvement request that retains the inspected code folder and quotes the prior answer as untrusted evidence. Sending, write permission and meaning review remain separate; a later explicit inspection exposes remaining questions (`src/features/gray-area/ui/investigation/InvestigationResult.tsx`; `src/views/home/ui/HomePage.tsx`).

## Excludes
- Unrequested model runs, automatic writing, implicit write approval or automatic meaning acceptance.
- Treating static imports, source dates, an authored uncertainty, a saved answer or completed agent plan as proof of runtime behavior, semantic completeness or gap resolution.
- A complete repository audit or a claim that zero bounded suggestions establishes correctness or safety.
- Native local-model source construction; its absence remains explicit rather than silently substituting a provider.

## Uncertainty
- Existing prose may already explain a reference; a source edit need not change meaning, and an authored gap may be historical. Current corroboration and review are required.
- Native node/file/read ceilings bound the captured packet only. Ordinary ACP may read more or incur further cost; requested no-write behavior is not an enforced read-only sandbox. Ordinary permission checkpoints remain.
- Association and persistence do not establish semantic truth or qualification. Controlled interaction evidence, source-hidden reuse, source accuracy and general usefulness are separate measurements; broader repositories and real-human usefulness remain unmeasured.
