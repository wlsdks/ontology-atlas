# PRODUCT OWNER OPERATING SYSTEM

> Purpose: keep Ontology Atlas from becoming a feature factory — a project that
> counts what it shipped instead of asking whether anything got better. Every
> feature, design change, graph interaction, MCP tool, CLI command, and macOS
> workflow must pass this product-owner lens (렌즈 — 결정을 통과시키기 전에
> 반드시 물어야 하는 고정 질문 하나) before anyone treats the implementation as
> valuable.

Ontology Atlas does not need a backlog clerk. It needs a product owner who
protects the one thing no other tool can copy — this document calls it the
**wedge** (쐐기 — 다른 도구로는 대신할 수 없는, 이 제품만의 한 가지):

> A local-first ontology workbench where people and AI agents share one
> git-backed meaning model of a product/system.

The PO's job is to make that one thing more valuable, not to approve more
screens, panels, and buttons.

## The PO We Are Creating

Atlas's PO is not a persona with taste. It is an operating role with authority.
It combines seven jobs that famous product traditions usually split apart:

1. **One accountable owner** from Scrum: one person owns value ordering. Many
   voices can influence the backlog, but final product judgment cannot become a
   committee average.
2. **Problem setter** from empowered product teams: the team gets an important
   problem and the authority to find the solution, instead of a list of UI
   requests to ship.
3. **Customer-back narrator** from Working Backwards: the first draft explains
   the customer, their current pain, and the future experience in plain
   language before naming implementation.
4. **Discovery mapper** from continuous discovery: every solution should map to
   an outcome, opportunity, and assumption that can be tested by dogfood
   (도그푸드 — 우리가 만든 것을 우리가 직접 써 보는 것), user-report, screenshot,
   or runtime evidence.
5. **Shaper** from Shape Up: before implementation starts, this person fixes the
   **appetite** (이 문제에 쓸 시간의 상한 — "얼마나 걸릴까"가 아니라 "얼마를 쓸
   가치가 있나"), the **no-gos** (이번에는 건드리지 않기로 못박은 것), the
   **rabbit holes** (파고들면 시간을 다 잡아먹는 지점), and the smallest
   **integrated slice** (슬라이스 — 그것 하나만으로도 처음부터 끝까지 동작하는
   가장 작은 한 덩어리. 따로 노는 조각이 아니다).
6. **Craft bar-raiser** from Rams, Tufte, and Linear: the product should become
   more useful, easier to understand, less noisy, richer in true information per
   screen, and faster to operate. Visual finish is part of usefulness, not
   decoration.
7. **Ontology steward** unique to Atlas: the PO protects typed meaning —
   concepts, relations, provenance (출처 — 이 사실이 어디서 왔는지), evidence,
   strength, confidence, impact, ownership, and handoff (핸드오프 — 다음 사람이나
   AI 에이전트가 되묻지 않고 곧바로 이어서 할 수 있는 다음 행동). If a change
   does not improve the shared human-and-agent meaning model, it is not
   important product work.

The result should feel stricter than a backlog process and more practical than
strategy prose: a contributor can run the gate (게이트 — 통과해야만 다음 단계로
갈 수 있는 검사 지점) in under two minutes, but weak work should fail
immediately.

## Chief PO Standard

The Atlas PO should behave less like a ticket writer and more like a founder's
chief product officer for one narrow product the company believes in deeply.
The question a change has to pass is not "is this reasonable?" It is:

> Does this make Atlas more necessary for the exact moment where a person and an
> AI agent need to understand, trust, or change a product/system ontology?

The PO must be willing to say no to a feature request, and to disappoint the
person who asked, in order to protect the core workflow. A request can be true,
urgent, and still not worth building if it does not deepen the wedge. The best
PO decision often looks like one of these:

- **clarify the problem** before accepting the requested solution;
- **remove or hide** a control that makes the ontology harder to read;
- **improve a core interaction** rather than adding a new mode;
- **ship a narrower slice** that proves the behavior in the installed app;
- **decline the work** because it is only a nicer version of a generic note app,
  graph viewer, dashboard, or AI wrapper.

For Atlas, product excellence needs all four of these at once:

1. **Problem insight**: the PO can name the phenomenon (현상 — 화면이나 볼트에서
   실제로 일어나는 일. 의견이 아니라 남이 다시 확인할 수 있는 관찰) and why it
   matters before naming the implementation.
2. **Ontology leverage**: the change makes concepts, relations, evidence,
   provenance, impact, ownership, or update paths clearer.
3. **Agent leverage**: the change leaves Claude Code, Codex, Cursor, or another
   MCP/CLI agent with a better next action than it had before.
4. **Runtime proof**: someone verified the improvement in the surface that
   actually ships, and in the installed macOS app whenever desktop UX changes.

## Phenomenon-First Command Style

The PO should translate every directive into a problem statement before it
becomes engineering work. This matters most when a request gets the feeling
right but is already written as a solution: "this looks wrong," "make Sigma
dynamic," "the panel is too small," "add relationship scoring," "Obsidian with
AI is strong," or "use graph DB ideas." Those sentences are valid signals, not
yet product specs.

The command style should therefore be:

```txt
I observe [specific shipped behavior].
This hurts [target user or agent] during [moment].
The failed substitute is [current tool/workaround].
Atlas should make [ontology object or handoff] clearer by [outcome].
The smallest slice is [one integrated change].
We will know it worked when [runtime evidence].
```

Do not start with a component, library, mode, panel, animation, AI feature, or
metric. Start with the phenomenon. A good PO can still choose the user's
suggested solution, but only after proving why that solution is the best way to
change the observed moment.

For Ontology Atlas, the highest-value phenomena usually look like one of these:

- a person cannot read the product/system meaning because topology cards,
  panels, labels, or relations fight for attention;
- a relation is visible as a line but not understandable as a typed, sourced,
  actionable ontology fact;
- a developer or AI agent can inspect the graph but cannot turn the result into
  a next MCP/CLI command, vault update, or validation gate;
- a local-first trust promise is weakened by state the user cannot see, by an
  app build nobody rebuilt, or by checking the change somewhere other than where
  it actually ships — the browser instead of the installed app;
- a workflow duplicates Obsidian, Notion, a graph database, or chat context
  instead of using the one thing only Atlas has — an ontology that runs from
  business meaning down to the code that implements it.

## Non-Negotiable Operating Rule

Before product, UX, graph, MCP, CLI, workflow, or macOS-shell work starts, the
agent or contributor must pass the PO gate in this document. The written answer
is called a **PO pass** (패스 — 이 문서의 질문들에 짧게 답해 적어 둔 글. 그 틀은
아래 *Fast PO Pass* 에 있다). If the pass is weak, the contributor clarifies the
user moment, simplifies the existing surface (표면 — 사용자가 보고 만지는 화면 ·
패널 · 명령 하나하나), or cuts scope. Shipping a feature without this pass counts
as work nobody shaped — output, not product progress.

The PO must reason in this order: **observed phenomenon -> user problem ->
success condition -> solution options -> implementation**. A phenomenon is an
observable state such as "dragging one card leaves connected cards behind,"
"the popover covers the control rail," "an agent cannot tell which relation is
source-backed," or "a 14-inch full-screen app makes the panel unreadable."
Until someone has written down that phenomenon and the user problem it causes,
feature names, component names, libraries, mockups, and implementation ideas
are premature.

The PO is allowed to stop implementation. If the current work starts from
"add X," "use Y library," "make it prettier," "ship this panel," or "copy this
pattern" before naming the phenomenon and problem, the work must pause. The
next action is not coding; it is to inspect the target user's moment, capture
evidence, and restate the problem in a way that would still make sense if the
chosen solution changed.

### Feature Request Translation Protocol

When a user, contributor, or agent asks for a solution, the PO translates it
before implementation. Use this protocol for requests such as "make it prettier,"
"add a plugin," "use Sigma better," "make the panel bigger," "add AI," or
"support graph DB-style relations."

1. **Quote the request as a symptom**, not as the solution.
2. **Name the observed phenomenon** in the shipped product, screenshot, dogfood
   run, vault state, MCP output, or test failure.
3. **Name the target user moment** (모먼트 — 그 사람이 그 일을 하고 있는 구체적인
   시점): planner, marketer, leadership reviewer, developer, or AI agent; first
   contact, graph reading, relation proof, handoff, edit, or verification.
4. **State the current substitute** and why it is insufficient: Obsidian,
   Notion, raw markdown, graph DB tools, source search, Claude/Codex context, or
   manual reasoning.
5. **Choose build, reshape, cut, or investigate**. Building is allowed only when
   the problem is clear enough that a different solution could also satisfy it.

Example:

```md
Request: "The panel is too small."
Translation: On a 14-inch full-screen macOS app, the Relief panel shows dense
metrics and copy commands before the user can read relation readiness. A planner
cannot decide whether the map is handoff-ready without squinting or scrolling.
The substitute is raw docs or Obsidian search, which loses relation provenance
and agent readiness. Build a narrower overview rail that preserves the primary
graph brief, hides secondary commands, and proves no panel overflow in the
installed app.
```

Several lenses can argue, but only one decision comes out of the PO, and it
answers one question: what makes Ontology Atlas more valuable as the local-first
ontology workbench that people and AI agents cannot replace with Obsidian, a
generic graph database, raw docs, or a chat context dump?

## Reference Lineage

This operating system combines well-tested product ideas and adapts them to
Atlas's local-first ontology context. These references were web-checked on
2026-06-14; borrow the ideas, not the famous names as decoration:

- [Scrum Guide 2020](https://scrumguides.org/scrum-guide.html): the Product
  Owner is accountable for maximizing product value, making the Product Goal and
  Product Backlog clear, ordering work, and remaining one accountable decision
  owner rather than a committee.
- [SVPG - Empowered Product Teams](https://www.svpg.com/empowered-product-teams/):
  strong product teams are assigned problems to solve, not feature lists, and
  are accountable for outcomes that customers love and that work for the
  business.
- [Product Talk - Product Discovery](https://www.producttalk.org/product-discovery/):
  discovery starts from an outcome, then explores opportunities and solutions;
  good teams keep direct customer input and assumption testing in the weekly
  operating rhythm.
- [Jeff Patton - User Story Mapping](https://jpattonassociates.com/story-mapping/):
  build from the user's journey and shared story, not from isolated tickets.
  Atlas work must preserve the path from user moment to ontology object to
  agent action.
- [Working Backwards PR/FAQ](https://workingbackwards.com/resources/working-backwards-pr-faq/):
  start with the customer, define the specific customer segment, state the
  problem in the customer's language, and make the solution directly answer that
  problem instead of listing features.
- [Basecamp Shape Up](https://basecamp.com/shapeup): shape work before building;
  set appetite, name rabbit holes and no-gos, ship one integrated slice, and
  prefer variable scope inside fixed time over open-ended projects.
- [Melissa Perri - Escaping the Build Trap](https://melissaperri.com/book):
  avoid measuring success by shipped outputs; product work must connect customer
  problems, business value, opportunities, and outcome learning.
- [John Cutler - Feature Factory](https://medium.com/@johnpcutler/12-signs-youre-working-in-a-feature-factory-44a5b938d6a2):
  watch for teams that optimize velocity, prioritization ceremony, and feature
  completion while skipping validation, iteration, and product-decision
  retrospectives.
- [Intercom - RICE prioritization](https://www.intercom.com/blog/rice-simple-prioritization-for-product-managers/):
  make priority explicit with reach, impact, confidence, and effort so the team
  can compare valuable work instead of trusting taste or urgency alone.
- [Peter Thiel - Zero to One](https://www.zerotoonebook.com/): seek a monopoly
  wedge, not a marginally better clone; Atlas must own a user workflow that
  generic notes, graph viewers, and AI chat cannot own.
- [Gibson Biddle - DHM strategy](https://gibsonbiddle.medium.com/2-the-dhm-model-6ea5dfd80792):
  product strategy should combine customer delight, hard-to-copy advantage, and
  a model that can sustain continued investment. Atlas translates this as
  "clearer ontology understanding, harder-to-copy agent memory, and local-first
  trust that compounds through the vault."
- [Dieter Rams - Ten Principles for Good Design](https://www.vitsoe.com/us/about/good-design):
  good design is useful, understandable, unobtrusive, honest, thorough, and as
  little design as possible.
- [Edward Tufte - data display principles](https://www.edwardtufte.com/tufte/):
  visual design should increase truthful information density and reduce
  non-informative decoration.
- [First-principles reasoning](https://www.tesla.com/blog/mission-tesla):
  reason from the underlying user problem and system constraints before copying
  product categories, AI-tool conventions, or graph-app defaults.

## The Atlas PO Council

One accountable PO decision is required, but the decision must first be tested
through these lenses. Each lens is one fixed question the decision has to
survive, and nobody skips a lens because it is inconvenient:

- Accountable Value Owner: one person makes the product more valuable and
  decides what gets done first. No committee compromise, no "we can add it
  because it is easy."
- Customer-Problem Editor: writes the target user, moment, current alternative,
  and pain before allowing feature names.
- Ontology Steward: treats concepts, relations, evidence, ownership, dependency,
  impact, provenance, and agent handoff as parts of the product itself, not as
  metadata around it, and protects them.
- Discovery Lead: requires a user report, screenshot, dogfood failure, agent
  failure, metric, or repeated support pain before treating the problem as real.
- Outcome Guard: defines the behavior that should change after release, for a
  person and for an AI agent.
- Shaper: sets appetite, integrated slice, rabbit holes, no-go scope, and what
  can be cut without weakening the outcome.
- Prioritization Analyst: compares reach, impact, confidence, and effort when
  two valuable slices compete.
- Monopoly Strategist: asks whether this deepens Atlas's irreplaceable wedge or
  turns it into a nicer version of a note app, graph viewer, or AI wrapper.
- Experience Mapper: traces the user journey from trigger to decision to
  handoff, and rejects isolated controls that do not improve that path.
- DHM Strategist: asks whether the slice delights the target user, gets harder
  to copy because it keeps piling up inside the user's own local ontology, and
  strengthens the project enough to justify continued investment.
- First-Principles Skeptic: reduces the request to the underlying problem,
  constraints, and necessary objects before copying familiar product patterns.
- Craft Steward: requires the shipped experience to feel like a serious macOS
  workbench, including hierarchy, density, motion, accessibility, and responsive
  stability.
- Local-First Guardian: keeps git-backed markdown as the source of truth, with
  no backend, no login, no sync the user cannot inspect, and no hidden cloud
  dependency, unless a written exception proves local-first is insufficient.

If these lenses disagree, choose the smallest slice that best improves the
ontology-to-agent workflow. Do not average the opinions into a bigger feature.

### The council is five callable agents, not thirteen bullet points

Until 2026-07-27 this section was prose, and prose does not run — nothing in the
build ever checked that anyone had used these lenses. A PO pass in this repo
wrote "없음" into the two rubric rows this document declares fatal (Ontology
value, Agent value), gave itself `Build and verify`, and shipped — because
**no lens had one named owner who had to sign it** (서명 — 그 행의 점수에 자기
이름을 걸고, 틀리면 자기 책임이 되는 것). The thirteen lenses are therefore split
across five standing agents in `.claude/agents/`, and every rubric row now has
exactly one signer:

| Agent | 이름 | Lenses carried | Rubric row signed |
|---|---|---|---|
| `po-evidence` | 근거 | Customer-Problem Editor · Discovery Lead · Outcome Guard | Problem insight · User moment |
| `po-craft` | 결 | Craft Steward · Experience Mapper | Verification |
| `po-steward` | 지킴이 | Ontology Steward · Local-First Guardian | Ontology value · Agent value |
| `po-wedge` | 해자 | Monopoly Strategist · DHM Strategist · First-Principles Skeptic | Differentiation |
| `po-leverage` | 지렛대 | Prioritization Analyst · Shaper | appetite + slice boundary |

자리 이름은 그 자리가 무엇을 보는지를 줄인 말이다 — **근거**(증거가 실제로
있는가) · **결**(만들어진 물건을 열어 봤을 때 어떤가) · **지킴이**(온톨로지와
로컬-퍼스트 약속이 지켜지는가) · **해자**(다른 도구가 따라 하기 어려워지는가) ·
**지렛대**(지금 이걸 할 때인가, 얼마를 쓸 것인가).

**Accountable Value Owner is deliberately not an agent.** It is the human owner,
or the agent acting on their behalf. The council only tries to break the
proposal; it does not vote and it does not own the decision. One person decides
and signs.

Every agent may research the web and run read-only commands, and every agent is
forbidden from stopping at "no" — a blocking opinion must name what to do
instead, at the same level of specificity as the thing it blocked.

`tests/contract/po-council.contract.test.ts` fails the build if a lens listed
above has no owning agent, if a rubric row has zero or multiple signers, or if
the skill and its mirror drift apart. Adding a fourteenth lens to this document
breaks the build until an agent claims it.

### When to convene

**Required** — a new or removed user-facing surface/route; a public contract
change (MCP tool signature, CLI command, vault schema); product direction,
positioning, or the words a stranger reads first; a first public release, or
anything that spends a one-shot reputational resource (한 번밖에 못 쓰는 평판 —
첫인상은 두 번 만들 수 없다); a solo pass scoring under **18/24** or carrying a
fatal zero (치명적 0 — 아래 *PO Quality Rubric* 에서 0이 나오면 안 된다고 못박은
행에 0을 준 것); or the owner asking.

**Not required** — ordinary product work that clears 18+ with no fatal zero on a
solo pass.

**Never** — mechanical work (typos, dependency bumps, CI plumbing, test
fixtures). These are already exempt from the PO gate, and convening a council on
them is the process theater this document warns against (일을 실제로 낫게 하지는
않으면서 절차를 밟았다는 모양만 내는 것).

Protocol, output template, and failure-mode guards live in
`.claude/skills/po-council/SKILL.md` (mirrored at
`.agents/skills/po-council/SKILL.md`). The short form is four steps:

1. The five agents write their positions at the same time, and none of them
   reads another's position first.
2. They rebut each other exactly once. If an agent concedes a point, that
   concession has to change its verdict (평결 — 아래 *PO Verdicts* 의 네 결론 중
   하나); otherwise the concession was not real.
3. One accountable person picks one of the five proposals, or something smaller
   — **never their union**, meaning never all five glued together.
4. That person writes down the strongest losing argument together with the
   observation that would prove it right later (반증 조건 / falsifier — 이 판단이
   틀렸다면 나중에 무엇이 관찰될지 미리 적어 두는 문장).

## Default PO Stance

When in doubt, the PO should be skeptical of additions and aggressive about
clarity:

- Prefer **making one existing workflow excellent** over opening another mode,
  drawer, panel, command, or setting.
- Prefer **typed relation meaning** over generic "smart" relevance. A relation
  should explain what it means, where it came from, how strong it is, and what
  action it supports.
- Prefer **agent-operable proof** over static explanation. A good screen should
  leave behind a useful MCP/CLI/Codex next step.
- Prefer **runtime evidence** over design intent. If the macOS app is the
  shipped experience, the installed app must be rebuilt, relaunched, and checked.
- Prefer **removing cognitive load** over adding help text. A graph that needs
  a paragraph to explain basic state is not yet designed well.
- Prefer **source-backed trust** over AI magic. AI can rank, summarize, and
  propose, but markdown frontmatter and relation evidence remain inspectable.
- Prefer **problem insight over implementation momentum**. A fast change that
  does not sharpen the user's real ontology task is busywork, even if the code
  is correct.

## Problem Insight Bar

The PO pass is strong enough to build only when it answers these five questions
without leaning on the proposed solution:

1. What is the observable phenomenon, in evidence language rather than opinion?
2. Which target user or agent hits it, at what moment in their work?
3. What decision, understanding, trust, or handoff gets worse because of it?
4. Why do the user's current substitutes fail to solve it well enough?
5. What would be visibly or measurably different if Atlas solved it?

If any answer is vague, the PO should not compensate by adding more scope. It
should narrow the observation, inspect the shipped app or vault evidence, or
choose a smaller slice that makes the problem easier to prove.

Bad PO pass:

```md
Make the topology panel bigger and add better controls.
```

Good PO pass:

```md
Observed phenomenon: on a 14-inch full-screen app, the Relief left panel and
legend leave core relation text unreadable while the map remains the main
decision surface. User problem: a planner cannot judge which concept cluster is
handoff-ready without zooming or guessing. Success means the same viewport lets
them read readiness, select a concept, and copy the next agent action without
panel overlap or text clipping.
```

## PO Operating Loop

Use this loop for every non-trivial Atlas change:

1. Name the observed phenomenon before naming the feature.
2. Name the user moment affected by that phenomenon.
3. Identify the current substitute the user already has.
4. Define the problem in user/workflow terms before proposing a solution.
5. Map the journey from source material to ontology understanding to agent
   handoff.
6. Decide which ontology object becomes clearer: concept, relation, evidence,
   provenance, impact, ownership, health, or update path.
7. Choose the smallest integrated slice that improves that journey.
8. Cut or quiet any surface that does not support the slice.
9. Define verification in the shipped runtime, with installed macOS app evidence
   whenever desktop UX is affected.
10. After shipping, report whether the outcome changed, not only what files
   changed.

The loop is intentionally short. A PO pass should make the work sharper, not add
project-management ceremony.

## Mandatory PO Gate

Before building or improving anything user-visible, answer these in the issue,
plan, PR, or agent checkpoint. Small typo fixes can skip this gate; product,
design, graph, CLI, MCP, and workflow changes cannot.

1. User and moment: Who is trying to understand or change a product/system, and
   in what moment?
2. Current alternative: What do they do today in Obsidian, raw docs, graph DB
   tools, source browsing, Claude Code/Codex context, or manual reasoning?
3. Problem: What decision, handoff, or understanding task is slow, ambiguous, or
   error-prone without this change?
4. Ontology value: Which concept, relation, evidence path, impact path, or
   project-to-code meaning layer becomes clearer?
5. Agent value: Which MCP, CLI, source-intelligence, or handoff workflow becomes
   easier for Claude Code, Codex, Cursor, or another agent? CodeGraph, Serena,
   language servers, grep, and built-in source search are optional structural
   tools; Atlas must still work without any one of them. The minimum acceptable
   agent path is plain Claude Code or Codex connected only to Atlas MCP/CLI.
6. Outcome: What behavior should change after release? Prefer "users can trace
   X without reading source" over "add a panel."
7. Evidence: What user report, screenshot, dogfood run, metric, or repeated
   failure supports this?
8. Riskiest assumption: if this fails, where does it fail first — nobody wants
   it (value), nobody can operate it (usability), we cannot build it
   (feasibility), it does not work for the project itself (viability),
   performance, or trust?
9. Appetite and slice: How much time is worth spending, and what is the smallest
   integrated slice that proves the value?
10. Simplification: What can be removed, merged, hidden, or made quieter instead
    of adding another control?
11. Verification: What must be proven in the built app, especially macOS app
    deployment/relaunch, responsive layout, graph readability, and agent handoff?

If the answers are weak, do discovery, simplify an existing surface, or fix the
highest-friction workflow before adding new product surface.

## PO Verdicts

Every non-trivial product pass should end in one of four verdicts (평결 — 그
패스의 결론 한 줄. 아래 넷 중 하나만 쓴다). This stops "sounds good" from quietly
turning into work nobody decided to do.

- **Do not build**: the problem is not real enough, not important enough, or not
  Atlas-specific enough. Capture the learning and stop.
- **Investigate first**: the phenomenon is plausible, but the evidence is weak.
  Inspect the installed app, vault, MCP output, user screenshot, or workflow
  before editing product code.
- **Shape a slice**: the problem is real, but the solution space is still too
  broad. Define appetite, no-gos, smallest integrated slice, and verification
  before implementation.
- **Build and verify**: the problem, user moment, ontology value, agent value,
  simplification, and runtime proof are clear enough to implement now.

The PO should prefer "Investigate first" over speculative implementation and
"Do not build" over generic product sprawl. "Build and verify" is earned by
evidence, not by enthusiasm.

## Fast PO Pass for AI Agents

When an AI agent is about to implement product, UX, graph, MCP, CLI, workflow,
or macOS-shell work, it should write a compact pass in the working update before
editing files:

```md
PO pass: Observed phenomenon: [what is happening]. User problem: [why this
blocks understanding/decision/handoff]. This helps [user/moment] move from
[current alternative] to [ontology understanding or agent handoff]. The
irreplaceable value is [concept/relation/evidence/impact/provenance/update
path]. I will keep the slice to [scope], simplify [surface], and verify with
[runtime evidence].
```

If the agent cannot fill this in concretely, it should not start building. It
should inspect the product context, ask a focused question, or remove friction
from an existing workflow instead.

## PO Quality Rubric

Use this rubric (루브릭 — 여섯 항목을 각각 0 · 2 · 4 기준에 대고 점수 매기는
채점표) to judge whether a PO pass is strong enough. Score each row 0-4. A
buildable pass usually needs **18+ out of 24** and no zero in problem, ontology
value, agent value, or verification.

| Dimension | 0 | 2 | 4 |
|---|---|---|---|
| Problem insight | Starts from a feature or taste | Names a problem but evidence is thin | Names an observed phenomenon and the workflow damage |
| User moment | Generic "users" | One audience named | Specific audience, moment, trigger, and blocked decision |
| Differentiation | Could be any note/graph app | Some Atlas relevance | Deepens local-first ontology + agent-memory wedge |
| Ontology value | No graph meaning improved | Improves a label or view | Clarifies concept, relation, evidence, provenance, impact, ownership, or update path |
| Agent value | No agent consequence | Copy text or command exists | Agent gets a better MCP/CLI/source-intelligence handoff or validation path |
| Verification | Intent-only | Unit or browser check only | Runtime proof matches the affected surface, including installed macOS app when relevant |

If the score is low, do not inflate scope. Sharpen the phenomenon, inspect
evidence, or choose a smaller slice.

## Chief PO Level Evaluation

Use this after writing or revising strategy, specs, plans, or product-facing
agent instructions. The goal is not to sound like a famous PO tradition; it is
to meet the standard those traditions imply.

| Level | Name | Symptoms | Required correction |
|---|---|---|---|
| 1 | Backlog clerk | Turns requests into tickets, mostly asks what to build | Stop implementation; write the phenomenon, target user, and current substitute |
| 2 | Feature PM | Can prioritize features but measures success by shipped output | Add outcome, evidence, and verification against the shipped surface |
| 3 | Problem PO | Names the problem and user moment before solution | Add ontology object, agent handoff, and simplification pressure |
| 4 | Strategic PO | Connects problem, wedge, differentiated workflow, and runtime proof | Tighten appetite and cut any surface that does not deepen the core loop |
| 5 | Atlas Chief PO | Protects one irreplaceable local-first ontology workflow for people and agents, rejects generic product sprawl, and proves each slice in the installed app or matching runtime | This is the bar for non-trivial Atlas work |

A PO pass is **not buildable** below Level 3. Atlas should aim for Level 5 when
touching Relief/Topology, graph semantics, MCP handoff, vault writes, macOS app
UX, or product direction. Level 5 does not mean more process; it means a sharper
decision:

- the phenomenon is observable;
- the target user and moment are concrete;
- the current substitute is named honestly;
- the ontology value is specific to concepts, relations, evidence, provenance,
  impact, ownership, or update paths;
- the agent value gives Claude Code, Codex, Cursor, MCP, CLI, or a structural
  source tool a better next action without making any external code index a
  product dependency;
- plain Claude Code or Codex can still use the slice when Atlas MCP/CLI is the
  only connected tool surface;
- when adding is not necessary, the slice removes something or makes it quieter;
- verification matches the shipped surface and can actually catch a build nobody
  rebuilt, a layout that breaks at another window size, nodes drawn on top of
  each other, or a handoff that quietly stopped matching the product.

## Required Agent Behavior

For AI agents working in this repo, the PO gate is not optional prose. Before
editing product-facing files, the agent must do this:

1. **Read or recall this document.** For a long-running session, a compact
   reread is enough if the current work clearly follows the same gate.
2. **Write a PO pass in the working update.** One paragraph is enough, but it
   must name the user moment, alternative, ontology value, agent value, slice,
   simplification, and verification.
3. **Choose the slice from value, not convenience.** Do not select work because
   the file is nearby or the test is easy.
4. **Use product evidence.** Screenshots, dogfood failures, MCP/CLI/source-tool
   friction, installed-app verification, and user reports outrank internal
   preference.
5. **Check for subtraction.** If the same value can be achieved by deleting,
   merging, resizing, hiding, or rewording, prefer that over adding surface.
6. **End with a PO verdict.** Use Do not build, Investigate first, Shape a
   slice, or Build and verify.
7. **Report outcome language.** Final reports should say what understanding,
   handoff, trust, or verification improved, and whether the result still meets
   the PO rubric.

Mechanical maintenance can skip the full pass only when it does not alter user,
agent, graph, CLI, MCP, workflow, design, or release behavior. Examples:
formatting, typo-only copy correction, dependency lockfile repair, or a test
fixture update that preserves product behavior.

## Prioritization Rule

When several useful ideas compete, score them explicitly instead of following
recency or implementation convenience:

```txt
Priority = (Reach x Impact x Confidence) / Effort
```

Use rough 1-5 values. Confidence must drop when evidence is only taste,
speculation, or internal excitement. Impact must rise only when the slice
improves one of Atlas's core workflows:

- understand a product/system ontology faster;
- inspect relation meaning, evidence, strength, provenance, or impact;
- move from graph understanding to a useful AI-agent handoff;
- safely update the git-backed markdown vault;
- verify the macOS app as the real shipped experience.

If a lower-scoring item protects trust, prevents data loss, fixes a broken core
workflow, or removes major cognitive overhead, it can override the formula. Write
the override down.

## Atlas-Specific Decision Rules

- Relief/Topology is not decoration. Every node, edge, cluster, label, legend,
  HUD, motion, and cue that shows what is selected must help a user understand
  the ontology or prepare an agent handoff.
- A relation is a product object, not a line. Its type, direction, provenance,
  strength, confidence, review state, evidence, and impact should be
  understandable when the user needs them and quiet when they do not.
- Relationship quality belongs in the ontology system when it explains trust or
  action. Prefer explicit relation attributes such as `type`, `direction`,
  `provenance`, `evidence`, `strength`, `confidence`, `review`, and `impact`
  over vague "AI relevance" scores. Scores can rank attention; they must not
  replace typed meaning.
- When evaluating relation quality, ask four graph-database style questions:
  "what are the endpoints?" (선이 어느 노드와 어느 노드를 잇는가), "what is the
  typed predicate?" (그 선이 무슨 관계라고 적혀 있는가), "what properties qualify
  this edge?" (그 관계에 붙은 속성은 무엇인가 — 출처 · 강도 · 확신도 등), and
  "which traversal or handoff depends on it?" (이 선을 따라가는 탐색이나 핸드오프
  중 무엇이 이 선에 기대고 있는가). If one answer is missing, the UI should
  reveal the gap or route the agent to a repair action.
- Graph-database inspiration is useful, but Atlas's differentiator is source
  backed meaning. Nodes and edges may behave like property-graph objects, yet the
  authoritative representation remains human-reviewable markdown frontmatter.
- Agent handoff is an outcome in its own right, not a side effect. A feature
  that looks good but cannot produce clearer MCP/CLI/Codex next steps is
  incomplete for Atlas.
- Local-first trust beats anything that only looks like collaboration. Do not
  introduce accounts, sync, AI storage the user cannot inspect, or network
  assumptions without a written product decision explaining why local git-backed
  markdown is insufficient.
- Source-backed beats magical. AI can suggest, summarize, and route attention,
  but the ontology source of truth remains inspectable markdown plus graph
  relations.
- Design quality is cognition quality. Visual polish is valuable only when it
  reduces ambiguity, prevents overlap, clarifies state, or makes the next action
  obvious.
- One deep workflow beats five shallow features. Prefer making topology ->
  relation inspection -> handoff -> vault update excellent before adding new
  modes.

## Agent Implementation Contract

When an AI agent works in this repo, it must use this PO operating system as a
design gate, not as after-the-fact prose:

- Read this document before user-visible product work.
- Write a compact PO pass before implementation unless the work is a clearly
  mechanical maintenance exception.
- Prefer improving an existing core workflow over adding a new surface.
- Treat macOS app deployment/relaunch verification as required when desktop UX
  is affected.
- Report the product outcome, not only files changed.
- Keep the long-term ontology goal active unless the user explicitly ends it.

## Kill Criteria

Stop, cut, or reshape the work when any of these are true:

- The change mainly exists because the implementation is easy.
- The PR can only describe outputs, not a user or agent outcome.
- It adds a new panel, mode, button, model, or command without retiring or
  simplifying an existing burden.
- It makes the graph prettier while concepts, relations, paths, or handoff stay
  equally unclear.
- It depends on cloud state, login, telemetry, or hosted AI without an explicit
  local-first exception.
- It cannot be verified in the deployed macOS app when the user-facing behavior
  depends on the desktop shell.

## Anti-PO Smells

These are treated as product defects, even when the code works:

- The work starts from a component name instead of a user moment.
- The justification is "users might want this" without evidence or a dogfood
  failure.
- A relation visualization looks prettier but still hides type, direction,
  evidence, or action.
- The UI explains itself with extra text instead of making state visually clear.
- The agent handoff is nothing but a copy button, so it does not help
  Codex/Claude Code decide a next command, MCP query, or vault update.
- The shipped app was not rebuilt after a UI change, so verification used stale
  source or browser state.
- The change increases configurability while weakening Atlas's default product
  opinion.

## PO Decision Record Template

Use this compact template in agent plans, issue descriptions, or PR bodies:

```md
### PO Pass

- User/moment:
- Current alternative:
- Problem:
- Ontology value:
- Agent value:
- Outcome:
- Evidence:
- Riskiest assumption:
- Appetite/slice:
- Simplification:
- Verification:
```

## Definition of Done for Product Work

Product work is done only when:

- the PO gate has a concrete answer or the work is explicitly a maintenance-only
  exception;
- the implementation ships one integrated slice rather than a disconnected
  fragment;
- the user-facing behavior is verified at the right runtime level;
- macOS app changes are deployed, relaunched, and checked in the installed app
  when the desktop user experience is affected;
- docs, ontology notes, and agent handoff instructions are updated when the
  product meaning changed;
- the final report states what improved, how it was verified, what risk remains,
  and which commit/push contains the work.
