---
uid: 413941f6-04a0-4439-bd8d-268f6ec754c9
slug: elements/project-editor
kind: element
title: Project Editor
display_ko: 프로젝트 편집기
domain: domains/project-portfolio
path: src/views/project-editor
created_by: "agent:unknown"
---

Project editing page. Implementation evidence for capabilities/project-edit.

## Evidence

- Primary implementation: `src/views/project-editor/ui/ProjectEditorPage.tsx#normalizeReturnTo`

## Includes

- The `/project/new` and `/project/[slug]/edit` form page for creating and editing project frontmatter.
- Normalizing the `returnTo` navigation target back to a safe `/projects` or `/project/` path.

## Excludes

- The project list and card rendering, owned by elements/project-selector.
- Project data mutations themselves, performed through `@/features/project-data-source`, not this page.
- The read-only project drawer preview, owned by elements/project-drawer.
