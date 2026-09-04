---
uid: 207e4118-99da-4d53-bb42-50fea31baa1a
slug: elements/project-drawer
kind: element
title: Project Drawer
display_ko: 프로젝트 서랍
domain: domains/project-portfolio
path: src/widgets/project-drawer
created_by: "agent:unknown"
---

Project drawer panel widget.

## Evidence

- Primary implementation: `src/widgets/project-drawer/ui/ProjectDrawer.tsx#ProjectDrawer`
- Supporting implementation: `src/widgets/project-drawer/lib/detail-preview.ts#getProjectDetailPreview`
- Focused test: `src/widgets/project-drawer/lib/detail-preview.test.ts#returns empty preview for blank detail`
- Focused test: `src/widgets/project-drawer/lib/detail-preview.test.ts#keeps fenced code block lines together`

## Includes

- The slide-in project drawer: metadata grid, integrity issues, relationship kind, related docs, and impact insights for one project.
- Rendering the preview of a project's detail text, including fenced-code-block-aware truncation.

## Excludes

- The full `/project/[slug]` page, owned by elements/project-detail.
- Project creation/editing forms, owned by elements/project-editor.
- Computing project integrity issues themselves, owned by elements/project (entity).
