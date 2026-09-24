---
uid: 442d74e4-ea20-4229-8fe3-2b8a98743aa4
slug: capabilities/companion-memories
kind: capability
title: Companion memories
display_ko: 동료의 추억
display_en: Companion memories
domain: domains/human-workbench
elements: []
path: src/features/agent-activity/ui/CompanionHome.tsx
created_by: "agent:unknown"
---

A person develops a project and records its ontology and wiki, then sees those records strengthen an optional device-local fox companion in a playable pixel world.

## Includes
- Existing entries open a centered world with movement, interactive furniture, and in-world inventory, skills, map, and journal panels. E interacts; I, K, M, and J open panels; Escape closes the panel before the game. Long content turns pages rather than growing the game frame. A camp constellation visualizes recorded construction categories; its E interaction opens the growth ledger.
- Current project records yield starting construction XP. Unique concepts, resolved relations, recorded implementation paths, listed wiki pages, and bounded word-count detail contribute to per-category high-water marks. Manifest updates add newly observed growth; cleanup does not remove saved progress. Code work counts when reflected in these records, not through inferred coding hours.
- Construction, one-time UID-based concept reading, and personal discovery XP contribute to character power and region access. Adventure XP is separate. Levels grant points for six permanent skills. Five-floor expeditions offer one temporary blessing choice per floor, drawn as three alternatives from eight types, with a final guardian, active dodge, optional auto retry, and persistent best-floor/clear records. Run-bound choice validation rejects stale offers. Battles earn equipment gold, potions, supply chests, and guardian relics.

## Persistence and motion contract

- Project-UID-scoped device-local saves, deterministic automatic combat, and at most four hours of once-consumed away progress. Catch-up uses previously saved power before applying new project observations. Receipts follow successful persistence; failures preserve the prior save.
- The original journal retains up to 50 personal memories and keepsakes without conversion into XP. Drafts survive panel changes and closing. Resets are explicit; resetting adventure retains construction high-water marks.
- Closed games have no simulation or movement loop. Hidden documents suspend updates; a recovered camp performs no periodic writes. Reduced motion suppresses ambient and sprite animation while retaining direct controls. The map toolbar and verified agent-work mascot remain separately owned.

## Excludes
- Canonical ontology writes, accepted meaning, semantic quality scores, code-defect detection by monsters, approval rewards, provider traffic, cloud accounts, and claims that previewing an excerpt proves understanding.
- Direct Git-commit, coding-time, or LLM-authorship measurement. An implementation-path record does not establish that the source exists or is correct.

## Evidence
- `src/features/agent-activity/ui/CompanionHome.tsx` owns existing entries and preserved drafts; `CompanionGrowth.tsx` owns the persistent world and keyboard panels.
- `CompanionWorld.tsx`, `CompanionInventory.tsx`, `CompanionMap.tsx`, and `CompanionProjectBook.tsx` implement movement, gameplay controls, and visible reward attribution.
- `src/features/agent-activity/model/companion-construction.ts`, `companion-growth.ts`, and `companion-game.ts` own observed project counters, reading records, and deterministic combat. Their hooks persist only device-local game data.
- Focused model and hook tests plus `tests/e2e/companion-growth.spec.ts` and `companion-home.spec.ts` verify reward deduplication, storage failure, keyboard scope, responsive panels, and preserved personal memories.

## Uncertainty
- Owner intent authorizes the mini-game. Enjoyment, repeat value, and improved understanding remain unmeasured. Record counts, game completion, and passing tests do not qualify ontology meaning.
