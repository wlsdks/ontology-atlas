# Triage Labels

Engineering skills use five canonical triage roles. Map each role to the same label name in GitHub Issues.

| Role | GitHub label | Meaning |
| --- | --- | --- |
| `needs-triage` | `needs-triage` | A maintainer needs to evaluate the issue. |
| `needs-info` | `needs-info` | The issue is waiting for more information from the reporter. |
| `ready-for-agent` | `ready-for-agent` | The issue is fully specified and can be handled without additional human context. |
| `ready-for-human` | `ready-for-human` | The issue requires human implementation or judgment. |
| `wontfix` | `wontfix` | The issue will not be actioned. |

Use the mapped label whenever a skill refers to the corresponding role. Label creation is an explicit repository-maintenance action; do not create missing GitHub labels as a side effect of ordinary implementation work.
