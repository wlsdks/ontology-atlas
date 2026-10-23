---
id: d170c030-35e9-4a0d-82b4-fcc00683c76b
date: 2026-10-23
---
## 2026-10-23 — Read small Flat maps through domain labels and outward branches

**Why**: the owner could not distinguish the map's hierarchy or hovered domain, rejected the previous redesign, then approved a new in-app preview with compact domain labels and outward capability branches.
**Prior**: supersedes b0962a44-ec5b-40a8-846e-c9f4b5fed354 for readable small Flat maps after its required new preview approval. Keeps its inspector and navigator boundary. Retains 88b537fc-3831-4e9d-823f-0465c90a65a8 for dense maps and f4310914-5d7b-4586-b605-489c6388a921 for selection and camera behavior.
**Decision**: use neutral domain label blocks, typed member marks, undirected membership branches and thin directed dependencies for at most six domains, 24 rows per domain and 48 rows overall. The project becomes a small context label above the drawing. Larger maps keep packed disclosure. Hover changes ink without moving names. Counts, evidence states, selection, drag, zoom and the custom Canvas renderer retain their meaning; no vault data changes.
**Dissent**: a bounded layout creates two density presentations; compact branches cannot name every concept in a large vault at once. The accepted preview does not prove drag performance or usability, and the original stutter report remains unproven until measured on the installed surface.
**Falsifier**: membership or dependency direction differs from the graph, an existing concept becomes unreachable, hover moves names, readable labels overlap at the supported widths, or measured node-drag work regresses against the restored baseline.
**Owner**: project owner, approving the final branch-map preview with “go ahead and implement it”.
