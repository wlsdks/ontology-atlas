---
name: integrate
description: Carry parallel slices to main through one integration branch: `pnpm integration:start` before the fan-out, `pnpm integration:add` as each slice returns (merge --no-ff, slice-only checks), `pnpm integration:pr` for the one draft, `pnpm pr:land` for the one CI run, then `pnpm integration:prune`. Not for a single branch.
---

# integrate

Follow the [shared workflow](../../../.agents/skills/integrate/workflow.md) at the requested or routed scope.
Read supporting references only for the current phase.

Use Claude's named `reviewer` when the workflow requires one, and
`implementer` for a fix on the integration branch. Keep the existing agent
effort tiers.
