---
name: design-council
description: Review only the Atlas structural commitments selected by design routing, using relevant seats, built evidence, optional conflict rebuttal, and one accountable guardian.
---

# Design Council — selected seats, one accountable applier

Run only when `pnpm design:route` returns
`council.required=true`. Local visual work, spacing/layout repairs,
responsive fixes, interaction-state fixes, motion tuning, topology gesture work,
and copy do not acquire a council merely because they are UI.

The council reviews one built direction and its proof packet. Run
`/design-directions` first only when the route says `directions=yes`.

## Roster

| Agent | Seat | Atlas ownership |
|---|---|---|
| `design-lead` | Lead Product Designer | primary Atlas fact/action and attention |
| `design-system` | Design Systems Engineer | tokens, primitives, markers, and gates |
| `design-interaction` | Interaction Designer | inspect, correct, confirm, reverse, keyboard |
| `design-motion` | Motion / Action Designer | temporal meaning and reduced motion |
| `design-infoviz` | Information Visualization Designer | topology mark → typed fact |
| `design-workbench` | macOS Workbench Designer | installed window and WKWebView |
| `design-responsive` | Responsive & Touch Designer | measured bands, input mode, safe area |
| `design-handoff` | Agent Handoff Designer | state-bound MCP and CLI continuation |

No seat always attends. Use exactly the seats returned by the router; structural
routes derive at least two contrasting seats. `design-guardian` is not a seat.
It is the accountable decider and applier.

Seat briefs live at `../../agents/design-*.md`. The path resolves inside each
mirrored tool tree. Open the selected briefs explicitly and never create a third
copy.

## Required evidence

Before a position can approve, provide:

- the exact PO outcome and selected design direction, when any;
- the built route/app state and commit;
- the router's change facts, seats, and proof packet;
- the computer-use render-loop packet: baseline, material checkpoints,
  final accessibility tree and screenshot for every rendered state in scope;
- measured rect/style, responsive, graph, performance, journey, or installed-app
  output only when the route selected it;
- a real macOS recording and `/motion-verify` result whenever `motion` is in
  the route.

A browser automation screenshot may support measurement but does not replace the
Computer Use render loop. Static screenshots do not replace a motion recording. If a
runtime cannot open the built artifact or run a required instrument, defer that
part of the verdict instead of judging code or a diff by eye.

## Round 0 — prior decision

Read only the relevant `docs/DECISIONS.md` record and its falsifier, located
with `pnpm decisions:find <surface terms>`. Include the selected
`/design-directions` sentence and rejected alternatives when the route required
divergence.

## Round 1 — independent positions

Give every selected seat the same literal brief:

```text
[Change] requester wording and selected direction
[PO decision] exact Atlas outcome and recovery proof
[Design route] change facts, selected seats, proof scopes
[Evidence] source, tests, measurements, Computer Use render loop, recording when motion
[Built artifact] URL/app state and commit
[Output] selected seat brief's exact format
```

Keep first positions in separate reviewer contexts with the same evidence and
without the other positions. Parallel or serial scheduling may preserve that
isolation. If only one shared context is available, label the review as a
single-agent perspective check and disclose that it is not independent. Every rejection
names an implementable alternative and may use published principles without
copying another product's assets, words, palette, layout, or motion signature.

## Round 2 — only material conflict

Do not run a ceremonial cross-critique. Rebuttal happens only when two positions
conflict on the same implementable decision or one new fact could change a
position. Give both sides the opposing claim and run one response each. No
repeated questions and no second round.

## Guardian decision and application

The guardian chooses one proposal or something smaller, never a union. Repository
charter and measured Atlas workflow evidence beat external taste. The decision may leave the design unchanged when the evidence supports it.
When a defect is found, choose the smallest supported correction; do not invent
a removal or visual change merely to demonstrate that review happened.

After applying, rerun only the route proofs invalidated by the guardian's change.
Do not repeat a full design audit, responsive matrix, recording, or installed-app
run when the last-mile edit cannot affect it. A changed proof is never waived.

Append a hard-to-reverse decision to `docs/DECISIONS.md` as the six-field
record below; `pnpm decisions:check` refuses any other shape. The council
utility block goes in the pull-request rationale, never into the ledger.

## Council utility

The pull-request rationale must expose whether the council earned its cost:

```md
**Pre-review decision**: …
**Selected seats / first positions**: … / N
**Rebuttal**: none / N turns because <material conflict>
**Decision delta**: unchanged / stopped / narrowed / redirected / proof strengthened
**Unique contribution**: <seat + exact contribution> / none
**Review footprint**: first N · rebuttal N
```

An unchanged council may be honest but cannot claim review-caused improvement.
Five consecutive no-delta councils trigger owner review of the threshold.

## Output to the human owner

```md
### First — three lines

- **What we decided**: one sentence
- **What differs from your request**: every narrowed or widened part, or none
- **What you need to do**: usually nothing
```

Keep internal verdict tables in the review artifact; explain the decision and
its evidence plainly in the conversation. If the owner cannot understand the
summary, rewrite that summary. A necessary scope or authorization question is
valid; name the unresolved decision rather than treating every question as a
failure. Always disclose any difference from the owner's request.

## Ledger record

```md
## YYYY-MM-DD — <the decision in one line>

**Why**: <the observation that forced a decision>
**Prior**: <YYYY-MM-DD (n) cited as standing or overturned, or none>
**Decision**: <what design-guardian decided, the smallest slice>
**Dissent**: <the strongest losing seat position, or none>
**Falsifier**: <the one observable condition that reopens this>
**Owner**: <the accountable person>
```

Seats, verdict table, evidence checkpoints, delta, and footprint stay in the
pull request; the record carries what the next council must read.
