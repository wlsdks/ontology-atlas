---
id: ef7bf713-f24f-4762-ba7d-220b336039d9
date: 2026-09-14
---
## 2026-09-14 — Shared document tabs connect the selected section to its content

**Why**: Owner screenshots of Library, Harness, and Insights showed that a consistent underline did not make the labels recognizable as tabs; 28px gaps also made one tablist read as separate headings.
**Prior**: Overturn the underline-only state marker introduced with the 2026-07-18 Ratio System and documented in the 2026-09-05 tab-strip contract. Retain its single shared primitive, engraved count hierarchy, horizontal overflow fade, active-tab reveal, keyboard model, and coarse-pointer floor. The earlier large outer segmented pill remains rejected.
**Decision**: Seven `TabBar` consumers — six document-section surfaces and the agent inbox's three panel categories — use compact adjacent tab targets on one flat content boundary. The selected tab has a neutral raised surface, bounded top and sides, chip-step rounded top corners, and a 2px indigo top cue; inactive tabs use secondary ink and an explicit hover surface. Other tablist roles do not inherit this styling by role alone.
**Dissent**: The underline-only strip is visually quieter and slightly narrower. The large segmented control groups choices more strongly, but floats as a separate control inside a page header rather than connecting a chosen document tab to its content.
**Falsifier**: Reopen if people still mistake the labels for headings, the selected tab appears detached from its panel, compact adjacency causes target ambiguity, the seven consumers need incompatible panel syntax, or a narrow/coarse-pointer strip loses full active-tab visibility or 44px targets.
**Owner**: The requesting project owner selected the connected document-tab direction; Codex implements the shared primitive and root verifies the rendered native surfaces.
