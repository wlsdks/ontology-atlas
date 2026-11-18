---
id: fbb466df-09ea-42b9-82f0-2b0b8bfe2cc7
date: 2026-11-19
---
## 2026-11-19 — The first survey is a breadth map, and a first map is held to coverage and depth

**Why**: Stage A builds (trial2-a, 2026-11-18) wrote 39 to 52 nodes; in go-server 14 of 24 capabilities said "outlined only", 18 relation notes described code their nodes called unread, eight nodes shared one entry file, and every build still finalized `evidence` as answered. Count targets ("15 to 30", "one per 1,000 lines") made builders pad to a number.
**Prior**: Extends 2026-11-18 `0f78a22b` (one run, no waiting) and `7b5c2c49` (the door returns what the next call needs). `e2b151fb` stands for the proposal route, where candidates still come from README headings; the default survey no longer sends candidates. 2026-09-21 `a97078a0` stands: the card stays inside 1,950 characters with the injection rule.
**Decision**: `analyze_repo_structure` with no proposal returns `breadthMap:v1`: size, every product unit with main files, exports, importers and imports, entry points and docs, as rows; no candidates or suggested relations. sourceReads take 16 selectors. `add_concepts` and `validate_vault` report a coverage line (product lines whose unit a node `path:` touches, untouched units named, outlined-only count). `validate_vault` adds four warnings: `relation-note-on-unread`, `dependency-both-ways`, `path-without-code`, `path-shared`. `finalize_project_meaning` refuses `evidence` answered when over a third of capabilities are outlined only, `domains`/`abilities` below 80% coverage, `impact` below one `depends_on` per two capabilities. Agent texts drop every count target and ask for each must-have ability's entry function to be read with line ranges.
**Dissent**: coverage by unit rewards a node per folder; a builder can reach 80% with thin nodes, and the refusal thresholds are judgement, not measured.
**Falsifier**: in the next replays coverage rises while a person still cannot say how a must-have ability works from its node, or builders mark rows partial to pass finalize and the map gets no deeper.
**Owner**: Stark
