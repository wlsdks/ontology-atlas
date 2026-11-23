---
title: A map of a large repository grows one area per press
doc_type: spec
status: draft
area: mcp
date: 2026-11-23
decisions: []
---

# A map of a large repository grows one area per press

The lead wrote this spec on 2026-11-23 from two first builds measured that day.

## Person and moment

A person points Atlas at a large repository and presses Build. Two and a half minutes later the
map shows every domain and about fifteen capabilities. They look at the capability that stands
for the heart of the product and it says "No deciding rule was read in this run". The panel
offers to read eight capabilities. Nothing offers to put the rest of the product on the map.

## What was measured on main

Two first builds ran through `.claude/skills/ontology-field-trial/scripts/acp-replay.sh` with an
Opus builder on shallow clones nobody in the session had read: an Apache-2.0 Java core-banking
platform (5,743 product files, 585,427 lines, 45 areas) and an Apache-2.0 Go usage-billing
service (3,577 Go files).

| | Java | Go |
|---|---:|---:|
| Nodes (domains, capabilities, elements) | 26 (9, 14, 2) | 29 (7, 17, 4) |
| Capabilities with a rule read | 6 of 14 | 8 of 17 |
| Surveyed abilities with their own node | 12 of 120 | 16 of 120 |
| Surveyed abilities only named inside another node | 107 | 104 |
| Turns, wall clock, cost | 15, 139 s, $1.02 | 21, 169 s, $1.30 |
| Calls refused, largest answer | 0, 37,145 characters | 0, 31,578 characters |

- **The first build does what decision 4a of `2026-11-20-first-map-at-scale-and-by-hand.md` asks**:
  every domain, the main ability of each, and it stops. That bound stays.
- **Nine abilities in ten are a name inside a group node.** One capability, "Manage Loan Products
  and Loans", lists twelve resource classes and no rule. The breadth floor counts a name inside
  another node as placed, so the measure reads "0 not placed".
- **No next step widens the map.** The panel offers reading rules, dependencies, renames and
  updates. The areas the builder lists as unopened in the project's Uncertainty are then reported
  by nothing: naming an area there removes it from the Areas sentence.
- **A request that names one area works.** A prototype request on the Go build ("give the
  abilities this capability only names their own concepts", pointing at the billing folder) wrote
  11 capabilities, each with a rule and its cited lines, and 10 `depends_on` edges in 113 s for
  $1.22. The same request pointed at one entry file's folder on the Java build found two
  abilities there and wandered; the unit has to be an area of the survey, not a file's folder.
- **The server's measure did not see that work.** After 11 real capabilities the breadth sentence
  moved from 16 to 17 of the same 120 sampled rows.
- **A later session is told to read everything again.** A fresh server process says "0 of 14
  capabilities cite lines this session read" and lists capabilities an earlier session read and
  cited.
- **`growth_plan` cannot queue an area.** "Unopened areas: a, b, c" classifies as `other` with no
  path, and a project line that lists unread capabilities proposes "Read README.md".

## Decisions

### What the server measures

1. For a repository surveyed as areas, an ability the survey found is **on the map** when a
   capability or element node points at its code: the node's `path:` is the ability's file or a
   folder strictly below the area's own folder that holds it, or the node's body cites lines that
   exist in that file. Nothing else counts; a name inside another node, a `path:` at a whole area,
   or a number of nodes in the same folder, does not. An ability the project leaves out is not
   counted: its `## Excludes` names the ability's file or a folder above it as a path, or an
   Uncertainty line does and says it is left out (tooling, generated, samples) without saying it
   is still to open or read. A one-word folder name counts only in code form or leading its line,
   and a cite of one row (`path:L12`) leaves no file out. An area is **not mapped yet** while it holds a counted ability that is
   not on the map; an area holding none is not mapped until a node's path falls in it or a
   domain names it. Areas are ordered by abilities not on the map, ties by lines. A folder's own
   files and a row of smaller folders are areas too and are written as the survey labels them.
2. The Areas sentence of every write result and of `validate_vault` reports "N of M areas are
   not mapped yet", the largest gaps first with both counts, the call that opens the next one,
   and the exact lines to keep under the project's `## Uncertainty`:
   `Not mapped yet: N of M areas, R of T abilities.` followed by one bullet per area it lists.
   R is the abilities not on the map and T the abilities counted. Naming an area in prose no
   longer removes it from the sentence. One request maps the files that hold abilities with no
   node, at most twelve files across at most six areas, largest area first; the sentence names
   those files. `finalize_project_meaning` refuses, and `validate_vault` warns
   (`not-mapped-line-mismatch`), while the project's summary line differs from the measure.
3. The first-build `Next` text of an area survey asks for those lines instead of "unopened".
4. In a server process that has served no reads, the Depth sentence lists only capabilities
   whose body cites no existing lines, and says how many cite lines recorded earlier that this
   process did not re-read. The refusal rules of `finalize_project_meaning` are unchanged.
5. `growth_plan` reads a `Not mapped yet:` bullet as `unopened-area` with its path and the
   open-area call, and no longer proposes reading the project's own path for a statement that
   lists other nodes.

### What the panel offers

6. A project whose summary line says R above zero can have the rest mapped. The request tells
   the agent to take the files `validate_vault` names, write one capability per thing a user,
   an operator or another system gets from them (at most twelve per request; one capability may
   stand for several files it cites), read each by symbol and state its rule with cited lines,
   narrow a group capability that only named them, put what is not product on one line of the
   project's `## Excludes` with its path and the reason, add the `depends_on` edges the reads
   show, then replace the project's `Not mapped yet` lines with the ones `validate_vault`
   gives. The person does not send it once per request:
   `2026-11-23-one-press-maps-the-rest.md` owns the control that sends it.
7. The count on the button is read from the project node, like every other next step: the
   answer is in the folder, and a stale count corrects itself on the next press because the
   request rewrites the lines from the server's measure.
8. With several projects, the step speaks for the one with the most abilities left; counts are never
   summed. The server's measure and the line it checks belong to the vault's first project only,
   because one server process is bound to one repository root (`OATLAS_REPO_ROOT`), so it has no
   survey to measure a second project's code against. The line is read in English in every locale, and the localized requests say to keep
   it as written. A folder with five concepts or fewer is still offered Build first.

## Out of scope

- Changing the breadth floor of a first build or the 120-row sample.
- Meaning search for agents through MCP (`2026-11-19-search-by-meaning.md`, Later 4).

## Acceptance

- The two builds are repeated on the integration branch with the same script and model, then the
  panel's new request is sent three times to each in fresh sessions. After the third press: the
  Java map holds at least 40 capabilities and the Go map at least 45; at least 80 percent of
  capabilities state a rule with cited lines; every cited line exists; `Not mapped yet` in the
  project node equals the server's count after every press; no call is refused; no answer
  exceeds 40,000 characters.
- An independent reader checks 15 rules and 10 edges per vault against the clone.
- The first build's wall clock and cost stay within 25 percent of the baseline above.
- The panel shows the step for a project with the line and not without it
  (`chat-suggestions.test.ts`), in four locales.

## Risks

1. **The ratio calls a well-mapped area thin.** An area of thirty CRUD routes behind five
   resources has ten capabilities at most. Probe: after three presses, read each area still
   listed; if two or more are complete to a reader, the rule changes to count ability rows by
   entry file.
2. **The agent does not keep the lines.** Probe: the acceptance compares the project node with
   the server's count after every press.

## Revisions

- 2026-11-23: first version.
- 2026-11-23: decisions 1 and 8 gained what the two slices had to settle: what leaves an area
  out, how the gap is ordered, the areas that are not one folder, and the choice among several
  projects. Right after a first build the measure lists nearly every area (36 of 40 on the Java
  build), since an area with one ability and no capability counts; risk 1 covers it.
- 2026-11-23: after three requests on the Go build (22 to 52 capabilities) the line read 29 of 46
  areas, so the count of areas could not show progress, and the Java builder kept no line at
  all. The line gained the abilities, and finalize refuses without it.
- 2026-11-23: the measure counts evidence, not a ratio. "One capability per three abilities"
  read 74 percent on the Go map where nodes point at the code of 101 of 152 abilities
  (66 percent), and it could never reach 100 for an area whose abilities share a few files
  while calling a thin area mapped. The owner asked that the number mean what it says. Risk 1
  is retired with the ratio. The owner also rejected one press per request the same day;
  chaining left Out of scope for its own spec.
- 2026-11-23: after an independent review, only a written path leaves code out (one folder name
  only in code form or leading its line, never the root's own files or a one-row cite), a cite
  counts only when its lines exist and resolves as the Depth measure does, and a folder `path:`
  strictly below its area points at the files under it. The first summary line alone must carry
  the measure, a line kept after every area is mapped is stale, areas without abilities ask for
  none, and one shared case table holds the server and the app to the same reading; decision 8
  names the first project.
