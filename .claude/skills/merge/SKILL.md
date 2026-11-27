---
name: merge
description: Review a returned slice or a ready branch (one independent review when due, one fix round) and merge a single branch into main with `pnpm pr:land`, then prune what main's history holds. Parallel slices merge through `/integrate`.
---

# merge

Follow the [shared workflow](../../../.agents/skills/merge/workflow.md) at the requested or routed scope.
Read supporting references only for the current phase.

Use Claude's named `code-reviewer` and `spec-writer` when the workflow requires
them, and `design-reviewer` for a design verdict or mockup. Planned
implementation uses `implementer`; unplanned work uses `slice-planner`, a
reproduced failure `investigator`, and a research question `researcher`. Keep
the existing agent effort tiers.
