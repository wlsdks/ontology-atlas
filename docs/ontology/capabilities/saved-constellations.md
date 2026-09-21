---
uid: a54818d1-169d-44f8-ae36-7d5ced88ae9c
slug: capabilities/saved-constellations
kind: capability
title: Saved constellations
display_en: Saved constellations
display_ko: 저장된 별자리
domain: domains/human-workbench
elements: []
path: src/features/saved-constellations/model/use-saved-constellations.ts
created_by: "agent:claude-code"
---

Saves a named slice of the graph as a working scope a person can reopen later, so the set of nodes a task was about survives the session that assembled it.

## Includes
- Naming, storing, and reopening a chosen set of nodes as one scope.
- The same saved scopes being readable from the agent surface, not only in the app.

## Excludes
- Changing what the nodes in a scope mean; a constellation is a selection, not a claim.
- Sharing a scope with anyone else; it stays in the person's folder.

## Uncertainty
- Read from the feature's file layout and from the two read tools the agent surface advertises for constellations. The storage format and the draft-membership model were not opened, and no constellation exists in this vault to inspect.