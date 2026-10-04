---
id: 04db07c0-ed8b-482c-b5de-4662ff391f83
date: 2026-10-04
kind: process
status: reported
harness_area: harness
---
**Observed**: The same repository workflow had diverged across hosts: `.agents/skills/motion-verify/SKILL.md` required a real source at 60 fps minimum, but `.claude/skills/motion-verify/SKILL.md` still selected 30 fps and omitted source cadence checks. `diff -u` exposed the mismatch during the owner's 2026-10-04 cross-harness audit.
**Cost**: duplicate procedure maintenance; time unknown. No claim that a 30 fps proof was accepted during this audit.
**Suspected cause**: Both skill entrypoints carried independent copies of the recording procedure, and an update to one host did not update the other.
**Proposed change**: none; correct the Claude procedure to the authorized 60 fps minimum, and keep shared workflow definitions in an owner guide reached by thin host entrypoints. A broader symlink migration first needs inventory coverage: the current checker ignored a real symlinked fixture despite a readable target.
