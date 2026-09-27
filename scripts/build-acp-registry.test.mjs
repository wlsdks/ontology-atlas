import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  cutoffProblems,
  driftedAgents,
  hardenedRuntimeIds,
  isolatedRuntimeIds,
  launchLabel,
  npmPackageSpec,
  runtimeLaunchPinIds,
  runtimeLaunchPinIssues,
  withDependencyCutoff,
} from "./build-acp-registry.mjs";

const npx = (id, pkg) => ({ id, launch: { kind: "npx", package: pkg, args: [] } });

test("the npm dependency cutoff moves only when the snapshot does", () => {
  const now = new Date("2026-10-01T00:00:00.000Z");
  const committed = {
    source: "s",
    registryVersion: "1",
    npmDependencyCutoff: "2026-09-27T08:11:48.000Z",
    agents: [npx("claude-acp", "a@1.0.0")],
  };
  const same = { ...committed, npmDependencyCutoff: null };
  assert.equal(withDependencyCutoff(same, committed, now).npmDependencyCutoff, "2026-09-27T08:11:48.000Z");
  const moved = { ...same, agents: [npx("claude-acp", "a@1.0.1")] };
  assert.equal(withDependencyCutoff(moved, committed, now).npmDependencyCutoff, now.toISOString());
  assert.equal(withDependencyCutoff(same, null, now).npmDependencyCutoff, now.toISOString());
  assert.deepEqual(Object.keys(withDependencyCutoff(same, committed, now)), Object.keys(committed));
});

test("the cutoff must postdate every hardened adapter's pinned release", () => {
  const snapshot = {
    npmDependencyCutoff: "2026-09-27T08:11:48.000Z",
    agents: [npx("claude-acp", "@scope/claude@1.2.3"), npx("codex-acp", "codex@4.5.6"), npx("other", "late@9.9.9")],
  };
  const published = {
    "@scope/claude@1.2.3": "2026-09-24T10:18:05.741Z",
    "codex@4.5.6": "2026-09-23T10:12:17.011Z",
    "late@9.9.9": "2026-09-30T00:00:00.000Z",
  };
  const publishedAt = (name, version) => published[`${name}@${version}`] ?? null;
  assert.deepEqual(cutoffProblems({ snapshot, hardened: ["claude-acp", "codex-acp"], publishedAt }), []);
  assert.match(cutoffProblems({ snapshot, hardened: ["other"], publishedAt })[0], /after 2026-09-27/);
  assert.match(cutoffProblems({ snapshot, hardened: ["missing"], publishedAt })[0], /no exact npx version/);
  assert.match(
    cutoffProblems({ snapshot: { ...snapshot, npmDependencyCutoff: undefined }, hardened: [], publishedAt })[0],
    /missing or not a date/,
  );
  assert.match(
    cutoffProblems({ snapshot, hardened: ["codex-acp"], publishedAt: () => null })[0],
    /does not say when codex@4\.5\.6/,
  );
});

test("the hardened set is read from Rust and the committed snapshot carries a cutoff", () => {
  const hardened = hardenedRuntimeIds();
  assert.deepEqual([...hardened].sort(), ["claude-acp", "codex-acp"]);
  const snapshot = JSON.parse(readFileSync("src-tauri/src/acp-registry.json", "utf8"));
  assert.ok(Number.isFinite(Date.parse(snapshot.npmDependencyCutoff)), "acp-registry.json has no npmDependencyCutoff");
  for (const id of hardened) {
    const launch = snapshot.agents.find((agent) => agent.id === id)?.launch;
    assert.ok(npmPackageSpec(launch?.package), `${id} must pin one exact npx version`);
  }
  assert.deepEqual(npmPackageSpec("@agentclientprotocol/codex-acp@1.13.1"), {
    name: "@agentclientprotocol/codex-acp",
    version: "1.13.1",
  });
  assert.equal(npmPackageSpec("codex@^1.0.0"), null);
});

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

test("no launch pin stands today, and the mechanism reports nothing", () => {
  /*
   * The owner overturned the Codex pin on 2026-09-07 ("the version is always the newest"); the
   * table is empty but kept, so a future measured boundary failure can pin again with a named
   * upstream subject. An empty table must scan to nothing rather than to an error.
   */
  assert.deepEqual(runtimeLaunchPinIds(), []);
  assert.deepEqual(
    runtimeLaunchPinIssues([
      {
        id: "codex-acp",
        distribution: {
          npx: { package: "@agentclientprotocol/codex-acp@2.0.0", args: [] },
        },
      },
    ]),
    [],
  );
});
