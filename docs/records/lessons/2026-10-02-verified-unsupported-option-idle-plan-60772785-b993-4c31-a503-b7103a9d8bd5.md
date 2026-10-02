---
id: 60772785-b993-4c31-a503-b7103a9d8bd5
date: 2026-10-02
lesson: 6199d37e-e1e7-4095-abb7-ba5167c89ae5
status: verified
parents: 6199d37e-e1e7-4095-abb7-ba5167c89ae5
---
**Evidence**: The regression in `scripts/suggest-focused-checks.test.mjs` returned 0 instead of 2 against the original implementation. The real `node scripts/suggest-focused-checks.mjs --json` invocation likewise produced an idle plan. This verifies that an unsupported option was accepted as a filename rather than rejected.
