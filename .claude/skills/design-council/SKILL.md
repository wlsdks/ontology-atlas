---
name: design-council
description: Convene only the relevant Atlas design seats around a built surface, run independent critique and one cross-critique, then let design-guardian decide, apply, and remeasure.
---

# Design Council — eight seats, one accountable applier

Use after a meaningful visual, layout, interaction, motion, graph-readability,
responsive, workbench, or agent-handoff change. Skip copy-only and build-plumbing
work. Run `/design-directions` before implementation when the shape was not yet
selected.

## Roster

| Agent | Seat | Owns |
|---|---|---|
| `design-lead` | Lead Product Designer | screen job, attention winner, first impression |
| `design-system` | Design Systems Engineer | tokens, ramps, lint, tests, static depth |
| `design-interaction` | Interaction Designer | states, keyboard, discoverability, modality |
| `design-motion` | Motion / Action Designer | physical feel, interruption, measured motion |
| `design-infoviz` | Information Visualization Designer | mark→fact mapping, graph readability, contrast |
| `design-workbench` | macOS Workbench Designer | installed app, window, 14-inch first viewport |
| `design-responsive` | Responsive & Touch Designer | breakpoint rects, touch, safe area, reflow |
| `design-handoff` | Agent Handoff Designer | MCP/CLI next action and state-bound handoff |

`design-lead` and `design-system` always attend: hierarchy and system always
attend. Add only seats the change actually touches.

`design-guardian` is not a seat. It is the accountable decider and applier, so the
builder does not approve its own work.

Seat briefs live at `../../agents/design-*.md`. The relative path resolves inside
each mirrored tool tree. Open them explicitly and never create a third copy.

If parallel subagents are available, launch every selected seat in one batch.
Otherwise run sequentially and disclose that Round 1 independence was lost. If a
runtime cannot open the built artifact or run a required instrument, defer the
verdict rather than judge by eye. Branch on capability, never a tool brand.

## Instruments are mandatory

- `design-motion` runs `/motion-verify`.
- `design-responsive` runs `/responsive-sweep`.
- Every finished visual change runs `/design-audit`.

Other seats open the built surface relevant to their judgment; diff-only critique
is invalid.

## Round 0 — prior decisions and selected direction

Read `docs/DECISIONS.md` for the same surface and its falsifier. Include the
selected `/design-directions` sentence and rejected alternatives. A council
reviews the chosen direction; it does not invent options after implementation.

## Round 1 — independent critique

Give every selected seat the same literal brief:

```text
[Change] requester wording and selected direction
[PO decision] exact PO result
[Evidence paths] source, rules, messages, tests
[Built artifact] URL/app state and assigned unique port
[Required instrument] seat-specific command or none
[Output] the seat brief's exact format; at most one cross-council query
```

Every seat names a concrete alternative when rejecting and cites published
principles without copying another product's assets, words, or visual signature.

## Round 2 — one cross-critique

Resume the same seats and provide the other positions in varied order. Each seat
must restate the strongest opposition, concede or refute it, change only after a
newly learned fact, create its strongest self-critique, and name one point another
seat got right. One round only.

## Bounded cross-council query

```md
**Query → <other seat>**
**Question**: one answerable sentence
**Decision at stake**: what changes
**Assumption if unanswered**: default
```

Route through Round 2 when the other council is open; otherwise call only the
named seat. One answer, no repeated question.

## Round 3 — guardian decision and application

The guardian chooses one proposal or something smaller, never a union. It applies
the repository charter over external taste and chooses the smallest change that
clarifies the ontology workflow.

An addition-only critique fails: the decision names something to remove, dim,
collapse, or align. After editing, the guardian reruns `/design-audit`; Round 1
measured the old build, not the guardian's last mile.

Append the decision, strongest dissent, falsifier, and revisit condition to
`docs/DECISIONS.md`.

## Output to the human owner

```md
### First — three lines

- **What we decided**: one sentence
- **What differs from your request**: every narrowed or widened part, or none
- **What you need to do**: usually nothing
```

The verdict block does not belong in the conversation. This plain-language rule
applies to the entire answer. A clarification request is a failure signal; rewrite
from the beginning. “What differs from your request” cannot be omitted.

## Ledger block

```md
## Design Council Verdict — <change>

**Convened because**: … · **Selected seats**: …
| Seat | Verdict | Prescription/evidence |
|---|---|---|
| … | … | … |
**Primary moment**: … · **Attention winner**: …
**Decisive disagreement**: …
**Applied rule**: smallest slice / charter first / no union / removal required
**Decision (design-guardian)**: …
**Recorded dissent**: … · **falsifier**: … · **revisit**: …
**Remove/dim/collapse/align**: …
**Proof after application**: design-audit · motion/responsive/app as required
```
