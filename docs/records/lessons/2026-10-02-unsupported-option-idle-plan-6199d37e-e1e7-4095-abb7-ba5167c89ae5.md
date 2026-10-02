---
id: 6199d37e-e1e7-4095-abb7-ba5167c89ae5
date: 2026-10-02
kind: gate-gap
status: reported
harness_area: focused-checks
---
**Observed**: `pnpm checks:changed -- --json` exited successfully while reporting one changed path and no focused mapping. The unsupported option was treated as a path. The working tree actually had more than twenty changed paths; the supported `pnpm checks:changed` invocation returned the required checks. No claim of passing checks was based on the empty result.

**Cost**: One misleading planning call; elapsed time and token cost were not separately measured.

**Suspected cause**: The command accepts path arguments and does not reject an unsupported option-looking argument before building its inventory.

**Proposed change**: script — reject unsupported options with an actionable error, preserving explicit real path arguments; prove the failure with a nonempty changed-file fixture. Until that separate gate change is reviewed, use the documented invocation and inspect the changed-path count.
