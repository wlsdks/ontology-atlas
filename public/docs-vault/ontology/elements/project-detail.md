---
uid: 4a94a537-a650-4b6e-b5ab-b2c15fe54ddc
slug: elements/project-detail
kind: element
title: Project Detail
display_ko: 프로젝트 상세
domain: domains/project-portfolio
path: src/views/project-detail
created_by: "agent:unknown"
---

Project detail page. Beyond the project's own description, composition, and connections, it allows users to read the selected construction qualification envelope only for the current session, enabling judgment of current decisions, first blockers, human approvals, and exact plans alongside evidence from the same artifact. Malformed data or project/digest/plan mismatches are closed as failures; post-write maintenance is separated from qualification.

## Evidence

- Primary implementation: `src/views/project-detail/lib/project-detail-tab.ts#parseProjectDetailTab`
- Supporting implementation: `src/views/project-detail/model/project-ontology-metrics.ts#buildProjectOntologyMetrics`
- Focused test: `src/views/project-detail/ui/ProjectDetailPage.test.tsx#shows a sentence-form empty state (not a numeral) when no project is connected`
- Focused test: `src/views/project-detail/ui/ProjectDetailPage.test.tsx#omits the status segment (no stray dash) when the project has no status field`

## Includes

- The `/project/[slug]` detail page: description, composition, connections, and ontology metrics for one project.
- Reading the selected construction qualification envelope for the current session only, surfacing current decisions, first blockers, human approvals, and exact plans beside their evidence.
- Closing malformed data or project/digest/plan mismatches as failures, and keeping post-write maintenance separate from qualification display.

## Excludes

- Actually running or approving a qualification decision: this page reads and displays an existing envelope, it does not evaluate one (elements/construction-qualification-evaluator does).
- The project list/card surface, owned by elements/project-selector.
- Editing project fields, owned by elements/project-editor.
