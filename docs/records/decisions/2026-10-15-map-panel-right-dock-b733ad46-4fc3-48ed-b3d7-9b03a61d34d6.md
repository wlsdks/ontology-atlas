---
id: b733ad46-4fc3-48ed-b3d7-9b03a61d34d6
date: 2026-10-15
---
## 2026-10-15 — The selected concept's panel docks at the map's right inset

**Why**: `docs/DESIGN-SYSTEM.md` said the compact panel "anchors near the node", while the shipped surface has docked at the right inset for months (`data-position-contract="selected-inspector-aligns-to-right-inset"` in `src/views/home/ui/TopologyInspectorSurfaces.tsx`) and `pnpm decisions:find` returned no record for either. The code is the fact; the sentence and the contract now say the same thing.
**Prior**: `.claude/rules/forbidden.md` (dont:node-click-fullscreen-modal) stands: a click opens ego focus plus a compact panel, never a full-screen modal, and full detail stays an explicit action inside it. This record narrows only the clause "beside the node" / "anchors near the node" to the right inset.
**Decision**: The compact panel docks at the map's right inset and the camera keeps the selected mark clear of it. Reasons: the reading position is stable from one selection to the next, so the eye does not hunt for the panel; and a panel beside the node covers the neighbours the ego focus just lit.
**Dissent**: A panel beside the node keeps the selected mark and its facts in one glance and shortens the eye's travel on a 1920 px screen; answered by the camera framing that keeps the mark in view, which a floating panel would have to re-solve on every pan.
**Falsifier**: A walkthrough where a reader loses the selected node after the panel opens (looks for it, or asks which node the panel describes) at 1920×1080 or 1440×900.
**Owner**: Project owner, via the M5 map-detail brief of 2026-10-15.
