import assert from "node:assert/strict";
import test from "node:test";

import {
  driftedAgents,
  isolatedRuntimeIds,
  launchLabel,
  runtimeLaunchPinIds,
  runtimeLaunchPinIssues,
} from "./build-acp-registry.mjs";

/**
 * ⚠️ **Why this gate is narrow, and what must stay wide.**
 *
 * The release check used to block on any of 39 listed agents moving. Measured across rc.11 through
 * rc.14 on 2026-08-25/26, it fired on all four releases of that day, and **not once was the mover a
 * runtime this app runs**: cline, codebuddy-code, dimcode, droid, glm-acp-agent, grok, gemini-cli,
 * qwen-code. Each cost a full round trip -- refresh, pull request, CI, retag -- to ship a version
 * number for a tool nobody here launches. On rc.14 the check was green when the tag was cut and
 * stale twenty seconds later when the workflow ran, which is a rule that cannot be satisfied rather
 * than one being broken.
 *
 * The danger it was written for is real and stays blocking. On 2026-08-20 the snapshot had fallen
 * behind on `claude-agent-acp` and `codex-acp` themselves, so the app shipped launching adapter
 * versions whose permission behaviour nobody had measured. That is a safety claim, not freshness.
 */
test("the blocking set is read from Rust, not transcribed", () => {
  const ids = isolatedRuntimeIds();
  /*
   * ⚠️ A second hand-kept list would drift from Rust exactly the way the version constant drifted
   * from `package.json`. `runtime-gate.test.ts` already reads this same table the same way.
   */
  assert.ok(ids.length > 0, "the ISOLATION table must not parse to zero runtimes");
  assert.ok(ids.includes("claude-acp"), "claude-acp is isolated and must be in the blocking set");
  assert.ok(ids.includes("codex-acp"), "codex-acp is isolated and must be in the blocking set");
  // The registry lists 39 agents; the app claims specific knowledge about a handful.
  assert.ok(ids.length < 10, `the blocking set should stay small, got ${ids.length}`);
});

test("drift names the agent and both versions, so a message is actionable", () => {
  const before = [{ id: "factory-droid", launch: { kind: "npx", package: "droid@0.203.0" } }];
  const after = [{ id: "factory-droid", launch: { kind: "npx", package: "droid@0.204.0" } }];

  assert.deepEqual(driftedAgents(before, after), [
    { id: "factory-droid", before: "droid@0.203.0", after: "droid@0.204.0" },
  ]);
});

test("an unchanged agent is not reported as drift", () => {
  const same = [{ id: "claude-acp", launch: { kind: "npx", package: "x@1.0.0" } }];
  assert.deepEqual(driftedAgents(same, structuredClone(same)), []);
});

/*
 * ⚠️ Added and removed agents are drift too. Reporting only version bumps would let the snapshot
 * silently lose an entry -- and a runtime disappearing from the list is a bigger change than one
 * moving a patch version.
 */
test("an added or removed agent counts as drift", () => {
  const added = driftedAgents([], [{ id: "new-agent", launch: { package: "n@1" } }]);
  assert.deepEqual(added, [{ id: "new-agent", before: "(new)", after: "n@1" }]);

  const removed = driftedAgents([{ id: "gone", launch: { package: "g@1" } }], []);
  assert.deepEqual(removed, [{ id: "gone", before: "g@1", after: "(removed)" }]);
});

test("a launch without a package still gets a label instead of undefined", () => {
  assert.equal(launchLabel({ launch: { kind: "uvx", command: "thing" } }), "thing");
  assert.equal(launchLabel({ launch: { kind: "custom" } }), "custom");
  assert.equal(launchLabel({}), "(none)");
});

test("the measured Codex compatibility pin has a live upstream subject", () => {
  const ids = runtimeLaunchPinIds();
  assert.ok(ids.length > 0, "the compatibility-pin scan must not run over zero runtimes");
  assert.deepEqual(ids, ["codex-acp"]);
  assert.deepEqual(
    runtimeLaunchPinIssues([
      {
        id: "codex-acp",
        distribution: {
          npx: { package: "@agentclientprotocol/codex-acp@1.8.0", args: [] },
        },
      },
    ]),
    [],
  );
});

test("a new upstream Codex adapter turns the compatibility gate red with both identities", () => {
  assert.deepEqual(
    runtimeLaunchPinIssues([
      {
        id: "codex-acp",
        distribution: {
          npx: { package: "@agentclientprotocol/codex-acp@1.9.0", args: [] },
        },
      },
    ]),
    [
      {
        id: "codex-acp",
        pinned: "@agentclientprotocol/codex-acp@1.6.2",
        reviewedUpstream: "@agentclientprotocol/codex-acp@1.8.0",
        actualUpstream: "@agentclientprotocol/codex-acp@1.9.0",
      },
    ],
  );
});
