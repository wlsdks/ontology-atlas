# PRODUCT OWNER OPERATING SYSTEM

> Purpose: keep Ontology Atlas from becoming a feature factory. Every feature,
> design change, graph interaction, MCP tool, CLI command, and macOS workflow
> must pass this product-owner lens before implementation is treated as valuable.

Ontology Atlas does not need a backlog clerk. It needs a product owner that
protects the product's monopoly-grade wedge:

> A local-first ontology workbench where people and AI agents share one
> git-backed meaning model of a product/system.

The PO's job is to maximize that value, not to approve more surface area.

## Non-Negotiable Operating Rule

Before product, UX, graph, MCP, CLI, workflow, or macOS-shell work starts, the
agent or contributor must pass the PO gate in this document. If the PO pass is
weak, the correct move is to clarify the user moment, simplify the existing
surface, or cut scope. Shipping a feature without this pass is treated as
unshaped output, not product progress.

The PO can be represented by several lenses, but the final decision is singular:
what maximizes Ontology Atlas's value as the local-first ontology workbench that
people and AI agents cannot replace with Obsidian, a generic graph database, raw
docs, or a chat context dump?

## Reference Lineage

This operating system combines well-tested product ideas and adapts them to
Atlas's local-first ontology context. These references were web-checked on
2026-06-13; keep the ideas, not the brand theater:

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

One accountable PO decision is required, but the decision must be tested through
these lenses:

- Accountable Value Owner: maximizes product value and owns the final ordering
  decision. No committee compromise, no "we can add it because it is easy."
- Customer-Problem Editor: writes the target user, moment, current alternative,
  and pain before allowing feature names.
- Ontology Steward: protects concepts, relations, evidence, ownership,
  dependency, impact, provenance, and agent handoff as first-class product
  objects.
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
- DHM Strategist: asks whether the slice delights the target user, becomes
  harder to copy because it compounds in the local ontology, and strengthens the
  project enough to justify continued investment.
- First-Principles Skeptic: reduces the request to the underlying problem,
  constraints, and necessary objects before copying familiar product patterns.
- Craft Steward: requires the shipped experience to feel like a serious macOS
  workbench, including hierarchy, density, motion, accessibility, and responsive
  stability.
- Local-First Guardian: preserves git-backed markdown as the source of truth,
  with no backend, login, opaque sync, or hidden cloud dependency unless a
  written exception proves local-first is insufficient.

If these lenses disagree, choose the smallest slice that best improves the
ontology-to-agent workflow. Do not average the opinions into a bigger feature.

## PO Operating Loop

Use this loop for every non-trivial Atlas change:

1. Name the user moment before naming the feature.
2. Identify the current substitute the user already has.
3. Map the journey from source material to ontology understanding to agent
   handoff.
4. Decide which ontology object becomes clearer: concept, relation, evidence,
   provenance, impact, ownership, health, or update path.
5. Choose the smallest integrated slice that improves that journey.
6. Cut or quiet any surface that does not support the slice.
7. Define verification in the shipped runtime, with installed macOS app evidence
   whenever desktop UX is affected.
8. After shipping, report whether the outcome changed, not only what files
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
5. Agent value: Which MCP, CLI, CodeGraph, or handoff workflow becomes easier for
   Claude Code, Codex, Cursor, or another agent?
6. Outcome: What behavior should change after release? Prefer "users can trace
   X without reading source" over "add a panel."
7. Evidence: What user report, screenshot, dogfood run, metric, or repeated
   failure supports this?
8. Riskiest assumption: Is the main risk value, usability, feasibility,
   viability, performance, or trust?
9. Appetite and slice: How much time is worth spending, and what is the smallest
   integrated slice that proves the value?
10. Simplification: What can be removed, merged, hidden, or made quieter instead
    of adding another control?
11. Verification: What must be proven in the built app, especially macOS app
    deployment/relaunch, responsive layout, graph readability, and agent handoff?

If the answers are weak, do discovery, simplify an existing surface, or fix the
highest-friction workflow before adding new product surface.

## Fast PO Pass for AI Agents

When an AI agent is about to implement product, UX, graph, MCP, CLI, workflow,
or macOS-shell work, it should write a compact pass in the working update before
editing files:

```md
PO pass: This helps [user/moment] move from [current alternative] to [ontology
understanding or agent handoff]. The irreplaceable value is [concept/relation/
evidence/impact/provenance/update path]. I will keep the slice to [scope],
simplify [surface], and verify with [runtime evidence].
```

If the agent cannot fill this in concretely, it should not start building. It
should inspect the product context, ask a focused question, or remove friction
from an existing workflow instead.

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
  HUD, motion, and selection affordance must help a user understand the ontology
  or prepare an agent handoff.
- A relation is a product object, not a line. Its type, direction, provenance,
  strength, confidence, review state, evidence, and impact should be
  understandable when the user needs them and quiet when they do not.
- Relationship quality belongs in the ontology system when it explains trust or
  action. Prefer explicit relation attributes such as `type`, `direction`,
  `provenance`, `evidence`, `strength`, `confidence`, `review`, and `impact`
  over vague "AI relevance" scores. Scores can rank attention; they must not
  replace typed meaning.
- Graph-database inspiration is useful, but Atlas's differentiator is source
  backed meaning. Nodes and edges may behave like property-graph objects, yet the
  authoritative representation remains human-reviewable markdown frontmatter.
- Agent handoff is a first-class outcome. A feature that looks good but cannot
  produce clearer MCP/CLI/Codex next steps is incomplete for Atlas.
- Local-first trust beats collaboration theater. Do not introduce accounts,
  sync, opaque AI storage, or network assumptions without a written product
  decision explaining why local git-backed markdown is insufficient.
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
