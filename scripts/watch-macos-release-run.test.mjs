import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const admittedSha = "a".repeat(40);

function writeFakeGh(root, scenario) {
  const binPath = join(root, "fake-gh.mjs");
  const statePath = join(root, "state.json");
  writeFileSync(statePath, JSON.stringify({ dispatched: false, runListCalls: 0 }));
  writeFileSync(
    binPath,
    `#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
const scenario = ${JSON.stringify(scenario)};
const statePath = ${JSON.stringify(statePath)};
const args = process.argv.slice(2);
const state = JSON.parse(readFileSync(statePath, "utf8"));
function save() { writeFileSync(statePath, JSON.stringify(state)); }
function out(value) { process.stdout.write(typeof value === "string" ? value : JSON.stringify(value)); }
function err(value) { process.stderr.write(value); }
if (args[0] === "workflow" && args[1] === "run") {
  if (args[2] !== "release-macos.yml" || !args.includes("--ref") || !args.includes("main") || !args.includes("tag=v0.1.0")) {
    err("unsafe dispatch args: " + args.join(" "));
    process.exit(2);
  }
  state.dispatched = true;
  save();
  process.exit(0);
}
if (args[0] === "run" && args[1] === "list") {
  if (!state.dispatched) {
    err("run list queried before trusted workflow dispatch");
    process.exit(2);
  }
  state.runListCalls += 1;
  save();
  if (scenario.neverAppears || state.runListCalls <= (scenario.emptyAttempts ?? 0)) {
    out([]);
    process.exit(0);
  }
  if (!args.includes("--event") || !args.includes("workflow_dispatch")) {
    err("missing workflow_dispatch event filter");
    process.exit(2);
  }
  if (!args.includes("--commit") || !args.includes("${"a".repeat(40)}")) {
    err("missing commit filter");
    process.exit(2);
  }
  out([
    { databaseId: 99999, displayTitle: "Unrelated maintenance", headBranch: "main", headSha: "${"a".repeat(40)}", event: "workflow_dispatch", workflowName: "Release Desktop" },
    { databaseId: 12345, displayTitle: "Release Desktop v0.1.0", headBranch: "main", status: "in_progress", conclusion: "", url: "https://github.test/run/12345", headSha: "${"a".repeat(40)}", event: "workflow_dispatch", workflowName: "Release Desktop" },
  ]);
  process.exit(0);
}
if (args[0] === "run" && args[1] === "watch") {
  if (args[2] !== "12345" || !args.includes("--exit-status")) {
    err("unexpected watch args: " + args.join(" "));
    process.exit(2);
  }
  out("watched");
  process.exit(scenario.watchFails ? 1 : 0);
}
err("unexpected gh call: " + args.join(" "));
process.exit(2);
`,
  );
  chmodSync(binPath, 0o755);
  return binPath;
}

function runReleaseRun(fakeGhPath, args = ["--tag=v0.1.0", `--sha=${admittedSha}`, "--attempts=2", "--interval-ms=1"]) {
  return spawnSync(process.execPath, ["scripts/watch-macos-release-run.mjs", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      OATLAS_GH_BIN: fakeGhPath,
    },
  });
}

function withFakeGh(scenario, run) {
  const root = mkdtempSync(join(tmpdir(), "omo-release-run-"));
  try {
    const fakeGhPath = writeFakeGh(root, scenario);
    run(fakeGhPath);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("desktop release run dispatches the protected-main workflow and watches it", () => {
  withFakeGh({ emptyAttempts: 1 }, (fakeGhPath) => {
    const result = runReleaseRun(fakeGhPath, ["--tag=v0.1.0", `--sha=${admittedSha}`, "--attempts=3", "--interval-ms=1"]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /waiting for release-macos\.yml workflow_dispatch run/);
    assert.match(result.stdout, /watching release-macos\.yml run 12345/);
    assert.match(result.stdout, /completed successfully/);
    assert.match(result.stdout, /ontology-atlas-release-facts-v0\.1\.0/);
    assert.match(result.stdout, /gh run download 12345 --repo wlsdks\/ontology-atlas --name ontology-atlas-release-facts-v0\.1\.0/);
    assert.match(result.stdout, /src\/views\/download\/model\/macos-release\.generated\.ts/);
    assert.match(result.stdout, /normal protected-main PR/);
  });
});

test("desktop release run fails when the dispatched workflow run never appears", () => {
  withFakeGh({ neverAppears: true }, (fakeGhPath) => {
    const result = runReleaseRun(fakeGhPath, ["--tag=v0.1.0", `--sha=${admittedSha}`, "--attempts=1", "--interval-ms=1"]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /no release-macos\.yml workflow_dispatch run appeared/);
    assert.match(result.stderr, /dispatched from protected ref main/);
  });
});

test("desktop release run help describes protected-main dispatch and watch", () => {
  const stdout = execFileSync(process.execPath, ["scripts/watch-macos-release-run.mjs", "--help"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.match(stdout, /desktop:release-run/);
  assert.match(stdout, /workflow_dispatch/);
  assert.match(stdout, /protected ref/);
  assert.match(stdout, /release-facts artifact/);
  assert.match(stdout, /protected-main PR/);
});
