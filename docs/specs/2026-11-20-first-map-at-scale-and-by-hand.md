---
title: A first map that reaches the agent on large repositories, and building by hand in place
doc_type: spec
status: draft
date: 2026-11-20
decisions: []
area: construction
---

# A first map that reaches the agent on large repositories, and building by hand in place

The lead wrote this spec on 2026-11-20 from measurements taken that day.

## The ask

The owner said on 2026-11-20, translated: "Make ontology construction top class. It builds through the MCP tools from the agent conversation; optimise it properly. Verify only on open source with no licence concern, the richer the domain the better. Fast and well optimised. And make building the ontology by hand easy to use and good to look at." Later the same day: "What confused people most was whether the map was being built at all. On the first start the agent downloads and they could not tell; show it at once, with a bar, and send the waiting question when it is done."

## What was measured on main

Three first builds ran through `.claude/skills/ontology-field-trial/scripts/acp-replay.sh` with an Opus builder on shallow clones of three repositories nobody in the session had read: a BSD-3-Clause Python commerce platform (2,522 product files, 264,650 lines), an MIT TypeScript personal-finance monorepo, and an Apache-2.0 Java fleet-tracking server (1,059 product files, 119,384 lines).

| | Python | TypeScript | Java |
|---|---:|---:|---:|
| Nodes (domains, capabilities, elements) | 26 (6, 18, 1) | 20 (4, 13, 2) | 28 (4, 19, 4) |
| Median words per node | 37 | 77 | 62 |
| Cited lines that exist | 15 of 15 | 41 of 41 | 39 of 39 |
| Agent turns, wall clock, cost | 23, 193 s, $1.80 | 30, 210 s, $2.25 | 30, 229 s, $2.46 |
| First survey as the agent received it | rejected | rejected | 15,922 characters |

- **The host forwards `structuredContent`, never the text block.** The compact rows `renderBreadthMap` builds were read by no agent; the agent read the JSON object, about twice the size.
- **The first survey never arrived on the two largest repositories.** The host answered "result (56,806 characters) exceeds maximum allowed tokens" and saved it to a file the door has no tool to open. The Python builder wrote "about 105 survey abilities remain unplaced" and stopped at 26 nodes.
- **The large survey spends its rows badly.** Migration folders are product units (24 of 157 rows), units are cut by size so whole areas vanish, and each ability kind keeps an equal share of 120 rows, so 79 export rows displace product areas.
- **Java has no import graph and no ability rows.** Every unit prints "imported by 0 units" and the floor is "0 abilities listed".
- **Every build lost three to six calls finalizing**: a layout refusal, the competency guide, a patch, a witness refusal, another patch or connect.
- **A survey takes 15 to 22 s on the Python repository** and is rebuilt by the next write: import inference is 73 percent of it, most of that in per-candidate `existsSync`, `lstat` and `realpath`.
- **Write results carry what no next call needs**: an absolute path per row and the maintenance plan with ids, scores, filters and cursors.

The manual surface was inventoried the same day: 13 entry points across three places, a blocking create dialog with an unexplained kind select, no keyboard create on the map, a relation target picked from one select over every concept, no rename or delete on the map, and no undo after any write.

## Decisions

### What the agent reads

1. `analyze_repo_structure` declares no `outputSchema`. The breadth map and source reads return one text block and no `structuredContent`, so every host forwards the compact rows. Source reads gain a compact rendering that keeps every fact a builder cites or acts on.
2. No `analyze_repo_structure` response exceeds 40,000 characters of forwarded payload. A response that would exceed it pages or narrows and says how to get the rest.
3. Write results carry per-row outcome and `mtime`, the findings on the nodes just written and the coverage lines, and nothing else.

### A large repository

4. When the flat map does not fit, the first response lists areas, splitting the largest folder while rows remain, so every product area is named. Ability rows go to product-facing kinds first and to every area before any area's second share.
5. Migration history is left out and counted, like tests.
6. Writes and validation name the areas no node falls in, with the call that opens the next one.
7. Java and Kotlin join import inference, and JVM endpoints, executables, scheduled work and class families become ability rows.

### Cost of a build

8. The map the first call builds is reused until a source file changes; each path question is asked of the disk once per inference pass.
9. `finalize_project_meaning` takes the five answers as arguments, renders the section itself and measures the evidence it is shown inside the connected root, in one call.

### The agent panel

10. A first-run download is its own stage with a bar and the megabytes received; the stage shows download, connect and send as steps and names a waiting request.
11. A press while the agent is starting holds that request and sends it when the session is ready.
12. The work stage says how many concepts and relations the turn has written.

### Building by hand

13. Creating, relating, renaming, describing and deleting happen on the map without a blocking dialog, each write at once with Undo for the most recent one. The review step before a person's own write is removed; agent writes keep their permission card.
14. The concept list gains an add row per open group; the map gains `N`.
15. A relation's target is found by search, and a hand write produces the frontmatter the MCP writer produces for the same relation.

## Out of scope

- Drag-to-connect on the canvas.
- A build orchestrated by the app across several agent sessions.
- Trimming `validate_vault` and vault loading, which two open pull requests change.

## Acceptance

- The three builds are repeated on the integration branch with the same script and model. Each survey is accepted by the host; the Python and Java maps name every product area the survey lists or record it as unopened; cited lines still all exist; cost per written node does not rise.
- An independent reader checks a sample of dependency edges and rules in each vault against the clone.
- The manual flow passes `tests/e2e/map/build-by-hand.spec.ts`, and the agent panel states are captured in dark mode at two widths.

## Revisions

- 2026-11-20: first version.
