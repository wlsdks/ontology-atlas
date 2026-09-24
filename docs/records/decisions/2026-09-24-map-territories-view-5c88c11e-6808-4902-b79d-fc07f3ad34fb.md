---
id: 5c88c11e-6808-4902-b79d-fc07f3ad34fb
date: 2026-09-24
---
## 2026-09-24 — Territories joins the map picker as a flat view with nothing folded

**Why**: on the flat map a reader learns what a domain holds only by expanding it, one domain at a time, and nothing on it says which capabilities stand on code that changed after their document. At the scale of a real vault (the dogfood vault: 4 domains, 31 capabilities) both answers fit on one screen, and the expansion step is what hides them.
**Prior**: keeps 2026-09-10 "The galaxy is a view you pick, not an altitude you reach" (one picker answers how the map looks) and the 2026-09-02 cone tree unchanged; Flat stays the default and is not replaced. Evidence states come from the rule the analysis brief already uses (`shared/lib/evidence-verdict.mjs`), not a map-only rule.
**Decision**: owner-selected (2026-09-24) to add Territories as one more flat view, after Flat, following the owner's concept spec "A v2": every capability named on shelves fanning from its domain's mark, domains in weighted sectors around the project, no hulls; disc size is element count and elements appear only on selection; the ring is current, stale or unknown, with the web saying unknown; rolled-up domain-to-domain dependency strokes carry counts; selection reuses the flat map's inspector. Deterministic, pan-only (fixed label scale), `?view=territories` in the address, and a discs-only dense mode past seven shelves or ten domains.
**Dissent**: the concept spec fits larger vaults by zooming the camera to about 0.8; this keeps the fixed label scale, so a vault that does not fit the room is panned instead, and at 1280x800 the dogfood vault already overflows under the INDEX panel and the legend.
**Falsifier**: shown a still of the overview for five seconds, a reader cannot say which domain a named capability belongs to, or which capabilities are stale.
**Owner**: Stark
