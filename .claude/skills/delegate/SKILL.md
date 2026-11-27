---
name: delegate
description: Before handing work to parallel agents: open the integration branch, generate each brief with `pnpm brief:new` (port, owned files, scratch, slice-only checks, no push) and add the task, decisions and acceptance. Not for work a few tool calls finish.
---

# delegate

Follow the [shared workflow](../../../.agents/skills/delegate/workflow.md) at the requested or routed scope.
Read supporting references only for the current phase.

Use Claude's named `code-reviewer` and `spec-writer` when the workflow requires
them, and `design-reviewer` for a design verdict or mockup. Planned
implementation uses `implementer`; unplanned work uses `slice-planner`, a
reproduced failure `investigator`, and a research question `researcher`. Keep
the existing agent effort tiers.
