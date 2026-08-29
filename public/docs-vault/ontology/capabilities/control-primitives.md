---
uid: f8f39986-79c1-4dc4-9e7a-ae40dc609f17
slug: capabilities/control-primitives
kind: capability
title: Control & Form Primitives
display_ko: 컨트롤·폼 프리미티브
display_en: Control & Form Primitives
domain: domains/design-system
elements: []
path: src/shared/ui/control-class.ts
created_by: "agent:unknown"
---

# Control & Form Primitives

A component layer that prevents screen creators from manually writing className. Values are
provided by `controlClass()`/`fieldClass()` (cva), and behavior (default type · forced access names ·
error wiring · keyboard contracts) is handled by the components.

## User Outcomes
- Controls with the same meaning do not appear in different sizes/colors across screens.
- Nameless inputs, selections whose exclusivity is not reflected in the accessibility tree, and checkboxes without focus rings
  are structurally prevented from being created.

## Layer Structure
- **Value layer** `control-class.ts`: 8 shapes (chip·icon·row·pill·card·link·tile·segment)
  × size × tone 9 levels, `fieldClass`(frame 2 × size 4 × multiline) · `fieldLabel`
- **Behavior layer**: `Button`·`Chip`·`IconButton`·`RowButton`·`Select`·`Input`/`Textarea`·
  `Checkbox`·`SegmentedControl`·`Dialog`·`Surface`·`EmptyState`·`TabBar`·`Tooltip`·`Toast`

## Extraction Boundary
**Mixed.** This barrel (`src/shared/ui/index.ts`) contains both generic components and **Atlas domain components
standing together.** Domain components (atlas-bound) must not be moved: they are visual vocabulary for typed ontology
facts:

- `LastEditSubjectRow`: `"agent" | "human"` union. Embedded within this component.
- `EvidenceOnlyBadge`: Draws the kind boundary between authoring nodes and evidence-only derived concepts.
- `MtimeConflictBadge`: Optimistic concurrency contract for `patch_concept`'s `expected_mtime`.
- `NodeExplanationEdit`: "The node's body is its own explanation."
- `TopologyV2KindGlyph` · `BrandMark` · `ChromeTile` · `ChromeChip` ·
  `SimilarNodeWarning` · `RouteLoadingFallback`

Additionally, the source 8 files are tightly coupled to `next-intl` / `@/i18n` / `sonner`, so moving them as-is will break in other projects (the portability slice on 2026-08-15 decouples this).

Good news: `shared/ui` has **never** referenced the upper layers: the FSD boundary is actually enforced, so dependency direction is already portable.

## Gates
`control-class.contract.test.ts` (combinatorial exhaustive testing) · `control-adoption-ratchet` (hand control 0 termination declaration) · `field-class.contract.test.ts` · `field-adoption-ratchet` ·
`checkbox-target-size` · `dialog-adoption-ratchet` · `touch-floor-layer`
