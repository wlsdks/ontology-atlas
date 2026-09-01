# Campaign Demo Storyboard — Review What the Agent Built

> **Status: replacement brief, not recorded.** The active download-page video
> remains the localized 44-second `atlas-tour` documented in
> `docs/DEMO-SCENARIO.md`. That footage proves concept → relations/evidence →
> read-only Codex path lookup. Do not relabel it as post-agent change review.

This brief defines the next campaign demo without authorizing media production.
It uses only existing Atlas behavior: guarded agent writes, exact Markdown
changes, human approval, History, Map, and a later read through Atlas MCP.

## The two questions the clip must answer

After one viewing, a coding-agent developer should be able to say:

1. **What does Atlas show?** The capability, boundary, evidence, dependency, or
   uncertainty that changed — not merely the files an agent touched.
2. **When do I use it?** After an agent finishes and before I accept the work or
   start the next task.

The reusable contrast is:

```text
Git shows which lines changed.
The producing agent says what it claims it did.
Atlas preserves what a person reviewed the codebase to mean.
```

## Evidence-bound example

Use the committed synthetic change-flow example rather than inventing a success
story. In `2026-08-31-change-r7-greenfield-on-r1.diff`, checkout gained a
validated `discountCents` option and focused tests. The paired Atlas record added:

```markdown
## Change record
- The confirmed total now accepts non-negative integer discountCents and clamps at zero.
```

The existing capability boundary still excludes inventory availability
calculation. The run proved that this reviewed record can travel beside the code;
it did **not** prove faster work, better code, or a better human decision.

## 36-second one-take flow

| Time | Visible beat | What it proves |
|---:|---|---|
| 0–4s | Start on `capabilities/checkout`: purchase confirmation and pricing adjustments are in scope; inventory availability remains out of scope. | There is a readable before-state and a boundary to preserve. |
| 4–9s | The coding-agent turn has finished the `discountCents` code and focused tests. The person explicitly asks: “Update Atlas with only the meaning this change supports. Keep unsupported scope unknown.” | Atlas does not claim to detect semantic change automatically. |
| 9–16s | The Atlas write request pauses on the exact capability body change. Hold long enough to read the target, proposed text, and selected-folder scope. | The agent proposes; it does not declare truth. |
| 16–20s | The person reviews the proposal and chooses **Allow once**. If a genuinely unsupported relation appears during a real rehearsal, reject it and record that correction; never stage a fake error just for drama. | Human judgment is the acceptance boundary. |
| 20–27s | Open **History** and hold on the Markdown diff: the one checkout change record is unsaved/changed, while the existing inventory boundary remains readable. | The semantic delta is inspectable and Git-backed. |
| 27–32s | Return to the Map and select Checkout; its capability, boundary, implementation evidence, and change record are now one reading path. | The codebase's new meaning is visible above file level. |
| 32–36s | In a fresh read-only agent turn, ask “What changed in checkout?” and show `get_concept` retrieving the accepted record. End on: **Review what was built before you accept the work.** | The next worker inherits what the person accepted, not only the producing session's summary. |

## Capture contract

- Use a disposable copy of the committed public benchmark fixture outside the
  repository. Show no private path, account, notification, terminal history, or
  provider credential.
- Capture surface: **Installed macOS desktop app**, at 1512×950 and 30fps, in
  Korean and English as separate one-take captures. No speed changes and no
  hidden edit between approval, History, Map, and the read-only retrieval.
- The agent update must be explicitly requested on screen. Never use captions
  that imply automatic source understanding, exhaustive coverage, or a fully
  current vault.
- The approval receipt must name the actual target and changed text. A generic
  “success” toast is not proof.
- The final read must use Atlas MCP. A plausible answer from shell search or the
  agent's prior transcript invalidates the take.

## Copy for the clip

Use at most these four captions:

```text
The agent changed the code.
Atlas shows the meaning it proposes to change.
You correct or approve it.
The next agent starts from what you accepted.
```

Localize these captions through the product message catalog only after the
recording contract passes; do not maintain a second prose source in this brief.

## Exit gate before recording

Show a text storyboard or rough local rehearsal to five source-hidden
coding-agent developers. At least four must answer both questions from the first
section without being prompted. Also ask what they believe happened
automatically; any answer that Atlas detected or understood all code fails the
storyboard.

If the gate misses, keep the current lookup video and revise the storyboard.
Passing this gate authorizes a separate recording task with the privacy, motion,
locale, and responsive proof required by `docs/DEMO-SCENARIO.md`; it is not
itself permission to publish.
