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

Keeps a named selection of ontology concepts, with its purpose, so a person or agent can return to the same working context. The human-facing name is Concept sets in Map and in Library under Ontology; constellation remains the compatible storage, URL and read-tool vocabulary.

## Includes
- Selecting real concepts on Map, naming the set, storing it in the vault-local library-collections/v1 sidecar, and reopening the whole selection by its unchanged folder ID.
- Immutable member UIDs with lastKnownPath as display context. Library resolves current documents by identity, keeps missing or ambiguous members inspectable, and distinguishes source/Wiki references from ontology members.
- Persistent Concept documents/Concept sets navigation within Ontology, including when no current ontology nodes exist. Legacy tab=collections links become tab=ontology&ontologyView=sets while retaining other parameters and fragments; the document reader's state remains separate.
- Conflict recovery that preserves the edited draft, rereads the latest saved set without writing, and applies only after the explicit action. Recreating a deleted set receives a new ID.
- The same saved scopes being readable through MCP/CLI. Explicit agent preparation does not itself send or authorize a write.

## Excludes
- Changing node meaning or adding a graph relation because two nodes share a set.
- Sharing the set with another person or turning references into ontology membership.
- Creating a second Library storage model. With available concepts, creation opens Map; without them, Start an ontology opens the existing document starter because a documents-only folder redirects Map to Library.

## Evidence
- `src/features/saved-constellations/model/use-saved-constellations.ts` owns captured-vault loading and guarded saves; `src/entities/library-collection/model/library-collection.ts` defines the compatible identities and targets.
- `src/views/library/ui/LibraryConstellations.tsx` resolves and displays sets; `src/app/library-workspace/index.tsx` owns the new location and compatible URL state.
- `tests/e2e/library-workspace.spec.ts` recovers a planted saved set with a missing UID at zero current nodes, preserves URL context and the last unsaved document keystroke, and reaches the real ontology starter. `src/widgets/saved-constellations/ui/SavedConstellationsControl.test.tsx` checks conflict/recreation authority.

## Uncertainty
- Storage, membership and recovery code were read for PR #2059; the installed app's empty-set navigation was exercised on 2026-09-28 and a redirecting zero-node action was corrected. This supersedes the earlier file-layout-only reading.
- The saved-set recovery fixture is synthetic. Existing personal collections, migration histories and semantic usefulness for arbitrary tasks were not exhaustively reviewed; structural recovery does not establish accepted meaning.
