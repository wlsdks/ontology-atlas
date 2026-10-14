---
uid: 9f646ea6-3c5b-4a3f-acad-fda7e9351af3
slug: capabilities/project-source-binding
kind: capability
title: Project source binding
display_en: Project source binding
display_ko: 프로젝트 소스 연결
domain: domains/code-evidence
elements: [elements/source-inspection-probe, elements/source-receipt-store, elements/source-remedy-map, elements/source-root-discovery, elements/source-witness-claims]
path: mcp/src/tools/project-source.mjs
created_by: "agent:claude-code"
relation_notes: { elements/source-inspection-probe: "You asked me to turn imports I actually witnessed into dependencies: the scan shows tools/project-source.mjs importing project-source-inspection.mjs.", elements/source-witness-claims: "You asked me to turn imports I actually witnessed into dependencies: the scan shows tools/project-source.mjs importing project-source-witnesses.mjs.", elements/source-receipt-store: "You asked me to turn imports I actually witnessed into dependencies: the scan shows tools/project-source.mjs importing project-source-receipt.mjs.", elements/source-remedy-map: "You asked me to turn imports I actually witnessed into dependencies: the scan shows tools/project-source.mjs importing project-source-remedy.mjs.", elements/source-root-discovery: "You asked me to turn imports I actually witnessed into dependencies: the scan shows tools/project-source.mjs importing project-source-discovery.mjs.", capabilities/vault-graph-query: "You asked me to turn imports I actually witnessed into dependencies: the scan shows tools/project-source.mjs importing tools/graph.mjs for the project scope it measures against.", capabilities/vault-validation: "You asked me to turn imports I actually witnessed into dependencies: the scan shows tools/project-source.mjs importing tools/validate-vault.mjs, so binding runs the vault check.", elements/vault-file-store: "You asked me to turn imports I actually witnessed into dependencies: the scan shows tools/project-source.mjs importing vault/documents.mjs." }
dependencies: [capabilities/vault-graph-query, capabilities/vault-validation, elements/source-inspection-probe, elements/source-receipt-store, elements/source-remedy-map, elements/source-root-discovery, elements/source-witness-claims, elements/vault-file-store]
---

Binds a project node to the local code folder it describes, and measures how many of the vault's declared file claims actually land in that folder, so a recorded meaning can be rechecked against real code later.

## Includes
- Connecting, re-measuring, and disconnecting the folder a project speaks about.
- A missing-path repair in the map opens the exact current concept and safe relative path. Stale, duplicate, missing or foreign targets require remeasurement; copied repair handoffs exclude the absolute source root (`src/views/home/model/project-source-repair.ts`, `src/shared/lib/project-source/project-source-receipt.ts`).
- A receipt of how many declared paths resolved, written without the absolute folder path leaving the machine.

## Evidence
- `mcp/src/tools/project-source.mjs` writes a source binding only after confirmation and refuses unsafe or malformed sidecars.
- `src/shared/lib/project-source/project-source-receipt.ts` compares the recorded graph hash, source identity, fingerprint and revision with the current observation.

## Excludes
- Copying, importing, or mirroring the code into the vault; only the binding is recorded.
- Deciding what the bound code means.

## Uncertainty
- Observed in the installed macOS app on 2026-10-14: opening this vault, reading its project and remeasuring the bound code changed the source state from stale to current; the MCP handoff then reported 124 of 124 declared witnesses supported. This dated result does not stay current after later code or ontology changes.
- In that same handoff, the project meaning assessment remained unconfirmed after its document changed. Source path support does not certify competency answers or accept product meaning.
- Partial folder moves, denied filesystem access, Windows and large-repository behavior were not exercised in this observation.