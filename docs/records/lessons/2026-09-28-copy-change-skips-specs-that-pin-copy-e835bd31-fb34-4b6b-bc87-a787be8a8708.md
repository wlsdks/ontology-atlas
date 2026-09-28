---
id: e835bd31-fb34-4b6b-bc87-a787be8a8708
date: 2026-09-28
kind: gate-gap
status: reported
harness_area: checks-changed
---
**Observed**: #2158 changed 150 message strings (node → concept). `pnpm checks:changed -- --run` passed 33 of 33 locally, and the landing train then failed `tests/e2e/map-keyboard-walk.spec.ts:313` (a `getByText` regex over part of the old Korean dead-end sentence) and `tests/e2e/map-smoke.spec.ts:90` (`getByText("Node not found: missing-xyz")`) on every retry (run 36459576427, shards 1/5 and 4/5). Neither spec was selected for a messages-only diff, and my own pin sweep missed both because it looked for the start of each old catalog value, not for a fragment or the value rendered with its placeholder filled.
**Cost**: one landing-train ejection and a second push; about 40 minutes.
**Suspected cause**: the message catalog maps to the vitest suites that import the composite, not to e2e specs that hard-code copy, and specs that pin literal copy are invisible to both.
**Proposed change**: script: when message parts change, `suggest-focused-checks` also selects the e2e specs whose string or regex literals match a removed or rewritten value, matching substrings and the value with `{placeholders}` as wildcards.
