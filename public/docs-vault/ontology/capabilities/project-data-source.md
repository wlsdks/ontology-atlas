---
uid: 0563e7ee-3818-4bbd-97fa-4035ad43a03d
slug: capabilities/project-data-source
kind: capability
title: Project Data Access
domain: domains/local-vault-management
elements: [elements/project]
path: src/features/project-data-source
created_by: "agent:unknown"
---

## Definition
Data access boundary that reads project lists and bodies from a selected local vault or static sample, providing
project create/update partial-update/delete permissions in local mode only.

## Included / Excluded
- Included: Manifest list derivation, slug-based body lazy read, local/static branching, local CRUD gate.
- Excluded: Single active project selection state, ontology relationship determination, static sample writing.

## Basis
- `src/features/project-data-source/model/use-projects.ts`: Local/static list branching.
- `src/features/project-data-source/model/use-project-body.ts`: Static asset or local
  file handle body reading.
- `src/features/project-data-source/model/use-project-mutations.ts`: CRUD and static write blocking.
- `src/features/project-data-source/model/use-project-mutations.test.ts`: Path/key preservation,
  rename, duplication, UUID, deletion verification.
- `src/views/project-detail/ui/ProjectDetailPage.test.tsx`: Body fallback priority verification.

## Confidence
medium: Implementation/mutation tests and consumer tests exist, but direct integration verification of list/body hooks is limited.
