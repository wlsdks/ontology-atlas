---
name: security-audit
description: Periodic security sweep of Atlas in four areas (MCP and CLI, the Tauri desktop shell, the renderer and connectors, the supply chain and CI) that follows untrusted input to what it can reach, proves each reach with a planted input, and turns every confirmed finding into a fix slice with a regression test. Not for a single diff, which takes the code-reviewer's security lens.
---

# security-audit

Follow the [shared workflow](../../../.agents/skills/security-audit/workflow.md) at the requested or routed scope.
Read supporting references only for the current phase.

Use Claude's named `code-reviewer` and `spec-writer` when the workflow requires
them, and `design-reviewer` for a design verdict or mockup. Planned
implementation uses `implementer`; unplanned work uses `slice-planner`, a
reproduced failure `investigator`, and a research question `researcher`. Keep
the existing agent effort tiers.
