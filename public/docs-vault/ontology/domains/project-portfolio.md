---
uid: f63e231d-819b-4bf8-a7b7-e715f629efcb
slug: domains/project-portfolio
kind: domain
title: Project Portfolio Management
display_ko: 프로젝트 포트폴리오 관리
display_en: Project Portfolio Management
capabilities: [capabilities/construction-review, capabilities/project-edit, capabilities/project-quick-edit, capabilities/project-share, capabilities/project-source-evidence]
elements: [elements/project, elements/project-detail, elements/project-drawer, elements/project-editor, elements/project-selector]
created_by: human
relation_notes: { capabilities/construction-review: Project portfolio owns the human review surface because construction qualification is judged in the matching project detail., capabilities/project-edit: "The form is where a project's main fields are validated and saved, and it seats a new or recategorized project inside its category boundary without overlap.", capabilities/project-quick-edit: "Name, description, owner, and tags can be corrected in the detail dialog without leaving for the full editor.", capabilities/project-share: "Handing a project to someone means copying a detail address that already carries the current locale and base path, with no permission, expiry, or server behind it.", capabilities/project-source-evidence: "One project node binds to one repository or folder, and the receipt compares the implementation paths its ontology declares against the source that actually exists.", elements/project: The project data model carries the integrity checks and dependency-cycle detection that every project surface reads., elements/project-detail: "The /project/[slug] page is where one project's description, composition, connections, and qualification envelope are read together.", elements/project-drawer: "The slide-in drawer gives one project's metadata, integrity issues, and related documents without leaving the current screen.", elements/project-editor: The /project/new and edit pages are where project frontmatter is actually created and changed., elements/project-selector: "The /projects page lists each project as a card with its counts and domain composition, which is how several projects in one vault get compared." }
---

## Definition
A management area within a single vault that lists, views, edits, and shares multiple project nodes.

## Evidence
- AGENTS.md: Project overview (project→domain→capability→element reading spine,
  multi-project containment)
- src/features/project-edit, project-quick-edit, project-share (implementation evidence)

## Inclusions / Exclusions
- Inclusions: Project detail/editor/selector, quick edit, share link
- Exclusions: The meaning of the domains/capabilities contained within a project (that belongs to each respective domain)

## Confidence
medium (0.7): AGENTS.md evidence is indirect; relies mainly on folder evidence. Re-review recommended.
