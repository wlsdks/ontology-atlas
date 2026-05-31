---
status: DESIGN — awaiting user review (big-IA, surface-first per charter #9)
created: 2026-05-31
owner: user (jinan) — greenlit "Staging/draft 기본" (Track B B2/B3, 2026-05-31)
pillar: 3 (human design surface / 설계도)
relates: docs/superpowers/specs/2026-05-31-atlas-vision-roadmap.md (Track A #9)
---

# Staging / Draft Canvas — design SPEC

> User vision: "사람도 회의할때 atlas 보면서 온톨로지를 **추가도 해보고 임시저장도 하고 삭제도** 해보고
> 다양하게 — atlas 는 온톨로지 **설계도**." Decision (2026-05-31): **Staging/draft 기본**.
> This is the mandated design-first step before building (big-IA). **Build does NOT start until the
> user reviews/approves this design.**

## Problem (verified in code)

The builder (`/ontology/edit`, `src/views/ontology-edit/`) has TWO inconsistent write models:
- **New palette nodes** → staged in-memory (`use-ephemeral-nodes.ts` / `use-ephemeral-edges.ts`), saved one-by-one.
- **Every edit to an EXISTING vault node** → **immediate disk write**: `renameVaultDoc`, `editVaultArrayKey`,
  `writeVaultRelation`, `persistVaultPosition`, `deleteVaultDoc` each call `vault.updateFrontmatter` /
  `vault.createDoc` / `vault.deleteDoc` straight away (OntologyEditPage.tsx lines 674, 868, 896, 931, 1053,
  1102, 1123, 1167). The chip editor fires on every chip add/remove.
- **No undo/redo anywhere.** A confirmed delete/relation is an unrecoverable file write (only git outside the app).

So a human cannot freely experiment in a meeting — every keystroke/click mutates the source of truth. That breaks
the "blueprint you sketch on, then commit when agreed" mental model the vision asks for.

## Design — unified staging overlay

### 1. One pending-change store over the whole canvas

A session-scoped store (`src/views/ontology-edit/lib/use-staging-store.ts`, plain React state + reducer) holds
an ordered list of **pending changes**, each a tagged union:
- `addNode` (absorbs the current ephemeral-nodes role) · `editFrontmatter` (rename / array-key chips / domain) ·
  `addRelation` · `removeRelation` · `move` (position) · `deleteNode`.

Every builder mutation, instead of calling `vault.*` immediately, **appends a pending change** (or coalesces with
an existing one for the same target — e.g. repeated position drags collapse to the latest `move`). The canvas
renders **vault state + pending overlay** so the user sees their sketch live.

### 2. Default = staging (per user decision); write-through is a toggle

Default mode stages. A header toggle `직접 쓰기 / Draft` lets a power user opt into immediate-write (today's
behavior) — so the change is non-destructive to existing muscle memory. Mode persists in the existing
preference store.

### 3. Visual deltas — charter border-style ONLY (no glow/scale)

Per `.claude/rules/design.md`: added = **indigo underline**, removed/delete = **dashed**, modified =
indigo left-border tick. Single indigo + signal tones, `transition-colors` only. A pending-count chip in the
header: "N pending — Apply · Discard".

### 4. Apply / Discard — reuse the verified write paths

- **Apply N changes**: a single review dialog (reuse `RelationWriteConfirm` / `BlastRadiusConfirm` as per-row
  previews) → on confirm, replay each pending change through the **existing** `vault.createDoc /
  updateFrontmatter / deleteDoc / rename` fns in dependency order (create nodes before edges referencing them;
  rename rewrites backlinks via the existing redirect path). **expectedMtime conflict guard** is applied per
  change using the staged base mtime → if the vault changed underneath, that row surfaces a conflict (reuse
  `VaultConflictError` vocabulary) and is skipped, the rest apply. Single source of truth preserved — Apply is
  the ONLY writer.
- **Discard**: clear the store. No vault touch.

### 5. Undo / redo — trivial because changes are staged

Cmd/Ctrl-Z pops the last pending change; redo re-pushes. Respect the existing keyboard-scope guard (disabled on
input focus). Because nothing is written until Apply, undo is just store manipulation — no inverse-op replay
against the vault needed (this is why staging makes undo cheap, vs undoing committed writes).

### 6. Persistence — survive reload (local-first)

Persist the pending store to **IndexedDB** (the `idb-kv.ts` helper already exists; today it stores only the vault
handle), keyed by vault fingerprint. A meeting sketch survives refresh/reopen. **Drafts are explicitly NOT the
vault** (local-first.md: IndexedDB = cache/scratch only, never source of truth). On load, if the vault fingerprint
changed since the draft was saved, warn before re-applying the overlay.

## Constraints check

- **local-first**: pure client state + IndexedDB scratch; vault stays sole truth; no backend. ✓
- **design charter**: border-style deltas, single indigo, no glow/scale. ✓
- **FSD**: store in `views/ontology-edit/lib`; write fns already at view layer. ✓
- **single source of truth**: Apply is the only writer, via existing `vault.*` fns + expectedMtime guard. ✓
- **`/ontology/edit` is architecture.md-protected**: this UPDATES the surface (write model), does not remove/restructure routes. Still **surface-first** because it reshapes how humans trust the builder → this review gate.

## Build plan (after approval) — incremental, each gate-passed

1. `use-staging-store` reducer + unit tests (pure: append/coalesce/undo/redo/serialize). *(testable now)*
2. Route builder mutations through the store (staging default) + write-through toggle.
3. Visual deltas (charter border-style) + pending chip.
4. Apply dialog (reuse confirms) + replay through `vault.*` with expectedMtime per row + conflict handling.
5. IndexedDB persistence (fingerprint-keyed) + reload warning.
Each step: TDD + tsc/lint/vitest + playwright console-0 + adversarial gate.

## Open questions for the user

1. **Default staging vs write-through default** — you chose staging-default; confirm the toggle is wanted (vs staging-only).
2. **Apply granularity** — one "Apply all" + per-row review, or also allow applying a subset?
3. **Scope** — start with the builder (`/ontology/edit`) only, or also bring staging to Topology Direct Edit + home inline edit (they share the same `vault.*` write fns)?
