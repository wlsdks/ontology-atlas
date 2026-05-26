import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

function withFakePnpm(run) {
  const root = mkdtempSync(join(tmpdir(), "omo-goal-audit-"));
  try {
    const logPath = join(root, "pnpm.log");
    const binPath = join(root, "fake-pnpm.mjs");
    writeFileSync(
      binPath,
      `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
appendFileSync(${JSON.stringify(logPath)}, JSON.stringify(process.argv.slice(2)) + "\\n");
process.exit(0);
`,
    );
    chmodSync(binPath, 0o755);
    run({ binPath, logPath });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runGoalAudit(args, fakePnpmPath = "pnpm") {
  return spawnSync(process.execPath, ["scripts/check-desktop-goal-audit.mjs", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      OMOT_PNPM_BIN: fakePnpmPath,
    },
  });
}

test("desktop goal audit requires PR before running preflight", () => {
  withFakePnpm(({ binPath, logPath }) => {
    const result = runGoalAudit(["--tag=v0.1.0"], binPath);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /--pr=NUMBER is required/);
    assert.throws(() => readFileSync(logPath, "utf8"), /ENOENT/);
  });
});

test("desktop goal audit requires tag before running preflight", () => {
  withFakePnpm(({ binPath, logPath }) => {
    const result = runGoalAudit(["--pr=274"], binPath);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /--tag=vX\.Y\.Z is required/);
    assert.throws(() => readFileSync(logPath, "utf8"), /ENOENT/);
  });
});

test("desktop goal audit runs preflight before full hosted release status", () => {
  withFakePnpm(({ binPath, logPath }) => {
    const result = runGoalAudit([
      "--repo=wlsdks/oh-my-ontology",
      "--pr=274",
      "--tag=v0.1.0",
      "--hosted-base-url=http://127.0.0.1:4321",
      "--json-file=/tmp/goal.json",
      "--markdown-file=/tmp/goal.md",
    ], binPath);

    assert.equal(result.status, 0, result.stderr);
    const calls = readFileSync(logPath, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.deepEqual(calls, [
      ["desktop:release-preflight"],
      [
        "desktop:release-status",
        "--",
        "--repo=wlsdks/oh-my-ontology",
        "--pr=274",
        "--tag=v0.1.0",
        "--include-hosted-surface",
        "--hosted-base-url=http://127.0.0.1:4321",
        "--json-file=/tmp/goal.json",
        "--markdown-file=/tmp/goal.md",
      ],
    ]);
  });
});

test("desktop goal audit help describes the required evidence", () => {
  const result = runGoalAudit(["--help"]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /--pr=NUMBER --tag=vX\.Y\.Z/);
  assert.match(result.stdout, /requires --pr and --tag before starting the expensive local preflight/);
});
