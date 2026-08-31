# First-run walkthrough — 2026-08-31

One complete journey, walked rather than reviewed: download page → installed app
→ point at a folder → build a vault → connect an agent → first useful answer.

**Walker's knowledge state**: uses a coding agent daily, maintains agent
instruction files, comfortable with Git. Does not know Atlas, the product use of
"ontology", or graph databases. Received a link while doing other work.

**Context isolation**: confirmed. The agent journey ran in a separate process
that had read none of this repository, against a repository it had never seen —
a small collaborative-writing app written for the walk.

**Build**: installed macOS app, `367944d29`.

## North-star

The target is *link → first accurate citation of the user's own vault, under
five minutes*. **It did not complete.** Three agent turns spent 370 seconds and
produced no vault to cite; the last turn said so rather than inventing one:

> "There are no vault nodes to cite. The configured vault points at this
> repository but reports `total: 0`, so attributing these structural claims to
> vault nodes would be fabricated."

That refusal is the product working. The path not completing is the finding.

**The target also assumes one turn, and the product is three**: propose → human
approves → write, and only then can anything be cited. That structure is
deliberate — nothing is written before a person accepts — so either the target
or the path has to change. It is not a defect to be fixed by making the agent
faster.

## Findings, most severe first

### 1. The instruction the app hands out promised a path the server refuses

`init`'s analyze step tells the person to copy an instruction into the agent
they already use. Its step 6 read: *"Do not call add_concept … until the human
explicitly approves that plan. Write only approved items."*

The walk pasted exactly that, approved the resulting proposal, and got nothing.
The server answered `canWrite: false`:

> "Atlas requires an independent source-hidden evaluation and digest-bound human
> acceptance for the exact plan digest `sha256:229dd6…`. The earlier blanket
> approval cannot satisfy that gate because it predates the generated digest."

The instruction named none of `canWrite`, `writePlan`, `nextStep`, or the digest,
so the person had no way to learn what they had missed.

**The gate was not the problem.** The instruction was a second, hand-shortened
copy of a ten-step lifecycle the server already publishes in its own
`instructions` and reports through a required `nextStep` field on every
response. Two hand-written copies of one contract drift — the same shape as the
insights surface disagreeing with the CLI about what a node is (2026-08-16).

**Fixed**, and verified by re-running the same scenario: the instruction no
longer promises the write, points at the server's lifecycle instead of
paraphrasing it, and requires the agent to say which step needs the person
rather than stopping silently. The rerun ends with the plan, its six gaps, the
digest, the named next step, and the exact sentence the person can say.

### 2. The same repository and instruction produce different proposals

Turn 1: 9 concepts / 8 relations. Turn 2: 13 concepts / 14 relations. Turn 3
(after the fix): 1 project, 1 domain, 4 capabilities, 4 elements, 9 relations.
Nothing about the input changed.

**This entry originally drew the wrong conclusion, and the correction matters
more than the observation.** It said acceptance could never match across
sessions because a fresh session regenerates a different digest. That is not how
the digest works: it is a pure function of the proposal the caller submits
(`mcp/src/construction-lifecycle.mjs`, `planDigest` over the canonical
`buildWritePlan(proposal)`), with no timestamp and nothing server-authored in it.
A proposal carried back **verbatim** reproduces the digest the person accepted.
Acceptance does not expire; a fresh session simply re-authors the proposal by
default and so invalidates its own approval. Three plans from one repository is
ordinary model variance, and the server treats each as the distinct plan it is.

**What is genuinely out of reach for a lone agent is the other half.** Writing
needs a `constructionQualification:v1` packet whose evaluator is not its builder;
the server fails closed on `maker-self-evaluation` when the two ids match, and
the lifecycle instructs an agent that cannot run an independent lane to stop and
ask for a handoff rather than fabricate one. That is a boundary this product
chose and paid for, not a defect.

**Partly fixed.** The instruction now tells the agent to save the exact proposal
it showed, names the independent-evaluation lane as what writing additionally
needs, and tells it to stop rather than chase `canWrite` — which the first repair
of that instruction had wrongly told it to do. What remains is a product
question, deliberately not answered here: whether to offer a supported
session-per-lane relay so a person using one-shot invocations can finish, using
the handoff helper the bootstrap skill already carries.

### 3. Pointing Atlas at a code repository shows no code

The walk selected a repository with five TypeScript files, a README, and a
product document. The first-run card said:

> "Found 1 documents here that are not on the map yet. They can go on the map as
> they are." — with the action *"Make a map from my documents"*.

The step that reads code exists and is well written — *"Let AI draft the map
from your code"*, with a copy-the-instruction fallback for people without an
in-app agent — but it is **third**, behind mapping the one markdown file and
connecting an agent (`VaultStartSteps.tsx:134`). The ordering comment reasons
that "for someone who already has something, the first step is what they have";
in a code repository what they have is code.

**Not fixed.**

### 4. The download page ends without saying what happens next

Searching the page for any post-install instruction — opening a folder,
connecting an agent, registering a server, running a command — returns nothing.
It ends on `MIT licensed · Local-first · Next.js · TypeScript · Canvas 2D · MCP`.

**This entry was filed without checking whether the absence was deliberate. It
was.** Decision (83), 2026-08-19, removed the install section from the gateway
entirely, on the owner's own reading of the finished screen — *"the last one can
go, it's all at the top anyway"* — and the record is signed by the owner, having
been shown the exact list of honesty facts that would leave the screen with it.
Its applied rule was *removal, not reduction*: what the owner judged unnecessary
does not come back in smaller form.

So this is not a defect report. It is a proposal to reopen a closed decision, and
it should have been written as one.

That record also fixes the terms of any reversal, and neither is met:

- **Its falsifiers**: a question about signing, notarization or checksums; a
  report of dropping out at the Gatekeeper or SmartScreen step; a visitor asking
  where the source is. None observed — this repository has no open issues.
- **Its review trigger**: when the first ten people have actually finished an
  install, walk this journey again.
- **Its prescribed remedy if a falsifier fires**: not the install section
  returning, but a proof line in the colophon. A reader acting on this entry
  should build that, not what this entry originally implied.

**Deliberately not fixed**, and it should stay that way until one of those
observations exists.

## What the product did well

- **The agent discipline holds.** Given a repository whose `src/auth` exports a
  `teamAuth` constant, the proposal refused to promote workspace membership to a
  capability because no product document claims it as a responsibility. It
  proposed no `depends_on` because no import edges exist. It noticed the
  strongest product statement in the repository — *"We do not auto-publish"* —
  and declined to treat it as an established fact without confirmation.
- **It does not fabricate.** With an empty vault it said so.
- **The Agents screen is the strongest surface in the journey.** It states its
  current state and the next action together (`0/2 connection files ready ·
  Next: create .mcp.json`), names its boundary honestly ("opens no port and makes
  no network request"), and anticipates the exact failure ("opening from another
  code folder needs an absolute path").

## Quality is uneven along the path

Three clicks in is markedly better than the entrance. A first-time reader judges
before reaching the good part.

## Diagnostics, not scores

`analyze_repo_structure` was called six times in a seven-file repository, in each
of the first two turns.

## Not claimed

Whether this person wants the product, returns to it, or recommends it. Only
observable stalls are recorded here.
