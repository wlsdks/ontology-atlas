import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
    /*
     * ⚠️ It used to print a list of commands and stop, on the reasoning that the bot token cannot
     * push to protected main. True, and irrelevant: a person dispatches the release, so the
     * credentials that pushed the tag can open this PR. Handing somebody a checklist at the end of
     * a twenty-minute build is handing them a step to forget, and it was forgotten twice on
     * 2026-08-25 -- the public page advertised rc.10 while rc.11 and rc.12 had both shipped.
     */
    assert.match(result.stdout, /refreshing \/download for v0\.1\.0/);
  });
});

/*
 * ⚠️ The three defects the automation's **first real outing** produced, on 2026-08-25, after rc.13
 * had already published. Unit tests were green for all three; only running it found them.
 */
test("desktop release run gives gh room to stream a whole build", () => {
  const source = readFileSync("scripts/watch-macos-release-run.mjs", "utf8");
  /*
   * `gh run watch` streams for the length of the build. Node's 1 MB spawnSync default overflowed
   * with `spawnSync gh ENOBUFS` after the release had been dispatched, so the build finished while
   * the command meant to follow it never got there.
   */
  assert.match(source, /maxBuffer:\s*\d+\s*\*\s*1024\s*\*\s*1024/);
});

test("desktop release run can retry only the refresh, without releasing again", () => {
  /*
   * The worst of the three. When the refresh failed, the only way back to it was dispatching a
   * whole second release of a tag that had already published — a recovery path that costs a
   * duplicate signed build is not a recovery path.
   */
  const stdout = execFileSync(process.execPath, ["scripts/watch-macos-release-run.mjs", "--help"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.match(stdout, /--refresh-only/);

  const source = readFileSync("scripts/watch-macos-release-run.mjs", "utf8");
  assert.match(source, /options\.refreshOnly/);
  // The dispatch must sit behind the flag, not merely be mentioned near it.
  assert.match(source, /if \(options\.refreshOnly\)[\s\S]{0,200}refreshDownloadPage\(options\)/);
});

test("desktop release run reads its own helper's two return shapes", () => {
  /*
   * `run` answers with a string on success and with the raw spawn result when failure is allowed.
   * Reading `.status` off both crashed the refresh on its first outing with
   * `Cannot read properties of undefined (reading 'trim')`.
   */
  const source = readFileSync("scripts/watch-macos-release-run.mjs", "utf8");
  assert.match(source, /typeof result === "string"/);
  assert.doesNotMatch(source, /const attempt = run\(/);
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
  assert.match(stdout, /refreshes what \/download says/);
  assert.match(stdout, /Merging\s+that PR is what moves the public download page/);
});
