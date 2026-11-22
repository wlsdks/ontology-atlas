import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { WHOLE_RUN_TITLE, judgeBrowserRuns } from "./check-release-browser-gate.mjs";

const sha = "d".repeat(40);
const FULL = ["playwright-timings-full-1", "playwright-timings-full-2", "playwright-report"];
const SMOKE = ["playwright-timings-smoke-1"];

const run = (databaseId, createdAt, status, conclusion, extra = {}) => ({
  databaseId,
  createdAt,
  status,
  conclusion,
  event: "workflow_dispatch",
  displayTitle: "E2E smoke",
  url: `https://github.test/runs/${databaseId}`,
  ...extra,
});
const whole = { displayTitle: WHOLE_RUN_TITLE };

function judge(runs, artifacts = {}) {
  return judgeBrowserRuns({ runs, artifactsOf: (id) => artifacts[id] ?? [] });
}

test("passes when the newest finished run is a whole green run", () => {
  const verdict = judge([run(1, "2026-11-22T10:00:00Z", "completed", "success")], { 1: FULL });
  assert.equal(verdict.ok, true);
  assert.equal(verdict.state, "success");
});

test("refuses a run that is still going", () => {
  const verdict = judge([run(2, "2026-11-22T10:00:00Z", "in_progress", "")]);
  assert.deepEqual([verdict.ok, verdict.state], [false, "running"]);
  assert.match(verdict.message, /still in_progress/);
});

test("refuses a red run, even when an older run on the commit was green", () => {
  const verdict = judge(
    [
      run(1, "2026-11-22T09:00:00Z", "completed", "success"),
      run(2, "2026-11-22T10:00:00Z", "completed", "failure"),
    ],
    { 1: FULL, 2: FULL },
  );
  assert.deepEqual([verdict.ok, verdict.state, verdict.run.databaseId], [false, "red", 2]);
});

test("refuses a green run that ran only part of the suite", () => {
  for (const artifacts of [SMOKE, ["playwright-timings-targeted-1"]]) {
    const verdict = judge([run(3, "2026-11-22T10:00:00Z", "completed", "success")], { 3: artifacts });
    assert.deepEqual([verdict.ok, verdict.state], [false, "partial"], artifacts.join(","));
  }
});

test("refuses a commit with no run at all", () => {
  const verdict = judge([]);
  assert.deepEqual([verdict.ok, verdict.state], [false, "absent"]);
});

test("a cancelled run hides no verdict and gives none", () => {
  const behind = judge(
    [
      run(1, "2026-11-22T09:00:00Z", "completed", "success"),
      run(2, "2026-11-22T10:00:00Z", "completed", "cancelled"),
    ],
    { 1: FULL },
  );
  assert.equal(behind.ok, true);
  assert.equal(behind.run.databaseId, 1);
  assert.equal(judge([run(2, "2026-11-22T10:00:00Z", "completed", "cancelled")]).state, "absent");
});

function withFakeGh(runs, artifacts, body) {
  const root = mkdtempSync(join(tmpdir(), "atlas-browser-gate-"));
  const bin = join(root, "fake-gh.mjs");
  writeFileSync(
    bin,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
const runs = ${JSON.stringify(runs)};
const artifacts = ${JSON.stringify(artifacts)};
if (args[0] === "run" && args[1] === "list") {
  const at = args.indexOf("--commit");
  if (args[at + 1] !== "${sha}" || !args.includes("e2e.yml")) { process.stderr.write("unscoped run list: " + args.join(" ")); process.exit(2); }
  process.stdout.write(JSON.stringify(runs));
  process.exit(0);
}
const match = /^repos\\/wlsdks\\/ontology-atlas\\/actions\\/runs\\/(\\d+)\\/artifacts/.exec(args[1] ?? "");
if (args[0] === "api" && match) {
  process.stdout.write((artifacts[match[1]] ?? []).join("\\n"));
  process.exit(0);
}
process.stderr.write("unexpected gh call: " + args.join(" "));
process.exit(2);
`,
  );
  chmodSync(bin, 0o755);
  try {
    body((args) =>
      spawnSync(process.execPath, ["scripts/desktop-release/check-release-browser-gate.mjs", ...args], {
        encoding: "utf8",
        env: { ...process.env, OATLAS_GH_BIN: bin },
      }),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("the command exits 0 over a whole green run and 1 with the dispatch command otherwise", () => {
  withFakeGh([run(7, "2026-11-22T10:00:00Z", "completed", "success")], { 7: FULL }, (gate) => {
    const result = gate(["--", `--sha=${sha}`, "--tag=v2.5.0-beta.1"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /ran the whole suite and passed/);
  });
  withFakeGh([run(8, "2026-11-22T10:00:00Z", "completed", "failure")], { 8: FULL }, (gate) => {
    const result = gate([`--sha=${sha}`, "--tag=v2.5.0-beta.1"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /concluded failure/);
    assert.match(result.stderr, /gh workflow run e2e\.yml --repo wlsdks\/ontology-atlas --ref v2\.5\.0-beta\.1/);
  });
});

test("the command has no flag that skips the gate", () => {
  withFakeGh([], {}, (gate) => {
    for (const flag of ["--skip", "--force", "--allow-red"]) {
      const result = gate([`--sha=${sha}`, flag]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, new RegExp(`unknown argument: ${flag}`));
    }
    const absent = gate([`--sha=${sha}`]);
    assert.equal(absent.status, 1);
    assert.match(absent.stderr, /no finished browser-suite run exists/);
  });
});

test("a run titled as whole passes days later, after its artifacts expired", () => {
  const verdict = judge([run(9, "2026-11-19T10:00:00Z", "completed", "success", whole)], { 9: [] });
  assert.deepEqual([verdict.ok, verdict.state], [true, "success"]);
});

test("a whole-titled run that went red still refuses", () => {
  const verdict = judge([run(9, "2026-11-19T10:00:00Z", "completed", "failure", whole)]);
  assert.deepEqual([verdict.ok, verdict.state], [false, "red"]);
});

test("an untitled green run whose artifacts expired has its own state and message", () => {
  const verdict = judge([run(10, "2026-11-19T10:00:00Z", "completed", "success")], { 10: [] });
  assert.deepEqual([verdict.ok, verdict.state], [false, "expired"]);
  assert.match(verdict.message, /its artifacts have expired, so nothing shows what it ran/);
});

test("a pull-request run on the release commit never counts, even as the newest", () => {
  const forkRun = run(12, "2026-11-22T11:00:00Z", "completed", "success", { event: "pull_request", ...whole });
  const red = judge([run(11, "2026-11-22T10:00:00Z", "completed", "failure", whole), forkRun], { 12: FULL });
  assert.deepEqual([red.ok, red.state, red.run.databaseId], [false, "red", 11]);
  for (const event of ["pull_request", "pull_request_target", "merge_group"]) {
    const alone = judge([{ ...forkRun, event }], { 12: FULL });
    assert.deepEqual([alone.ok, alone.state], [false, "absent"], event);
  }
});

test("a run waiting for approval is no verdict", () => {
  const verdict = judge([run(13, "2026-11-22T11:00:00Z", "completed", "action_required", whole)]);
  assert.deepEqual([verdict.ok, verdict.state], [false, "absent"]);
});
