---
id: 77a57e2a-50bd-48bd-8815-81c7c7dcd9af
date: 2026-10-02
kind: mistake
status: reported
harness_area: frontend-testing
---
**Observed**: The first checks:changed -- --run invocation inherited no PLAYWRIGHT_STATIC flag. Its recommended browser lane started Next development mode and passed18 cases. This is development evidence, not the static-export proof required by .claude/rules/testing.md. A fresh pnpm build and a final run with PLAYWRIGHT_STATIC=1 and a task-owned port are required; the earlier pass is not reused as CI-mode proof.
**Cost**: One extra browser run,87.5seconds in the first focused-check log; no CI round. Source review afterward also added three genuine regression RED cases before final verification.
**Suspected cause**: The focused-check runner inherits the caller environment and does not select static mode or build a fresh export for the caller.
**Proposed change**: none. Prepare the current export and pass the static flag plus an owned base URL when a checks:changed recommendation includes Playwright. Wait for the whole check process before editing or rebuilding.
