---
uid: ae7f757a-28b0-4192-ba2c-cc40846a3814
slug: elements/project-selector
kind: element
title: Project Selector
display_ko: 프로젝트 선택기
domain: domains/project-portfolio
path: src/views/project-selector
created_by: "agent:unknown"
---

Project selection/list page.

## Evidence

- Primary implementation: `src/views/project-selector/ui/ProjectSelectorPage.tsx#ProjectSelectorPage`
- Supporting implementation: `src/views/project-selector/lib/use-vault-docs.ts#useVaultDocs`
- Focused test: `src/views/project-selector/ui/ProjectSelectorPage.test.tsx#renders a compact project row without graph metrics or activity`
- Focused test: `src/views/project-selector/ui/ProjectSelectorPage.test.tsx#links the card footer to the project detail and topology pages`

## Includes

- The `/projects` page: compact rows with a linked name, explicitly authored one-line description, recent update, detail action, and map action.
- Resolving project documents by their frontmatter slug and preserving neutral fallback copy when a description is missing.

## Excludes

- Project composition and construction details, owned by elements/project-detail.
- Project creation/editing, owned by elements/project-editor.
- The hub rail's project shortcuts on the map, owned by elements/topology-controls.
