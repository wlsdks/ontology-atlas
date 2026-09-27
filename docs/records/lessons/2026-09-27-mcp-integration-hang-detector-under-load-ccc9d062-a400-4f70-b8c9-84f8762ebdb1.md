---
id: ccc9d062-a400-4f70-b8c9-84f8762ebdb1
date: 2026-09-27
kind: tool-efficiency
status: reported
harness_area: integration
---
**Observed**: on `fix/sources-are-not-concepts`, `pnpm integration:mcp` printed `integration: 29 passed, 121 failed`, and all 121 failures read `JSON-RPC subprocess timed out; missing responses: number:1…`: the server had not answered `initialize` within the 1.5 s hang detector (`rpc()` and `rpcForRepo()` defaults in `mcp/src/integration.test.mjs`, `runJsonRpcProcess` in `scripts/lib/mcp-test-rpc.mjs`). Load average was 41 to 50 from other sessions. Time from spawn to the `initialize` response, 8 alternating spawns, median 2,438 ms on the branch and 2,467 ms on origin/main, so the change was not the cause. With the default raised to 15 s locally (not committed) the suite ran; a test that passes its own literal `1_500` (`query_ontology health/workspace_brief/agent_brief — summary history is batched and reused`) still timed out before `initialize`. The same symptom, one or two tests at load 40 to 100, is recorded in PR #2041's test plan.
**Cost**: one 250 s full run that proved nothing, about 10 minutes to show the timeouts were boot time rather than a regression, and a second full run.
**Suspected cause**: the hang detector is a fixed wall-clock bound below the server's boot time on a loaded shared machine, and a timeout before `initialize` reads like a crash or a regression.
**Proposed change**: script. Measure one `initialize` at suite start and set the detector to max(1,500 ms, 3 × that boot) for every `rpc` call, explicit literals included, or honor an environment override; and word a timeout with no `initialize` response as "the server did not boot within N ms".
