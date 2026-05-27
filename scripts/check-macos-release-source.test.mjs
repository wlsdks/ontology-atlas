import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const headSha = "a".repeat(40);
const staleSha = "b".repeat(40);

function writeFakeGh(root, scenario = {}) {
  const binPath = join(root, "fake-gh.mjs");
  writeFileSync(
    binPath,
    `#!/usr/bin/env node
const scenario = ${JSON.stringify(scenario)};
const args = process.argv.slice(2);
function out(value) {
  process.stdout.write(JSON.stringify(value));
}
function err(value) {
  process.stderr.write(value);
}
if (args[0] === "api" && args[1] === "repos/wlsdks/oh-my-ontology") {
  out({ default_branch: scenario.defaultBranch ?? "main" });
  process.exit(0);
}
if (args[0] === "api" && args[1] === "repos/wlsdks/oh-my-ontology/git/ref/heads/main") {
  out({ object: { sha: scenario.headSha ?? "${headSha}" } });
  process.exit(0);
}
err("unexpected gh call: " + args.join(" "));
process.exit(2);
`,
  );
  chmodSync(binPath, 0o755);
  return binPath;
}

function withFakeGh(scenario, run) {
  const root = mkdtempSync(join(tmpdir(), "omo-release-source-"));
  try {
    run(writeFakeGh(root, scenario));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runReleaseSource(fakeGhPath, args = [`--sha=${headSha}`]) {
  return spawnSync(process.execPath, ["scripts/check-macos-release-source.mjs", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      OMOT_GH_BIN: fakeGhPath,
    },
  });
}

test("desktop release source gate accepts a tag at the default-branch head", () => {
  withFakeGh({}, (fakeGhPath) => {
    const result = runReleaseSource(fakeGhPath);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(`${headSha} is wlsdks/oh-my-ontology main head`));
  });
});

test("desktop release source gate rejects a tag from an unmerged or stale commit", () => {
  withFakeGh({}, (fakeGhPath) => {
    const result = runReleaseSource(fakeGhPath, [`--sha=${staleSha}`]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /release tag points at/);
    assert.match(result.stderr, /tag the default-branch head/);
  });
});

test("desktop release source gate can read the tag sha from GITHUB_SHA", () => {
  withFakeGh({}, (fakeGhPath) => {
    const result = spawnSync(process.execPath, ["scripts/check-macos-release-source.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        OMOT_GH_BIN: fakeGhPath,
        GITHUB_SHA: headSha,
      },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /main head/);
  });
});

test("desktop release source gate help explains the default-branch requirement", () => {
  const stdout = execFileSync(process.execPath, ["scripts/check-macos-release-source.mjs", "--help"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.match(stdout, /default-branch head/);
  assert.match(stdout, /unmerged PR branch/);
});
