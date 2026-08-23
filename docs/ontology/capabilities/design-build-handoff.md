---
uid: f0289ebb-4f66-4e62-8ed6-456524e4922a
slug: capabilities/design-build-handoff
kind: capability
title: Design Build Handoff
display_ko: 조립 순서 핸드오프
display_en: Design Build Handoff
domain: domains/design-system
elements: []
path: .claude/skills/design-build/SKILL.md
created_by: "agent:unknown"
---

# Design Build Handoff

The **first guide** an agent reads when starting to build a screen. "From command to screen, in the same order": it prescribes which component to pick, where to get values from, and what to measure after building everything, in sequence.

## User Outcomes
- The agent does not assemble things differently each time.
- You can see **which gate catches** a spec violation in the same document.

## Why this is core to this system
Diagnosis from the 2026-08-03 census: *"What was blocking progress wasn't model preference, but the lack of reusable components and unrecorded task order."* Components were prepared in three rounds by 2026-08-15; what remains is this guide.

## Known Defects (measured 2026-08-15, under repair)
Negative results in assembly tests: five new components approved on the same day (`Input` · `Textarea` · `Checkbox` · `SegmentedControl` · `Select`) were **not listed** in this guide's routing table. Agents following instructions strictly either hit a "shape not found in those eight → stop and recount" error or use raw `<input>` elements when building forms.

**When approving components, update the guide simultaneously**: Do not rely on humans to remember the pair; make it a gate (attach to `design-spec-census`, so if the spec file exports a new component but the guide doesn't know its name, it fails).

## Extraction Boundary
**extractable.** Line 211 contains only three app-specific terms, so they can be translated as-is. However, since the gate names referenced in this document follow the boundaries of `design-gate-ratchets` (atlas-bound), the extraction should read "enable after bootstrap" instead.

## Copy Contract
`.claude/skills/design-build/SKILL.md` ↔ `.agents/skills/design-build/SKILL.md`
Both sets must be byte-identical (`skill-copy` in `pnpm agents:check`). Do not create a third copy.
