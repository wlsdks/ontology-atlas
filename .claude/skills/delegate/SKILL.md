---
name: delegate
description: Before handing work to parallel agents: generate the brief with `pnpm brief:new` (port, owned files, scratch, checks, landing) and add the task, decisions and acceptance. Not for work a few tool calls finish.
---

# delegate

Follow the [shared workflow](../../../.agents/skills/delegate/workflow.md) at the requested or routed scope.
Read supporting references only for the current phase.

Use Claude's named `reviewer` and `product-planner` when the workflow requires
them. Planned implementation uses `implementer`; unplanned work uses `planner`,
and a reproduced failure `investigator`. Keep the existing agent effort tiers.
