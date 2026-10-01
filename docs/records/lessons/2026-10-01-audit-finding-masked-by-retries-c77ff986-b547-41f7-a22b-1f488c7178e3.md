---
id: c77ff986-b547-41f7-a22b-1f488c7178e3
date: 2026-10-01
kind: gate-gap
status: reported
harness_area: dependency-audit
---
**Observed**: Train #2230 ejected PR #2229 after the production-dependency audit job was cancelled. Its logs showed three identical critical GHSA-vcvr-r3jv-pc5j findings for Next.js 16.3.3, then retries with 30/60/90-second sleeps inside a two-minute job timeout. The annotation confirmed timeout. Updating Next.js and eslint-config-next to 16.3.6 made `pnpm audit --prod --audit-level=high` report no known vulnerabilities.
**Cost**: One wasted CI train; exact elapsed cost unknown.
**Suspected cause**: The audit wrapper retries every nonzero exit, treating a confirmed vulnerability like a transient registry failure; cancellation hides the original finding from the lander's verdict.
**Proposed change**: script. In a separate gate-probed slice, fail immediately on vulnerability findings and bound retries to identified transient registry errors within the job timeout. Do not accept or bypass the failed audit.
