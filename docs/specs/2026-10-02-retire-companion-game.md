---
title: Retire the companion game and related record screens
doc_type: spec
status: draft
area: map
date: 2026-10-02
decisions: [e9cdf138-ef07-4464-b76c-293599c611d3]
---

# Retire the companion game and related record screens

## Person and moment

The owner showed the pixel workshop with a fox, HP/XP, inventory, skills, map,
journal and learning controls, and asked to remove the feature added for fun.
The owner then explicitly chose removal of the game and all related screens,
while existing personal/game save data must not be automatically deleted.
The October 2, 19:02:18 owner screenshot was inspected; this is observed intent
and a pictured current surface, not a measured comprehension or speed problem.

The outcome is **orient**: first-run and Map entry offer the existing ways to
open a folder and inspect its real documents without an optional game branch.
Existing users lose game play and in-product access to its personal journal,
reflections and learning notes. Their previously persisted bytes remain on the
device, but this release supplies no replacement viewer or export feature.

## Today

Source baseline: `43f339b26`. Primary code and owner documents were inspected.

- `CompanionHome` is exported from `src/features/agent-activity/index.ts:3` and
  mounted in `FirstRunPage.tsx:199` and `:201` under
  `src/views/first-run/ui/`, and `src/views/home/ui/TopologyCommandChrome.tsx:652`.
  The first-run variants and compact Map trigger open the same game dialog.
- `src/features/agent-activity/ui/CompanionHome.tsx:38` reads the personal journal;
  `:45` derives project-scoped growth while open. Its dialog lazy-loads
  `CompanionGrowth`, whose keyboard panels include inventory, skills, map,
  journal, quests, creature guide, blessings and learning.
- Persisted localStorage identities are the journal key
  `ontology-atlas:companion-journal:v1`, and project-prefixed
  `ontology-atlas:companion-growth:v1:`, `ontology-atlas:companion-game:v1:` and
  `ontology-atlas:companion-sector:v1:`. Their source owners are
  `model/companion-journal.ts:2`, `companion-growth.ts:4`, `companion-game.ts:11`
  and `companion-sector.ts:11` under `src/features/agent-activity/`.
- Truthful work animation currently mounts inside the compact game trigger
  (`CompanionHome.tsx:68`). `AgentMascotPresence.tsx:24` independently limits it
  to verified read/completion events. The existing status/inbox is separately
  rendered by `TopologyCommandChrome.tsx:653`. Removing the game entry without
  retaining this status-only presentation would remove unrelated behavior.
- `src/shared/ui/brand-waiting-mark.tsx:60` independently uses
  `/brand/mascot-walk-row.png`. Shared waiting/agent artwork is not game-only
  merely because it depicts a mascot.
- [Current feature documentation](../features/map/companion.md) and
  `docs/ARCHITECTURE.md:775` describe the shipped game. The full
  `docs/ontology/capabilities/companion-memories.md` body assigns game play,
  reflections and learning here while excluding canonical writes and meaning
  acceptance. These current descriptions must follow the retirement.

The owner explicitly overturns the game/personal-screen choices in the
September 22 personal-home decision (`5b3db4ad`), September 24 idle-adventure
(`380caa89`), world-runs (`b4915dd7`) and catalog (`ad6bf9ae`) decisions,
September 25 quests (`8a0a7959`) and learning-folios (`bd2dc234`) decisions, and
September 26 direct-sector decision (`d8a30a0d`). All seven actual records and
their falsifiers were read. Their protections against source loss, false meaning
acceptance and unrelated toolbar changes remain. Their historical records stay
immutable; retirement is not evidence that their enjoyment hypotheses failed.

## Problem and alternatives

The owner is removing an optional product branch, not asking for a smaller or
hidden game. Its personal-data UI is part of that branch. Preserving a journal
screen would contradict the explicit scope choice.

Rank: (1) fully retire the requested branch and protect stored/canonical data;
(2) keep folder entry, document inspection and truthful work status intact;
(3) continue the separately requested system optimization using measured evidence.

| Option | Value and usability | Cost, feasibility and local-first fit | Decision |
|---|---|---|---|
| Hide the entry but keep the game | Removes a visible distraction | Leaves dormant code, assets and accidental entry paths | Reject: incomplete retirement |
| Remove play but retain a personal journal | Keeps old in-product access | Requires a separate maintained product surface | Reject: owner selected all related screens |
| Remove the branch and leave stored bytes untouched | Matches the selected scope and restores direct entry | Requires ownership-based cleanup and entry verification; no migration | Select |

The first slice is complete retirement: entries, world, automatic battles,
direct sector, progression, equipment, quests, source/learning panels, personal
record screens, game persistence readers/writers, game-only help/shortcuts,
styles, messages, assets and tests. Remove exports and aliases that serve only
that branch. Remove only proven unused assets; preserve shared consumers.

Retain ordinary Map/Library/Insights and document/source inspection, agent
requests and approval controls, activity/inbox status, and its verified mascot.
Place the status-only mascot in the existing activity/status lane without a
clickable game door, a new control or a new idle animation. This is continuity
of existing work feedback, not a replacement companion feature.

The dogfood ontology has a concrete final representation: reclassify the existing
`capabilities/companion-memories` node to the existing `document` kind, retaining
UID `442d74e4-ea20-4229-8fe3-2b8a98743aa4`, its slug/file and recorded history.
Its title becomes `Companion game and personal records history`; its body clearly
frames the retained behavior/evidence as historical and records this retirement
and saved-byte boundary. Remove its capability-only `domain`, `elements` and
live implementation `path` fields. Remove only `capabilities/companion-memories`
from `domains/human-workbench.capabilities` and the matching `relation_notes`
entry. The domain must no longer advertise it as an active capability. The host
performs this through ontology-sync and verifies UID/type/body and backlinks;
there is no new retired kind, canonical node deletion or personal-data migration.

## Flow

1. When the person opens Atlas without an active folder, the existing folder
   actions appear. No game/home card or replacement personal-record card appears.
2. When the person opens a valid folder, the existing Map or Library destination
   and its ordinary document controls work. The Map utility lane has no game door.
3. When the person inspects a concept, relation or wiki page, Atlas uses its
   existing workbench. Former game shortcuts cannot open a hidden game, intercept
   document input or trigger a game-related agent request.
4. When a real agent operation is observed, the current status/inbox and verified
   mascot feedback remain available in their existing lane. Missing or failed
   evidence does not become a success signal; normal approval remains separate.
5. When an old save exists, including invalid JSON or a foreign project scope,
   the retired feature does not read, rewrite, migrate, export or delete it.
   The person reaches the same core entry without a storage prompt or game error.
6. When a folder cannot be opened or evidence is missing, existing errors and
   recovery actions remain. Atlas does not substitute fictional progress for
   missing documents, agent evidence or accepted meaning.

## States

| State | Web | macOS app |
|---|---|---|
| First run | `firstRun.openTitle`; choose a folder using existing supported access | Same key/action through the native picker |
| Known folders | `vaultSwitch.choose.title` and `choose.openAction`; choose a folder | Same keys; choose a folder |
| Folder missing or unreadable | Existing `vaultSwitch.missing.body`/folder-access state; choose or regrant | Existing `firstRun.errorPathMissing`/`errorPermission`; choose or regrant |
| Loaded Map/Library | Out of scope — existing core controls/copy; inspect real documents | Out of scope — same; no game trigger |
| Observed agent work | Out of scope — preserve existing web availability, status and evidence boundaries | Out of scope — preserve existing activity/inbox and verified mascot feedback |
| Old personal/game save | Out of scope — no reader or replacement UI; existing folder controls | Out of scope — same; saved bytes remain untouched |
| Empty or largest measured vault | Out of scope — existing empty/document states; no game or rewards | Out of scope — same; no new scale claim |

## Copy

None — no new or changed user-facing copy is required. Remove game-only
catalogue entries after proving no retained consumer uses them. Retain existing
core entry/error strings and agent-status namespaces. Do not add a retirement
banner, export prompt or new journal label.

## Edge cases

- First run, zero nodes and a wiki-only folder keep existing entry routing. One
  concept is the minimum inspection fixture; record the largest fixture actually
  tested instead of claiming a supported size from a source census.
- Old journal, growth, game and sector saves may be valid, malformed, large or
  scoped to a removed project. None is loaded or changed by this retirement;
  absence does not cause a fresh save to be created.
- Hangul folder names and document input remain usable; removed game letters,
  arrows, Space and Escape do not steal focus or typing from retained controls.
- Moved/renamed/unreadable folders use existing access recovery. Concurrent edits
  retain currentness and approval checks; retirement makes no canonical writes.
- Offline entry remains local. No network connection or game migration is needed.
- Reduced motion and inactive/hidden documents retain shared behavior. No removed
  game timer, animation loop, storage subscription or catch-up remains active.
- The next launched updated bundle contains the retirement. An older already-open
  application is not retroactively changed; capture the verified bundle identity.

## Out of scope

- Deleting saved data, storage-wide cleanup, exporting or migrating personal
  records: the owner explicitly retains stored bytes without a replacement UI.
- Deleting canonical ontology/wiki documents or changing their content to remove
  personal-looking text: filename or vocabulary is not deletion authority.
- Removing the agent workbench, truthful status, inbox, shared mascot/waiting
  assets, Map toolbar, or ordinary learning through documents: separate owners.
- Adding routes, replacement experiences or model/prompt changes: not required
  for retirement. Existing route identities remain.
- Editing frozen decisions or claiming measured speed, RSS, comprehension or
  product-quality gains without a corresponding measurement.

## Acceptance criteria

1. **Given** the new build at first-run/known-folder entry and loaded Map,
   **when** the person opens a fixture folder and inspects a real document,
   **then** both native and web retain the existing path and no game entry or
   related record screen is reachable. Host captures affected states with Codex
   Computer Use and performs the routed design audit; relevant entry tests pass.
2. **Given** normal keyboard/focus use at those entries, **when** typing and using
   retained shortcuts, **then** no removed game listener, dialog, focus trap or
   game-related agent dispatch fires. Test relevant entry interactions and actual
   native/web affected states, including Hangul input and Escape.
3. **Given** fixture values for all four retired storage identities, including
   malformed and foreign-project data, **when** entry, folder selection and Map
   use occur, **then** no game-owned read/write/delete occurs and bytes remain
   identical. With no saves, none is created. Use isolated storage spies and
   before/after fixture readback; never clear the person's real storage.
4. **Given** verified read/completion, failed and missing agent evidence,
   **when** the status lane updates, **then** existing activity/inbox behavior and
   truthful mascot remain, with no game button, duplicate feed or new idle loop.
   Check activity/mascot regression tests and affected-state native proof; preserve
   `BrandWaitingMark` and every independently used asset.
5. **Given** the complete removal diff, **when** import/alias, event, asset and
   output inventories are checked, **then** no game-only implementation, export,
   shortcut, persistence hook, style, catalogue or bundled asset remains orphaned
   or reachable. Remove game-only tests/baselines; keep meaningful retirement and
   retained-consumer checks. Record deleted source/test/asset counts and bytes,
   and comparable before/after production output sizes; report their exact scope.
6. **Given** existing canonical fixture files and permission checks, **when** the
   updated app runs, **then** those files remain byte-identical until an ordinary
   authorized edit. Current feature/architecture docs describe retirement. After
   the separate authorized ontology-sync, the retained node has kind `document`,
   the same UID/slug, historical body and no capability-only fields; the domain's
   active capability link and matching rationale are absent. Read back the node
   and backlinks to prove this without canonical deletion or personal-save edits.
   Frozen records remain immutable; the new decision records owner authorization,
   retained dissent and a falsifier.
7. **Given** the final change, **when** `pnpm checks:changed -- --run` and every
   recommendation finish, **then** source, bundle and relevant interaction checks
   pass. Report measured code/asset/output reduction separately from unmeasured
   startup, memory and comprehension effects; land only after required native/web
   proof identifies the tested build.

## Risks

1. Broad game/mascot deletion removes live status or shared artwork. Trace actual
   imports/assets and prove both verified status and waiting indicators afterward.
2. Cleanup silently erases or rewrites old records. Remove feature access instead
   of adding a migration; prove zero retired-key access and unchanged fixture bytes.
3. Hiding leaves a dormant game or breaks core entry geometry/focus. Inventory
   production output and test real first-run/Map entry, keyboard and document use.

## Later

1. Resume MCP context, wiki loading/schema, algorithm and failure-recovery audits
   after retirement; prioritize newly observed defects, not another game surface.
2. Revisit personal-data export only after a separate explicit request; retained
   bytes do not imply a promised replacement product or automatic future migration.

## Owner question

None — full game/related-screen removal and saved-byte preservation are explicit.
The host records the new retirement decision after routed review; no additional
approval is required for the selected scope.
