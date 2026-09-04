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

## Includes

- Rendering the vault git status, snapshot summary, and expandable history entries (hash, timestamp, changed concepts).
- Grouping and formatting diffs and change kinds for display, including the copy-to-clipboard affordance.
- Driving the `/git` destination body (elements/git composes this panel as its content).

## Excludes

- The actual git operations (diff, fetch, pull, init, snapshot): those come from the shared `atlas-git-changes`/`atlas-git-record` libraries and the MCP git tools, not this panel.
- The rail badge showing uncommitted-change count, owned by elements/app-nav-rail.
- Ontology change review or write approval, owned by elements/ontology-change-review.
