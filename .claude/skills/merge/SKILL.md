---
name: merge
description: Merge returned or ready branches into main: one independent review, one fix round, then `pnpm pr:land` for each branch (it queues them and merges green ones behind one CI run) or an integration bundle when they must be resolved together; prune only what main contains.
---

# merge

Follow the [shared workflow](../../../.agents/skills/merge/workflow.md) at the requested or routed scope.
Read supporting references only for the current phase.

Use Claude's named `reviewer` and `product-planner` when the workflow requires
them. Planned implementation uses `implementer`; unplanned work uses `planner`,
and a reproduced failure `investigator`. Keep the existing agent effort tiers.
