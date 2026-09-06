---
uid: b8a4b1ad-616b-4230-b206-9efa6292d217
slug: capabilities/project-edit
kind: capability
title: Project Form Editing
display_ko: 프로젝트 양식 편집
domain: domains/project-portfolio
elements: [elements/project-editor]
path: src/features/project-edit
created_by: "agent:unknown"
relation_notes: { elements/project-editor: "The form's validation, serialization, and placement rules only reach a person through the /project/new and /project/[slug]/edit page, which is where create, update, duplicate, and delete are wired to that form." }
---

## Definition
Form editing capability that validates project main fields to create/update/duplicate/delete, and automatically places
the position considering category boundaries and overlaps when creating a new project or changing categories.

## Included / Excluded
- Included: Form validation/serialization, schedule and taxonomy preservation, create/update/duplicate/delete, automatic placement.
- Excluded: Manual position/containment editing, screenshot upload, MCP/agent write paths.

## Basis
- `src/features/project-edit/ui/ProjectForm.tsx`: Validation/serialization/submit flow.
- `src/features/project-edit/model/schema.ts` and `schema.test.ts`: Field/schedule serialization and
  missing taxonomy preservation.
- `src/features/project-edit/model/placement.ts` and `placement.test.ts`: Category boundaries,
  overlaps, repair placement.
- `src/views/project-editor/ui/ProjectEditorPage.tsx`: Create/update/duplicate/delete connections.

## Confidence
medium: Form/schema/batch-level evidence exists, but actual hook→vault integration E2E is unverified.
