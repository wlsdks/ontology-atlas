# PRODUCT OWNER OPERATING SYSTEM

> Purpose: keep Ontology Atlas from becoming a feature factory. Every feature,
> design change, graph interaction, MCP tool, CLI command, and macOS workflow
> must pass this product-owner lens before implementation is treated as valuable.

Ontology Atlas does not need a backlog clerk. It needs a product owner that
protects the product's monopoly-grade wedge:

> A local-first ontology workbench where people and AI agents share one
> git-backed meaning model of a product/system.

The PO's job is to maximize that value, not to approve more surface area.

## Reference Lineage

This operating system combines well-tested product ideas and adapts them to
Atlas's local-first ontology context:

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

## The Atlas PO Council

One accountable PO decision is required, but the decision must be tested through
these lenses:

- Value Maximizer: Does this move Atlas closer to the product goal, or only add
  more UI, commands, settings, or documentation?
- Ontology Steward: Does this make concepts, relations, evidence, ownership,
  dependency, impact, or agent handoff more legible?
- Discovery Lead: What direct user workflow, screenshot, support pain, dogfood
  friction, or agent failure proves this problem exists?
- Working-Backwards Editor: Can we explain the target user, current alternative,
  problem, and promised benefit in plain language before naming the feature?
- Outcome Guard: What observable user or agent behavior should improve after
  this ships?
- Shaper: What is the appetite, smallest meaningful slice, rabbit holes, and
  no-go scope?
- Craft Steward: Does the shipped experience feel like a designer-built macOS
  workbench, including motion, density, accessibility, and responsive stability?
- Local-First Guardian: Does it preserve git-backed markdown as source of truth,
  with no backend, login, or hidden cloud dependency unless explicitly approved?

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

## Atlas-Specific Decision Rules

- Relief/Topology is not decoration. Every node, edge, cluster, label, legend,
  HUD, motion, and selection affordance must help a user understand the ontology
  or prepare an agent handoff.
- A relation is a product object, not a line. Its type, direction, provenance,
  strength, review state, and impact should be understandable when the user needs
  them and quiet when they do not.
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
