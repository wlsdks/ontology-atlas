---
slug: src/widgets/project-ontology-overview
kind: element
title: Project Ontology Overview
domain: views
---

`src/widgets/project-ontology-overview` renders the project-detail ontology summary that links a project back to its ontology nodes.

It now uses the shared ontology kind tone palette for project/domain/capability/element chips, so the project detail surface reinforces the same categorical color contract as the ontology tree and topology map. Color is paired with the localized kind label and count, keeping classification visible even when color alone is insufficient.

This element helps dogfooding because a developer can open a project detail page and immediately see whether the repo's own ontology separates domains, capabilities, and implementation elements clearly enough to guide the next agent action.
