---
name: po-pass
description: Assess Atlas product behavior, public contracts, or truth and approval boundaries before implementation. Skip behavior-preserving maintenance.
---

# po-pass

Follow the [shared workflow](../../../.agents/skills/po-pass/workflow.md) at the requested or routed scope.
Read supporting references only for the current phase.

## 5. Write one screen

Keep these facts in the existing rationale, without repeating them in a ledger:

```md
## Atlas product pass — <decision>

**Prior decision**: <standing record or none; conditions rechecked>
**Human loss and moment**: <actor, problem, exact moment>
**Atlas outcome**: <one outcome and observable behavior>
**Evidence state**: <observed / inferred / unknown and primary evidence>
**Change signals**: <signals and all four boundary assessments>
**Computed route**: <router output and reasons>
**Recovery proof**: Given …; fail when …
**Decision**: <stop / probe first / build and verify and scope>
```


Use Claude's named `reviewer` and `product-planner` when the workflow requires
them. Planned implementation uses `implementer`; uncertain work uses `planner`
or `investigator`. Keep the existing agent effort tiers.
