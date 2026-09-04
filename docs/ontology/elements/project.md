---
uid: 74fbd403-d9df-4c44-b5c3-958890da21ff
slug: elements/project
kind: element
title: Project (entity)
display_ko: 프로젝트 (엔티티)
domain: domains/project-portfolio
path: src/entities/project
created_by: "agent:unknown"
---

Project node data model entity. Implementation evidence for capabilities/project-data-source.

## Evidence

- Primary implementation: `src/entities/project/model/integrity.ts#getProjectIntegrityIssues`
- Supporting implementation: `src/entities/project/model/relationships.ts#resolveProjectRelationshipKind`
- Focused test: `src/entities/project/lib/detail-href.test.ts#origin + canonical path`
- Focused test: `src/entities/project/model/cycles.test.ts#returns true when the dependency already reaches the project`

## Includes

- The `Project` data model and its integrity checks (missing category/status, missing/duplicate dependency), with silent fallbacks for unclassified/active defaults.
- Resolving relationship kind between projects and detecting dependency cycles.

## Excludes

- Rendering project cards, drawers, or detail pages: those are separate view/widget elements.
- Category and status taxonomy definitions themselves, owned by elements/category and elements/status.
- Construction qualification of a project, owned by elements/construction-qualification-evaluator.
