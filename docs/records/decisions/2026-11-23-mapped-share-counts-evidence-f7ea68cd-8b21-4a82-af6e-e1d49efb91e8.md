---
id: f7ea68cd-8b21-4a82-af6e-e1d49efb91e8
date: 2026-11-23
---
## 2026-11-23 — The share of code on the map counts abilities a node points at, and the project note keeps that count

**Why**: First builds of two large repositories put 6 and 20 percent of surveyed abilities on the map and nothing offered to map the rest. A measure by ratio (one capability per three abilities) read 74 percent where nodes point at the code of 66 percent, and one builder kept no line for the app to show. The owner asked that the number mean what it says.
**Prior**: Extends 2026-11-19 `fbb466df` and `888605dd` (breadth and depth of a first build), which stand; 2026-11-20 `e9800e56` stands: no answer grows.
**Decision**: For a repository surveyed as areas, an ability is on the map only when a capability or element node's `path:` is its file (or a folder strictly below its area that holds it) or the node cites existing lines of that file. Excludes removes code only where it is written as a path. Writes and `validate_vault` give the lines the first project keeps under `## Uncertainty`, led by `Not mapped yet: N of M areas, R of T abilities.`; the app reads only that line. `finalize_project_meaning` refuses, and `validate_vault` warns `not-mapped-line-mismatch`, while the first kept summary line differs from the measure.
**Dissent**: The lead's first design, the ratio: cheaper to satisfy. It lost because a person cannot check it against the map. One cited line still counts every ability in its file and an Excludes reason is not judged, so the count shows where nodes point, not how well they read. This repository's own reviewed vault reads 4 of 70.
**Falsifier**: A chain reaches zero abilities off the map while a reader finds more than three of fifteen sampled abilities undescribed by their node; builders move product code into Excludes to finish; or owners of mature vaults find the figure false, as 4 of 70 suggests may happen.
**Owner**: Stark
