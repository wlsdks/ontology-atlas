---
id: ed883a4f-2b96-42bb-ace2-3eeec3fbde79
date: 2026-09-27
kind: gate-gap
status: reported
harness_area: checks-changed
---
**Observed**: a recurrence of 648dee33. On `fix/mcp-hostile-input-boundaries` (#2067), `pnpm checks:changed -- --run` passed 32 of 32 lanes on a diff that adds `warnings` to `rename_concept`'s output schema in `mcp/src/server/registry.mjs`, and its list had no `decisions:check`. `git push` then failed in the pre-push `decisions` lane ("public contract changed: mcp/src/server/registry.mjs", no decision fragment). The run after the fragment was added (35 of 35 lanes) still did not select `decisions:check`.
**Cost**: one refused push, then a second full `checks:changed -- --run` on the amended commit, about 12 minutes; no CI round.
**Suspected cause**: as in 648dee33: the focused-check suggester and the pre-push lane selector choose lanes separately, and only pre-push maps a public-contract path to `decisions:check`.
**Proposed change**: script: `checks:changed` selects `pnpm decisions:check` whenever the decision-record triggers match the diff, reusing the pre-push trigger list, as 648dee33 proposes.
