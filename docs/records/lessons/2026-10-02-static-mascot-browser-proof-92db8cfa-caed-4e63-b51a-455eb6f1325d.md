---
id: 92db8cfa-caed-4e63-b51a-455eb6f1325d
date: 2026-10-02
kind: tool-efficiency
status: reported
harness_area: verification
---
**Observed**: The first changed-check E2E pass succeeded through eight companion cases, then its localhost:3100 server disappeared and later page.goto calls failed with ERR_CONNECTION_REFUSED. A manual next dev on port 3014 and a native static build were active in the same checkout. Different ports did not isolate Next output or process lifetime.
**Cost**: One 96-case local E2E attempt; 8 passed before the server failure. No CI round used.
**Suspected cause**: Concurrent development/build activity or server lifetime in the shared checkout. The exact termination cause was not measured.
**Proposed change**: none — finish the static export, then run required browser checks with PLAYWRIGHT_STATIC=1 on a dedicated port and retain server logs. Do not diagnose application behavior from refused-connection failures.
