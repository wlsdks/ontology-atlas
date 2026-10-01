---
id: cde86129-d9b7-4944-a408-2a6f97276176
date: 2026-10-01
kind: tool-efficiency
status: reported
harness_area: decisions
---
**Observed**: `docs/records/README.md` says the decision template is printed by `pnpm decisions:check -- --template`; running it prints `[decisions] unknown argument: --template` and exits 1, because `parseArgs` (`scripts/check-decision-record.mjs:153`) rejects the flag before line 154 checks for it. The template had to be read from `scripts/lib/decision-record-template.mjs` instead.
**Cost**: two extra tool calls while writing a decision record; unknown across sessions.
**Suspected cause**: the `--template` branch was added after `parseArgs` started rejecting unknown flags, and nothing runs the documented command.
**Proposed change**: script — test `process.argv.includes("--template")` before `parseArgs`, or let `parseArgs` accept it, and add the documented command to the script's test.
