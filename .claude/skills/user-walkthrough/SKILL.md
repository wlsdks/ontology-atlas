---
name: user-walkthrough
description: Walk one complete journey against the running build with a declared knowledge state, name observable UX failure patterns, and refuse to invent whether a person would want the product.
---

# User walkthrough

Screen reviews do not prove a journey. When `pnpm design:route` includes this
skill, walk its declared scope: the changed path for a local journey change, the
agent-handoff path for a handoff change, or the continuous north-star path for a
new surface.

## Authority and limit

Judge facts that live in the artifact: vocabulary, next-step visibility, control
discoverability, feedback, perceived reversibility, waiting state, missing paths,
and visible craft. Each can be proven by pointing at the screen.

Do not claim facts that live in a person's mind: whether they want it, will return,
recommend it, or pay. Simulated users mispredict real people inconsistently. “No
observable stall” does not mean “they like it.” Demand, retention, and willingness
come only from real people.

## Name patterns, not emotions

Every finding carries a reusable pattern name. “This person will feel frustrated”
is invention; “dead-end CTA—the primary button opens an empty destination” is a
checkable pattern.

Common patterns:

| Pattern | Definition |
|---|---|
| Dead-end CTA | the strongest action leads nowhere useful |
| Implementation-language label | the label describes program work, not the user's outcome |
| Gate before value | the product requires something before showing why it matters |
| Silent wait | work is happening with no visible progress |
| Unknown reversibility | a risky-looking action shows no undo or cancellation path |
| Builder vocabulary leak | internal developer terms appear on the user surface |
| Missing next step | the screen does not say what follows the completed action |

Name and define a new repeatable pattern when needed. Repeated patterns in the
decision ledger may deserve a product rule.

## Declare the walker

Use only knowledge state, situation, and concern. Do not invent demographic or
emotional backstory.

Default:

```text
Knows: uses Claude Code daily; maintains AGENTS/CLAUDE Markdown; comfortable with Git.
Does not know: Atlas; product use of “ontology”; graph databases.
Context: technical lead on a 2–10 person team, received a link while doing other work, meeting in 10 minutes.
Cares about: agents losing context, software touching local files, and the ability to leave later.
```

Make the knowledge gap real by using a fresh agent that has read none of this
repository. Give only the profile, one task sentence, and starting URL. The
walker records what was visible, clicked, expected, and observed; it does not
judge the product.

## Four questions at every step

1. **Goal:** was the required action understandable?
2. **Discovery:** was the relevant control visible?
3. **Connection:** did its label describe the outcome in the walker's language?
4. **Confirmation:** after action, did visible state confirm progress?

Record `[step · screen · failed question · elapsed time · evidence]`.

## Two journeys

**A. Agent journey is a real user measurement.** A plain coding-agent session
with only Atlas MCP receives: “Explain this repository's structure and cite vault
nodes.” Measure from opening the link to the first accurate citation. The tested
population is the product's actual agent user.

**B. Human journey is a usability inspection.** Use the knowledge profile and a
running static export or installed app to complete the task end to end. It still
cannot prove desire.

For every human journey, use the computer-use capability to open the actual app/window and
capture the accessibility tree and screenshot at the changed or failed step.
Record the saved path and visible control that owned the next action. Browser
automation alone does not satisfy the design evidence contract.

## Where results go

- Stalls become direct-use evidence for `/po-pass` and `po-evidence`.
- Hierarchy and interaction findings become material for the design bench.
- A clean walkthrough does not justify “Build and verify”; it proves only that
  this journey exposed no named stall.

## Output

```md
## User walkthrough — <task>

**Walker**: <knowledge · context · concern> · **context isolation**: confirmed
**Journey**: A agent / B human / both
**Build**: <URL or installed app · commit>
**North-star time**: <link to first accurate citation, target under five minutes>

| Step | Screen | Failed question | Time | Evidence |
|---|---|---|---:|---|
| … | … | goal/discovery/connection/confirmation | … | screenshot or log |

**Stalls, highest severity first**: …
**Exit point**: <where and why the task was abandoned, if any>
**What the artifact did not say**: <internal label, missing next step, invisible state>
**Not claimed**: whether this person wants, returns to, or recommends the product.
```
