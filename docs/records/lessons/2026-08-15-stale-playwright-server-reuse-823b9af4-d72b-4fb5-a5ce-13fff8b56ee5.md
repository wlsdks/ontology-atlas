---
id: 823b9af4-d72b-4fb5-a5ce-13fff8b56ee5
date: 2026-08-15
kind: mistake
status: reported
harness_area: playwright
---
**Observed**: Playwright `reuseExistingServer` picked up a dev server on :3100 started the previous day. A new spec reported three consecutive defects that were measurements of old code; a manual browser repro passed at once. Recurred 2026-09-19: the :3100 server belonged to another worktree, and a new e2e case was green on its own port and red in the `checks:changed` lane.
**Cost**: Three false defect reports, then a second investigation on recurrence.
**Suspected cause**: A long-lived or foreign dev server on the shared default port is silently reused.
**Proposed change**: skill: every browser run uses its own `PLAYWRIGHT_BASE_URL` port; before debugging a spec that disagrees with fresh code, check `lsof -nP -iTCP:3100 -sTCP:LISTEN` and the process start time.
