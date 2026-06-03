# Builder Focused Neighborhood Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/ontology/edit` start from a focused relation neighborhood instead of rendering the whole vault graph by default.

**Architecture:** Add a pure selector that derives a small `VaultManifest` containing the focus node plus direct incoming/outgoing relation neighbors. Wire `OntologyEditCanvas` through that selector before `useVaultGraphFlow`, leaving full-manifest data available in the page for anchors, proof packets, and inspector lookup.

**Tech Stack:** TypeScript, React, xyflow, Vitest, Next.js App Router, Tauri desktop smoke.

---

### Task 1: Focused Manifest Selector

**Files:**
- Create: `src/views/ontology-edit/lib/build-focused-builder-manifest.ts`
- Create: `src/views/ontology-edit/lib/build-focused-builder-manifest.test.ts`

- [x] **Step 1: Write failing tests**

Create tests that prove:
- a missing focus returns a central project/domain/capability fallback plus direct neighbors
- direct outgoing relation refs are included
- direct incoming relation refs are included
- unrelated ontology docs are excluded
- non-ontology documents can still be included only when directly related

- [x] **Step 2: Run tests to verify failure**

Run: `pnpm exec vitest run src/views/ontology-edit/lib/build-focused-builder-manifest.test.ts`
Expected: fail because the module does not exist.

- [x] **Step 3: Implement selector**

Implement `buildFocusedBuilderManifest(manifest, focusSlug, options)` and return `{ manifest, focusSlug, isFocused }`.

- [x] **Step 4: Run tests to verify pass**

Run: `pnpm exec vitest run src/views/ontology-edit/lib/build-focused-builder-manifest.test.ts`
Expected: pass.

### Task 2: Canvas Wiring

**Files:**
- Modify: `src/views/ontology-edit/ui/OntologyEditCanvas.tsx`

- [x] **Step 1: Add prop**

Add optional `focused = true` behavior and pass `focusNodeId` into the selector.

- [x] **Step 2: Use focused manifest for `useVaultGraphFlow`**

Use full manifest for live-vault state, but pass focused manifest to the canvas flow builder.

- [x] **Step 3: Preserve explicit focus behavior**

Ensure `FocusNodeOnDemand` and `selectedId` still work when the focus node is present.

### Task 3: Verification

**Files:**
- Existing tests and desktop route smoke.

- [x] **Step 1: Run focused tests**

Run: `pnpm exec vitest run src/views/ontology-edit/lib/build-focused-builder-manifest.test.ts src/views/ontology-edit/lib/use-vault-graph-flow.test.ts`

- [x] **Step 2: Run typecheck**

Run: `pnpm exec tsc --noEmit`

- [x] **Step 3: Run Builder E2E smoke if time allows**

Run: `pnpm exec playwright test tests/e2e/ontology-builder-workflow.spec.ts`
