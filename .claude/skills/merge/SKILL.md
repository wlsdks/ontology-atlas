---
name: merge
description: Merge returned or ready branches into main: read each slice, one independent review when one is due, one fix round; a single branch merges with `pnpm pr:land`, parallel slices merge into one integration branch as each returns and reach main as one pull request with one CI run; then prune everything main provably contains.
---

# merge

Follow the [shared workflow](../../../.agents/skills/merge/workflow.md) at the requested or routed scope.
Read supporting references only for the current phase.

Use Claude's named `reviewer` and `product-planner` when the workflow requires
them. Planned implementation uses `implementer`; unplanned work uses `planner`,
and a reproduced failure `investigator`. Keep the existing agent effort tiers.
