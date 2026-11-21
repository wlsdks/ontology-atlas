---
name: integrate
description: Carry parallel slices to main through one integration branch: `pnpm integration:start` before the fan-out, `pnpm integration:add` as each slice returns (merge --no-ff, slice-only checks), `pnpm integration:pr` for the one draft, `pnpm pr:land` for the one CI run, then `pnpm integration:prune`. Not for a single branch.
---

# integrate

Follow the [shared workflow](workflow.md) at the requested or routed scope.
Read supporting references only for the current phase.

Use the applicable briefs in `.agents/agents/`; inherit the session model,
effort and available capabilities. A brief's access boundary grants no permission.
