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

Helps a person investigate overlooked code references, source changes, and recorded uncertainties around a selected concept or Concept set by comparing bounded local source evidence with the meaning already recorded in its vault.

## Includes
- Inspecting the selected context in the installed app after the person sees the bound source folder and chooses to read it; the web explains this native boundary (`src/features/gray-area/ui/GrayAreaInspector.tsx:46-98`).
- Presenting observed static imports absent from the dependency graph, source changes behind a recorded dependency, and authored reading gaps as reasons to investigate; each suggestion states the observation, its connection to the selection, what is unknown, and a next read (`src/features/gray-area/model/candidates.ts:48-84`; `src/features/gray-area/ui/GrayAreaInspector.tsx:135-147`).
- Opening captured source lines with their file hash, comparing concepts or following existing recorded paths, and rechecking the source, vault, and binding before evidence actions (`src/features/gray-area/ui/GrayAreaInspector.tsx:119-157`; `src/views/home/model/gray-area/use-topology-gray-area.tsx:71-79`; `src-tauri/src/gray_area.rs:343-381`).
- Showing three suggestions at a time with total and omitted counts, and folding or restoring suggestions only for the current inspection (`src/features/gray-area/model/candidates.ts:87-90`; `src/features/gray-area/ui/GrayAreaInspector.tsx:103-109,159-178`).
- Copying an investigation packet or preparing an editable conversation draft with the observation, recorded meaning, source witnesses, and read limits; the person decides whether to send it (`src/features/gray-area/model/investigation.ts:4-12`; `src/views/home/ui/HomePage.tsx:465-473`).

## Excludes
- Accepting meaning, creating ontology relations, editing source or vault content, or treating a missing graph edge as an established semantic defect.
- Inferring runtime behavior or ranking business risk from imports, source dates, or authored uncertainty.
- A complete repository audit or a claim that zero suggestions establishes completeness or safety.
- Automatically executing an agent investigation or sending evidence to an agent or external service.

## Uncertainty
- Existing prose can already explain a code reference, a source edit need not change meaning, and a recorded gap may be historical; each requires current corroboration before a semantic conclusion.
- The initial context follows up to two recorded dependency hops; import scanning is bounded to that context's implementation-parent folders. Resolver configuration and metadata, and captured source witnesses for candidate endpoints, may be read elsewhere within the connected root under their own limits. Callers outside the scan folders, runtime dispatch, unsupported input, and omitted source ranges remain unmeasured (`src-tauri/src/gray_area.rs:167-194,230-268,283-305`).
- On 2026-09-28, bounded native checks observed fold/restore and config-only stale refusal in a synthetic vault, and one actual Atlas selection scanning 184 files. Final installed checks showed both compared elements on the Flat map and an editable, unsent draft preserving its evidence and edits across runtime changes; clearing it kept it cleared after switching back. These observations cover the exercised paths, not all repositories or runtime behavior.
- Controlled recall, real-human usefulness, and generalization across repositories have not been measured; successful reads, fixture checks, or persistence do not establish semantic qualification.
