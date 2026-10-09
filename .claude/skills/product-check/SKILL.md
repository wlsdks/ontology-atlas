---
name: product-check
description: Before a change to product behavior, a public contract, or what Atlas treats as true, sent or approved: route it with `pnpm po:route` and decide stop, probe first, or build. Skip behavior-preserving maintenance.
---

# product-check

Follow the [shared workflow](../../../.agents/skills/product-check/workflow.md) at the requested or routed scope.
Read supporting references only for the current phase.

Use Claude's named `reviewer` and `product-planner` when the workflow requires
them. Planned implementation uses `implementer`; unplanned work uses `planner`,
and a reproduced failure `investigator`. Keep the existing agent effort tiers.
