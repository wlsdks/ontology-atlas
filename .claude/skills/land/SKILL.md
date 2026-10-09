---
name: land
description: Take returned or ready branches to main: one independent review, one fix round, `pnpm pr:land` for one branch or a train or integration bundle for several, then prune only what landed.
---

# land

Follow the [shared workflow](../../../.agents/skills/land/workflow.md) at the requested or routed scope.
Read supporting references only for the current phase.

Use Claude's named `reviewer` and `product-planner` when the workflow requires
them. Planned implementation uses `implementer`; unplanned work uses `planner`,
and a reproduced failure `investigator`. Keep the existing agent effort tiers.
