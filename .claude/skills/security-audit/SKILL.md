---
name: security-audit
description: Periodic security sweep of Atlas in four areas (MCP and CLI, the Tauri desktop shell, the web renderer and connectors, the supply chain and CI) that follows untrusted input to what it can reach, proves each reach with a planted input, and turns every confirmed finding into a fix slice with a regression test. Not for a single diff, which takes the reviewer's security lens.
---

# security-audit

Follow the [shared workflow](../../../.agents/skills/security-audit/workflow.md) at the requested or routed scope.
Read supporting references only for the current phase.

Use Claude's named `reviewer` and `product-planner` when the workflow requires
them. Planned implementation uses `implementer`; uncertain work uses `planner`
or `investigator`. Keep the existing agent effort tiers.
