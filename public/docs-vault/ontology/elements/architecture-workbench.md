---
uid: 39f620c5-b115-41a7-be34-e544c7587074
slug: elements/architecture-workbench
kind: element
title: Architecture Workbench
display_en: Architecture Workbench
display_ko: ìí¤íì² ìí¬ë²¤ì¹
domain: domains/codebase-architecture
path: src/views/architecture
created_by: "agent:unknown"
---

## Definition
The human-readable Living Blueprint surface at `/architecture`: it keeps implementation roles primary, lets a developer move through Understand, Plan, and Verify, and produces a copyable agent handoff grounded in the reviewed profile. Each role band is a boxed layer container that lists its occupants: the source modules the role's globs actually contain, from a read-only directory walk of the bound project source in the installed app, with a derived per-band count, a bounded card preview, and derived stat tiles in the Understand rail. Where a persisted conformance receipt exists, each role box also carries a one-line ledger of what its own outgoing edges did and how many imports leave it; it never states a per-role verdict, because `conforms` / `violated` / `unknown` is a fact about the whole profile and stays on the stage chip (2026-08-30). At workbench width (`xl` and above) the surface is one non-scrolling row: the canvas holds the height and everything else opens beside it as a dock (an inspector answering about one chosen role, and a stage dock carrying the profile's rule sentences and the mark legend), and the two docks are exclusive, because both open leave a 1512 canvas narrower than the drawing needs (2026-08-30). Below `xl` it remains the stacked, scrolling document. A role box prints the profile's own reviewed `summary_<role>` sentence in the line the module and concept counts used to hold, keeping those counts only where the profile declares no summary; hovering a role borrows the focus a click gives it without changing the selection, and every traffic stroke touching the focused role states its measured count while stroke width stays a comparison and never a figure. It differs from the profile-contract element because it judges and communicates typed architecture facts but does not itself scan source imports.

## Evidence
- `src/views/architecture`: responsive workbench, profile selection, role blueprint with source-module cards, evidence, and handoff states
- `src/views/architecture/model/source-modules.ts`: the read-only glob-to-directory walk; excludes filter with the shared MCP glob dialect
- `src/entities/architecture-profile/model/architecture-occupants.ts`: `matchesArchitecturePath`, mirroring the MCP's `matchesPathPattern`, guarded by `tests/contract/architecture-profile.contract.test.ts`
- `app/[locale]/architecture/page.tsx`: locale-prefixed static route
- `src/widgets/app-nav-rail` and `src/widgets/bottom-tab-bar`: first-class desktop and mobile navigation
- `src/views/architecture/model/role-ledger.ts`: groups the receipt's violations and observed edges by the role they leave, and returns no ledger at all when there is no receipt
- `src/views/architecture/ui/ArchitectureSketch.tsx`: the canvas: the spine at rest, skips revealed by focus, and violated crossings drawn in the receipt's danger tone, dashed so they read without colour
- `src/views/architecture/ui/ArchitectureRules.tsx`: every declared rule as a sentence and a key for every mark, painted in the dock rather than under the canvas or inside an `sr-only` box
- `src/entities/architecture-profile/model/architecture-profile.ts`: parses `summary_<role>`, the reviewed sentence a role box prints
- `tests/e2e/architecture-workbench.spec.ts`: mobile stage-change re-anchoring and handoff reachability
- `tests/e2e/architecture-role-ledger.spec.ts`: the ledger sentence stays inside its box and the whole chain stays above the fold, measured per locale and viewport

## Boundary
The workbench is not an ontology map, and its bands never show ontology concepts: the ontology is the meaning layer and stays on the map, while architecture is the source layer (owner decision, 2026-08-27). The band walk lists directories only; it must never open files or read imports (the profile must not become a second source of observed imports). A browser cannot list a source folder, and the surface states that impossibility instead of rendering it as emptiness. A source-backed conformance receipt comes from `inspect_architecture`, and the UI never fabricates a current green status. A role box without a receipt behind it shows no ledger rather than a row of zeros, and no box ever says "unmeasured": unmapped and unruled edges carry no role. The canvas at rest draws the spine, under either dependency policy, and holds skips back until a role is focused, so the dock's sentences, not the drawing, carry every declared rule; only a counted violation overrides that and is drawn at rest. Under `lower-only` the spine is the whole permitted drawing: the six adjacent pairs are drawn and the fifteen skips are not, because each skip means "everything below me", which the column order already carries, while only a stroke makes that order a chain (2026-08-30). What may not wait for a click stays on the canvas: the receipt's verdict pill and stamp, and the name of the pattern being drawn.

## Confidence
high (0.9): static export, responsive measurement, accessibility/contrast gates cover the shipped surface; the directory walk is unit-tested against an in-memory tree and shares its glob dialect with the MCP by contract test; the docked, non-scrolling workbench layout is measured by e2e per viewport, while the installed-app listing path and the rest-state readability of the canvas both await a walkthrough
