---
uid: 6b2e10a4-b30f-405a-a02f-90ccc4d471a0
slug: capabilities/project-quick-edit
kind: capability
title: Project Quick Edit Dialog
display_ko: 프로젝트 빠른 편집
domain: domains/project-portfolio
elements: []
path: src/features/project-quick-edit
created_by: "agent:unknown"
---

## Definition
The ability to modify, apply, or revert name, description, owner,
and tags in the right-side dialog of the project details without navigating to the full editor.

## Inclusion / Exclusion
- Included: Four fields in the editable detail view, required name validation, apply/revert actions, success/failure states.
- Excluded: read-only/static modes, category/status/timeline/relationship editing, persistence integration guarantees.

## Evidence
- `src/features/project-quick-edit/ui/ProjectQuickEditPanel.tsx`: dialog, four fields,
  patch payload and state handling
- `src/views/project-detail/ui/ProjectDetailPage.tsx`: `canEdit` render gate
- `src/views/project-detail/ui/ProjectDetailPage.test.tsx`: verification of editability and panel exposure

## Confidence
medium: Implementation and caller gate are verified, but dedicated integration tests including actual vault records are unconfirmed.
