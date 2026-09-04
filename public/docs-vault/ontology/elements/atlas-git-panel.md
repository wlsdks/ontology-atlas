---
uid: 2aab69c2-c4c9-4446-bb37-f48457a00fd0
slug: elements/atlas-git-panel
kind: element
title: Atlas Git Panel
display_ko: 아틀라스 기록 패널
domain: domains/local-vault-management
path: src/widgets/atlas-git-panel
created_by: "agent:unknown"
---

Panel widget displaying the vault's git status/snapshot.

## Evidence

- Primary implementation: `src/widgets/atlas-git-panel/ui/AtlasGitPanel.tsx#AtlasGitPanelProps`
- Supporting implementation: `src/widgets/atlas-git-panel/model/build-concept-ego.ts#buildConceptEgo`
- Focused test: `src/widgets/atlas-git-panel/ui/AtlasGitPanel.test.tsx#expands a history item to its full hash + iso time on click`
