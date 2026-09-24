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
- Existing entries open a centered world with movement, interactive furniture, and in-world inventory, skills, map, and journal panels. Only the nearest camp object receives the contextual E action; the portal opens departure. I, K, M, J, L, and N open inventory, skills, map, journal, quests, and creature guide; Escape closes the panel before the game. Long content turns pages rather than growing the game frame. A camp constellation visualizes recorded construction categories; its E interaction opens the growth ledger.
- Current project records yield starting construction XP. Unique concepts, resolved relations, recorded implementation paths, listed wiki pages, and bounded word-count detail contribute to per-category high-water marks. Manifest updates add newly observed growth; cleanup does not remove saved progress. Code work counts when reflected in these records, not through inferred coding hours.
- Construction, one-time UID-based concept reading, and personal discovery XP contribute to character power and region access. Adventure XP is separate. Levels grant points for six permanent skills. Five-floor expeditions offer one temporary blessing choice per floor, drawn as three alternatives from eight types, with a final guardian, active dodge, optional auto retry, and persistent best-floor/clear records. Run-bound choice validation rejects stale offers. Battles earn equipment gold, potions, supply chests, and guardian relics.

## Adventure catalog

- Six fictional regions contain 36 distinct scene destinations, with route-specific rosters, guardians, difficulty, and reward or threat conditions. Their game IDs are separate from canonical ontology UIDs. Construction and reading unlock them; combat XP alone does not.
- 108 original species, including 18 guardians, share six disclosed combat trait families: armor, fierce attacks, regeneration, siphon, double strikes, and wave resistance. The field guide records observed sightings and defeats, while maps retain individual completion counts.
- Legacy saves default to empty catalog records without inventing discovery. A removed domain destination returns to camp, retaining accumulated progress. Final-guardian clear rewards are banked once even when returning during the loot display.

## Quests, personal equipment, and path planning

- Twelve one-time quests reward currently observable project construction, wiki, reading, reflection, and optional verified ACP writes with guardian relics. Current counts and uniquely resolved targets govern claims; historical high-water marks alone are insufficient. Learned, corrected, and uncertain reflections count equally. Claimed history retains rewards after later correction or deletion, while links use the original identity or show unavailable.
- Optional ACP quests count unique current concept targets from same-root, fully correlated allowed/completed creation or body-update receipts. Pending, failed, rejected, foreign, legacy, ambiguous, missing-target, destructive, and approval-only records cannot grant rewards. Missing retained history is unavailable evidence, not proof that work never happened. Explicit assistance previews hand the displayed request to the existing workbench only when a live receiver acknowledges it; existing write and meaning-review gates remain intact.
- Sword, cloak, and spellbook enhance with guaranteed success and exact gold/material previews. Limits of +5/+10/+15/+20 require zero/two/four/six claims. Nine non-ACP quests can open every tier. Existing higher gear remains earned; only future enhancement can be gated. Every five levels adds a personal attack, max-HP, or wave bonus. Claims, materials, and unlocks save atomically before feedback.
- Expedition M plans the next floor as rest, supply, or elite. Disclosed healing and risk/reward effects apply once at the floor boundary and never change the current encounter. The preference persists across retries; bounded applied history resets per run. A fixed progress control remains accessible when the camera moves.

## Persistence and motion contract

- Project-UID-scoped device-local saves, deterministic automatic combat, and at most four hours of once-consumed away progress. Catch-up uses previously saved power before applying new project observations. Receipts follow successful persistence; failures preserve the prior save.
- The original journal retains up to 50 personal memories and keepsakes without conversion into XP. Drafts survive panel changes and closing. Resets are explicit; resetting adventure retains construction high-water marks.
- Closed games have no simulation or movement loop. Hidden documents suspend updates; a recovered camp performs no periodic writes. Walking frames follow traveled distance with a shared foot contact line. Reduced motion updates live and suppresses ambient and sprite animation while retaining direct controls. The map toolbar and verified agent-work mascot remain separately owned.

## Excludes
- Direct canonical writes by the game, automatic agent requests, accepted meaning, semantic quality scores, code-defect detection by monsters, approval-only rewards, cloud accounts, and claims that previewing an excerpt proves understanding.
- Direct Git-commit, coding-time, or LLM-authorship measurement. An implementation-path record does not establish that the source exists or is correct.

## Evidence
- `src/features/agent-activity/ui/CompanionHome.tsx` owns existing entries and preserved drafts; `CompanionGrowth.tsx` owns the persistent world and keyboard panels.
- `CompanionWorld.tsx`, `CompanionInventory.tsx`, `CompanionMap.tsx`, `CompanionBestiary.tsx`, and `CompanionProjectBook.tsx` implement movement, gameplay controls, and visible reward attribution.
- `src/features/agent-activity/model/companion-construction.ts`, `companion-growth.ts`, and `companion-game.ts` own observed project counters, reading records, and deterministic combat. Their hooks persist only device-local game data.
- Focused model and hook tests plus `tests/e2e/companion-growth.spec.ts` and `companion-home.spec.ts` verify reward deduplication, storage failure, keyboard scope, responsive panels, and preserved personal memories.

- `companion-quests.ts`, `companion-forge.ts`, and `companion-paths.ts` own current evidence, enhancement tiers, and floor effects; `CompanionQuests.tsx`, `CompanionForge.tsx`, and `CompanionJourney.tsx` render the corresponding choices. `tests/e2e/companion-progression.spec.ts` probes claims, ACP exclusions/handoff, tier reachability, and panel geometry.

## Uncertainty
- Owner intent authorizes the mini-game. Enjoyment, repeat value, and improved understanding remain unmeasured. Record counts, game completion, and passing tests do not qualify ontology meaning.
