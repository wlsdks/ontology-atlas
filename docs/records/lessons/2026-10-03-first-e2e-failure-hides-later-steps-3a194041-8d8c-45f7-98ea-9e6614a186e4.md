---
id: 3a194041-8d8c-45f7-98ea-9e6614a186e4
date: 2026-10-03
kind: tool-efficiency
status: reported
harness_area: checks-changed
---
**Observed**: on `fix/flat-dial-round-c` (2026-10-03), `PLAYWRIGHT_STATIC=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:4243 pnpm checks:changed -- --run` merged all 131 planned Playwright tests into step 3; one flaky spec failed and the run stopped, leaving steps 4 to 64 unrun. The agent had to strip the Playwright lines from the plan and run the other 62 steps by a hand-written script.
**Cost**: about 40 minutes per occurrence; it happened on three rounds of the same branch.
**Suspected cause**: the runner stops at the first failing step, and the merged Playwright step is both the longest and the flakiest, so it hides every cheaper check behind it.
**Proposed change**: script, `checks:changed -- --run` runs the non-Playwright steps first (or continues past a failing step and reports every step's result), and exits non-zero at the end if any failed.
