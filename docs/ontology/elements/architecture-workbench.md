---
uid: 39f620c5-b115-41a7-be34-e544c7587074
slug: elements/architecture-workbench
kind: element
title: Architecture Workbench
display_en: Architecture Workbench
display_ko: 아키텍처 워크벤치
domain: domains/codebase-architecture
path: src/views/architecture
created_by: "agent:unknown"
---

## Definition
The human-readable Architecture workbench at `/architecture`. Its default view makes the architecture canvas primary and compresses Human contract → Source observation → Delta into one 44px evidence rail. Pressing that rail opens the full three-part provenance plane over the map without changing canvas geometry; closing it restores the unchanged drawing. The canvas keeps reviewed role intent and measured source evidence visually distinct: on roomy across layouts each role has a contract card and a separate observation slot joined by a delta connector, while constrained layouts keep the role legible with a compact receipt ledger.

Contract, Change, and Verify are workflow views over the same profile. A contextual action opens the existing guarded ACP conversation inside Architecture when a verified runtime, vault path, and bundled MCP launch are ready. The dock claims its width before process startup; a browser or unavailable runtime degrades to a copyable task. With no profile, the same route starts a Draft conversation that inspects paths and imports, stops for human architecture and role names, and writes nothing before approval.

Motion explains state rather than decorating it. Contract roles reveal once, observation marks follow them, the evidence overlay enters from its trigger, and only revision-stamped traffic exposes Replay observed imports. Replay runs once, staggers by role, moves an indigo scan through the observation row, and stops. Live ACP planning / editing / verifying / review-wait state may animate the Source observation rail, but that volatile state is explicitly not an inspection receipt. Reduced motion preserves every label, arrow, status, and final position without travel.

## Evidence
- `src/views/architecture/ui/ArchitectureWorkbench.tsx`: workflow state, compact evidence rail, non-reflowing provenance overlay, role/rules inspector, and contextual agent action
- `src/views/architecture/ui/ArchitectureEvidenceRail.tsx` and `ArchitectureEvidencePlane.tsx`: at-rest summary versus on-demand full provenance
- `src/views/architecture/ui/ArchitectureSketch.tsx`: contract/observation geometry, role focus, edge sentences, receipt ledgers, and finite observation replay
- `src/views/architecture/ui/ArchitectureAgentDock.tsx`: same-route guarded ACP surface with delayed session start and resizable width
- `src/views/architecture/model/architecture-agent.ts`: ready/verified/guarded runtime selection and honest clipboard degradation
- `src/entities/architecture-profile/model/architecture-profile.ts`: reviewed role summaries and evidence-bound Draft / Change / Verify task text
- `app/globals.css`: sub-300ms evidence and role entrance, finite 520ms observation pulse, active-session scan, and reduced-motion equivalents
- `tests/e2e/architecture-workbench.spec.ts` and `tests/e2e/architecture-role-ledger.spec.ts`: reachability, stable URL state, responsive geometry, sentence containment, and overlay non-reflow contracts

## Boundary
The workbench is an implementation-architecture projection, not the ontology map. It may render reviewed profile declarations, a persisted typed receipt, and a live ACP activity projection, but those three authorities never merge: the profile remains intent, the receipt belongs to its recorded revision, and chat remains volatile. The app does not call architecture MCP tools by itself, infer a pattern from folders, approve a proposal, or write a profile before human naming and approval. A browser cannot spawn a local process or enumerate a bound source tree and says so through its fallback. Directional replay exists only when measured traffic exists; missing, stale, unsupported, or unruled evidence does not move as if current.

## Confidence
high (0.96): focused tests and contract gates, 500–1920 live responsive measurements with zero document X overflow, actual-window browser and 1512×949 installed-app captures, zero-profile and reviewed-profile ACP walkthroughs, and a 30fps motion phase strip with no stalls in the moving interval cover the shipped surface
