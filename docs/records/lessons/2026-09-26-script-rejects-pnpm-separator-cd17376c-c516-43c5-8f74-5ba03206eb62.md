---
id: cd17376c-c516-43c5-8f74-5ba03206eb62
date: 2026-09-26
kind: mistake
status: reported
harness_area: scripts
---
**Observed**: the messages-split slice reported "`pnpm messages:build -- --check` passes", yet that exact command exited 2 with "unexpected arguments: -- --check": pnpm passes the `--` separator through and the new script rejected it. The slice had run the flag without the separator.
**Cost**: a documented command that fails for everyone who copies it; caught only in the lead's re-merge.
**Suspected cause**: a new script's argument parser did not ignore `--`, and the proof ran a different spelling than the one documented.
**Proposed change**: script: ignore `--` in scripts/build-messages.mjs, with a test; skill: a slice report quotes the command exactly as it was run.
