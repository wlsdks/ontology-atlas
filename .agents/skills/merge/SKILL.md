---
name: merge
description: Merge returned or ready branches into main: one independent review, one fix round, then `pnpm pr:land` for each branch (it queues them and merges green ones behind one CI run) or an integration bundle when they must be resolved together; prune only what main contains.
---

# merge

Follow the [shared workflow](workflow.md) at the requested or routed scope.
Read supporting references only for the current phase.

Use the applicable briefs in `.agents/agents/`; inherit the session model,
effort and available capabilities. A brief's access boundary grants no permission.
