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
relation_notes: { elements/source-inspection-probe: "You asked me to turn imports I actually witnessed into dependencies: the scan shows tools/project-source.mjs importing project-source-inspection.mjs.", elements/source-witness-claims: "You asked me to turn imports I actually witnessed into dependencies: the scan shows tools/project-source.mjs importing project-source-witnesses.mjs.", elements/source-receipt-store: "You asked me to turn imports I actually witnessed into dependencies: the scan shows tools/project-source.mjs importing project-source-receipt.mjs.", elements/source-remedy-map: "You asked me to turn imports I actually witnessed into dependencies: the scan shows tools/project-source.mjs importing project-source-remedy.mjs.", elements/source-root-discovery: "You asked me to turn imports I actually witnessed into dependencies: the scan shows tools/project-source.mjs importing project-source-discovery.mjs.", capabilities/vault-graph-query: "You asked me to turn imports I actually witnessed into dependencies: the scan shows tools/project-source.mjs importing tools/graph.mjs for the project scope it measures against.", capabilities/vault-validation: "You asked me to turn imports I actually witnessed into dependencies: the scan shows tools/project-source.mjs importing tools/validate-vault.mjs, so binding runs the vault check.", elements/vault-file-store: "You asked me to turn imports I actually witnessed into dependencies: the scan shows tools/project-source.mjs importing vault.mjs." }
dependencies: [capabilities/vault-graph-query, capabilities/vault-validation, elements/source-inspection-probe, elements/source-receipt-store, elements/source-remedy-map, elements/source-root-discovery, elements/source-witness-claims, elements/vault-file-store]
---

Binds a project node to the local code folder it describes, and measures how many of the vault's declared file claims actually land in that folder, so a recorded meaning can be rechecked against real code later.

## Includes
- Connecting, re-measuring, and disconnecting the folder a project speaks about.
- A receipt of how many declared paths resolved, written without the absolute folder path leaving the machine.

## Excludes
- Copying, importing, or mirroring the code into the vault; only the binding is recorded.
- Deciding what the bound code means.

## Uncertainty
- Understood from the tool's own description and from `mcp/src/tools/project-source.mjs` by name; the several `project-source-*` modules beside it were listed but not read, so how the measurement handles a partly-moved folder is unknown here.