---
id: c74e13eb-3329-4636-9750-1a9faf48b89e
date: 2026-09-27
kind: tool-efficiency
status: reported
harness_area: e2e
---
**Observed**: After merging current main, `pnpm checks:changed -- --run` used Playwright's default `http://127.0.0.1:3100`. The first two question-desk cases read an older Library graph without `library-question-desk`; later cases returned `net::ERR_CONNECTION_REFUSED`. The run produced no WebServer startup output. Evidence: `/tmp/atlas-question-final-proof/integrated-checks.log` and the corresponding Playwright error contexts.
**Cost**: One interrupted local E2E recommendation; elapsed cost unknown.
**Suspected cause**: The default port was temporarily occupied by a reused server whose content and lifetime were not owned by this verification run. The exact server process was no longer present when inspected.
**Proposed change**: none. Apply the existing testing rule: build the integrated tree and run the static-export E2E gate on a free task-specific `PLAYWRIGHT_BASE_URL`, allowing Playwright to own the server lifetime.
