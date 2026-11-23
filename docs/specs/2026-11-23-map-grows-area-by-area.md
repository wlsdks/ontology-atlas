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

1. For a repository surveyed as areas, each area carries the number of abilities the survey
   found in it and the number of capability nodes whose `path:` falls in it (longest area path
   wins). An area is **not mapped yet** when it holds abilities and has fewer than one capability
   per three of them. Tooling an exclusion line in the project's Uncertainty names is not counted.
2. The Areas sentence of every write result and of `validate_vault` reports "N of M areas are
   not mapped yet", the largest gaps first with both counts, the call that opens the next one,
   and the exact lines to keep under the project's `## Uncertainty`:
   `Not mapped yet: N of M areas.` followed by one bullet per area it lists. Naming an area in
   prose no longer removes it from the sentence.
3. The first-build `Next` text of an area survey asks for those lines instead of "unopened".
4. In a server process that has served no reads, the Depth sentence lists only capabilities
   whose body cites no existing lines, and says how many cite lines recorded earlier that this
   process did not re-read. The refusal rules of `finalize_project_meaning` are unchanged.
5. `growth_plan` reads a `Not mapped yet:` bullet as `unopened-area` with its path and the
   open-area call, and no longer proposes reading the project's own path for a statement that
   lists other nodes.

### What the panel offers

6. A project whose body holds `Not mapped yet: N of M areas.` with N above zero gets one next
   step, ahead of reading rules: "Map the next part of the code". Its request tells the agent to
   take the first area `validate_vault` names, open it, write one capability per thing a user,
   an operator or another system gets (at most twelve per press), read each by symbol and state
   its rule with cited lines, narrow a group capability that only named them, add the
   `depends_on` edges the reads show, then replace the project's `Not mapped yet` lines with the
   ones `validate_vault` gives.
7. The count on the button is read from the project node, like every other next step: the
   answer is in the folder, and a stale count corrects itself on the next press because the
   request rewrites the lines from the server's measure.

## Out of scope

- Pressing the step for the person until nothing is left. The seat for long work exists
  (`2026-11-20-long-work-in-background.md`); chaining presses is its own slice once one press is
  proven on the installed app.
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
