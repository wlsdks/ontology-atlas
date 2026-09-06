---
uid: 27e7b72d-dfec-405d-b236-3139b59cd68a
slug: domains/design-system
kind: domain
title: "Design System & Enforcement"
display_ko: 디자인 시스템 지키기
display_en: "Design System & Enforcement"
capabilities: [capabilities/control-primitives, capabilities/design-build-handoff, capabilities/design-gate-ratchets, capabilities/design-token-ramps]
elements: [elements/design-proof-router]
created_by: "agent:unknown"
relation_notes: { capabilities/design-token-ramps: "This is the values leg of the domain's four: the fixed ladders every screen must choose from, which is what gives lint something concrete to block any other value against.", capabilities/control-primitives: "This is the components leg: it stops screen authors writing their own className, and it hands the token values themselves back to design-token-ramps, so the two sit beside each other under one owner rather than duplicating a value source.", capabilities/design-gate-ratchets: "This is the enforcement leg and the domain's stated differentiator, gates enforce the spec rather than documentation, which the 2026-08-03 census showed by driving hand-written buttons, links and forms to zero once they were switched on.", capabilities/design-build-handoff: "This is the assembly-order leg: it decides which rendered proof a UI change owes before implementation starts, while judging whether the finished design is good stays outside it.", elements/design-proof-router: "The design system owns the router that turns a UI change class into its required proof, because the proof bundle is how the system enforces its values before a screen ships." }
---

## Definition
The responsibility area that **pre-defines selectable values and components for humans and AI agents when building screens, and automatically fails if they deviate**. It consists of four elements: values (token ramps), components (control primitives), enforcement (lint selectors, contract tests, ratchets), and assembly order (handoff).

The distinguishing point of this domain from others: **gates enforce the spec, not documentation.**
Full-scale measurement on 2026-08-03 provides the evidence: with design system documentation already in place, among 419 generated `<button>` elements, only 1 was overridden by primitives, and there were 50 combinations of single-chip sizes.
After enabling gates, manually written buttons (74), links (67), and forms (63) all became 0.

## Evidence
- `docs/DESIGN-SYSTEM.md`: The authoritative source for values and evidence (token · node specs · control inventory)
- `.claude/rules/design.md`: Table of judgment during work + what is enforced by lint
- `.claude/rules/design-gates.md`: Thought records explaining **why each gate has its shape**
- `docs/DECISIONS.md` 2026-08-15 (1)(2)(3): Approval for Dialog · form behavior layer · SegmentedControl

## Inclusion / Exclusion
- Included: Token ramps and their consumption rules, control/form/modal/select primitives, enforcement via lint/contract/ratchet, assembly order read by agents
- Excluded: Rendering specs for the map (topology) canvas: that belongs to `domains/topology-navigation`; this domain only owns up to the **source of values** used by its surface

## Extraction Boundaries (2026-08-15 PO Council)
The four capabilities of this domain differ in **whether they can be moved to a separate repository**. The "Extraction Boundary" section of each capability node is authoritative; summarized:

| Capability | Boundary |
|---|---|
| control-primitives | **Mixed**: General-purpose components and Atlas domain components (11) are in the same barrel |
| design-token-ramps | **Mixed**: Of 580 unique tokens, 269 (46%) are topology-bound |
| design-gate-ratchets | **atlas-bound**: Ratchets are tied to this repository's census metrics |
| design-build-handoff | **extractable**: Only 3 app-specific terms |

Creation of a separate public repository was **deferred** by the 2026-08-15 PO Council (re-entry condition: one external real request or owner confirmation of publication timing). The purpose of these nodes is to enable calculating boundaries **via graph rather than manually** for that time.

## Extraction Spec: Test A Measurement (2026-08-15)

"Must be perfect" has no stopping condition. So I **changed it to a checklist**: I gave an agent unfamiliar with this repo only the package (tokens + 48 components + guide + gates) and had it build three screen sets (form dialog · settings list · list+empty state).

**Result: It built them.** It independently found and used `Dialog` · `Input` · `Textarea` · `Checkbox` ·
`SegmentedControl` · `Select` · `Button` · `EmptyState`.
However, it did so by **opening 12 `ui/` source files directly** rather than following the guide.

Remaining gaps: This is the list that must be closed before extraction:

| # | Gap | Status |
|---|---|---|
| 1 | Form components (5 types) missing from guide routing table | **Closed**: Added "Receiving Values" section to table + `design-build-primitive-routing` gate |
| 2 | Standard buttons submit within forms (siblings blocked) | **Closed**: Default `type="button"` |
| 3 | Core components read app translations directly (`toast.tsx`) | **Closed**: Prop injection + `design-system-extraction-boundary` gate |
| 4 | Color charter references files no one can open | **Closed**: Self-contained sentence + `docs:links` ghost citation check |
| 5 | **Non-interactive surfaces lack both components and specs**: list rows · badges · section cards · setting rows | Open |
| 6 | No dialog anatomy spec: title unit, footer button order/alignment/size, spacing | Open |
| 7 | `fieldClass` width description is self-contradictory (docstring ↔ variant comment) | Open |
| 8 | `fieldClass`/`fieldLabel`/`CONTROL_DISABLED_CLASS` not in public barrel | Open |
| 9 | No spec for required input indicator (`*`) | Open |
| 10 | Component list shows **different sets** in three places (barrel · guide · inventory) | Partial: Guide↔Components gated |

### Test B: Re-measurement after fixes (same day)

Closed gaps 1–4 and **re-ran the same task**. Delta:

| | Test A | Test B |
|---|---|---|
| Found components independently? | Yes (from source) | Yes (**Guide Sections 1–2 are the actual decision path**) |
| `ui/` sources accessed | 12 | 12 (**No improvement**) |
| Stopped in form? | Guide sent stop signal | No |
| `type="button"` fix needed? | Yes | No (default) |

**The 12 sources remain unchanged. Only the reason changed**: In A, it was "couldn't find components";
in B, it was "**had to reverse-engineer call shapes from types because usage examples are 0**". So
I added a full form page to the guide (gap 11).

And **my fixes created two new contradictions**: I'll write this honestly:

| # | New Gap | Status |
|---|---|---|
| 11 | 0 component usage examples: must reverse-engineer call shapes from types | **Closed**: Added full form to guide |
| 12 | `Checkbox` and `SegmentedControl` both match in tables, causing selection ambiguity (adjustment rules only in source headers) | **Closed**: Moved "What does the label name?" rule to guide |
| 13 | "Width is `className`" sentence causes confusion (says it's a wrapper but instructs `w-full`) | **Closed**: Explained why it works |
| 14 | No dialog footer spec: guessed cancel variant · button order | **Closed**: Documented measured conventions in examples |
| 15 | Dialog title spec **reverse-engineered from eslint messages** | Partial: Examples show it, but no spec section exists |

**The biggest issue is #5.** I audited all 419 controls and locked them into 8 shapes, but the **non-pressable surfaces** that occupy most of the screen area have neither primitives nor spec tables.
Where agents manually picked values in tests was **entirely these areas**: this system's strongest point diverges from where newcomers struggle most.

And one observation on the nature of documentation: *"Documentation overwhelmingly covers "why it became this way" rather than "how to use it.""* Stories of deprecated axes and deleted components are mixed with current specs in the same files, forcing first-time readers to **determine what constitutes living spec each time**. These stories are this system's differentiator, so I won't delete them: **moving them elsewhere** is the remedy.

## Confidence
high (0.9): Full measurement of gates, tokens, and components + decision records from three rounds + one portability test
