---
id: 648dee33-9c5f-45e5-a818-7edcfcc88007
date: 2026-09-27
kind: gate-gap
status: reported
harness_area: checks-changed
---
**Observed**: on `fix/mcp-ontology-walk-symlinks` (#2012), `pnpm checks:changed -- --run` passed 7 of 7 (eslint, source:language, knip, analyze tests, test:mcp:unit, integration:cli:entry, vault:validate) on a diff that changed `mcp/src/server/registry.mjs`. The pre-push `decisions` lane then refused the push: "public contract changed: mcp/src/server/registry.mjs" with no decision fragment. The run also did not select `tests/contract/source-comment-bytes.contract.test.ts`, which judges every changed source path. Same class as dbb4417c: the recommended set is narrower than the lanes that judge the diff.
**Cost**: one refused push and a decision-fragment round, about 5 minutes; no CI round.
**Suspected cause**: the focused-check suggester and the pre-push lane selector choose lanes separately, and only pre-push maps a public-contract path to `decisions:check`.
**Proposed change**: script: have `checks:changed` select `pnpm decisions:check` whenever the decision-record triggers match the diff, reusing that trigger list, and select the source ratchet contracts for any changed source path.
