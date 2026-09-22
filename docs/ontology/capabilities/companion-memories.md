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

A person keeps a short, explicitly authored reflection about something checked, corrected, or still uncertain in the pixel companion’s local home. Each memory can leave an equally available book, plant, or star keepsake.

## Includes
- A compact launch-chooser home and an optional journal beside map work status.
- Up to 50 device-local memories with the current loaded folder name, individual removal, and explicit reset. Failed saves retain drafts; unreadable stored data is not silently replaced.
- One finite response to saving a memory, independent of verified agent read/completion poses.

## Excludes
- Ontology review receipts, accepted meaning, quality scores, automatic growth from agent writes or approvals, streaks, and cloud persistence.
- Automatic verification of the activities described in personal notes.

## Evidence
- `src/features/agent-activity/ui/CompanionHome.tsx` owns the explicit form and chooser/map entry.
- `src/features/agent-activity/model/companion-journal.ts` and `use-companion-journal.ts` own the versioned local personal record.
- Their tests exercise uncertainty, corrupt storage, storage failure, persistence, and a non-evicting limit.

## Uncertainty
- Source and focused tests establish the implemented boundary. Whether the companion encourages useful reflection or feels worth caring for requires owner use; it is not established by animation or journal counts.