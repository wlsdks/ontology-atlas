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

- Primary implementation: `src/views/project-selector/lib/project-card-facts.ts#buildProjectCardFacts`
- Supporting implementation: `src/views/project-selector/lib/use-vault-docs.ts#useVaultDocs`
- Focused test: `src/views/project-selector/ui/ProjectSelectorPage.test.tsx#renders a full-width project card with fact strip and domain composition row`
- Focused test: `src/views/project-selector/ui/ProjectSelectorPage.test.tsx#links the card footer to the project detail and topology pages`

## Includes

- The `/projects` page: full-width project cards with fact-strip counts (domain/capability/element/document/relation) and domain composition rows.
- Building per-project card facts (`buildProjectCardFacts`) and linking each card footer to its detail and topology pages.

## Excludes

- The project detail page itself, owned by elements/project-detail.
- Project creation/editing, owned by elements/project-editor.
- The hub rail's project shortcuts on the map, owned by elements/topology-controls.
