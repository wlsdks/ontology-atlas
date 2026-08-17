import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const headSha = "a".repeat(40);
const staleSha = "b".repeat(40);
const annotatedSha = "c".repeat(40);
const tag = "v1.2.3";

function writeFakeGh(root, scenario = {}) {
  const binPath = join(root, "fake-gh.mjs");
  writeFileSync(
    binPath,
    `#!/usr/bin/env node
const scenario = ${JSON.stringify(scenario)};
const args = process.argv.slice(2);
function out(value) { process.stdout.write(JSON.stringify(value)); }
function err(value) { process.stderr.write(value); }
if (args[0] === "api" && args[1] === "repos/wlsdks/ontology-atlas") {
  out({ default_branch: scenario.defaultBranch ?? "main" });
  process.exit(0);
}
if (args[0] === "api" && args[1] === "repos/wlsdks/ontology-atlas/git/ref/heads/main") {
  if (scenario.rejectHeadLookup) {
    err("pin mode must not read moving main");
    process.exit(2);
  }
  out({ object: { type: "commit", sha: scenario.headSha ?? "${headSha}" } });
  process.exit(0);
}
if (args[0] === "api" && args[1] === "repos/wlsdks/ontology-atlas/git/ref/tags/${tag}") {
  if (scenario.tagMissing) {
    err("HTTP 404: Not Found");
    process.exit(1);
  }
  out({ object: scenario.refObject ?? { type: "commit", sha: scenario.tagSha ?? "${headSha}" } });
  process.exit(0);
}
if (args[0] === "api" && args[1]?.startsWith("repos/wlsdks/ontology-atlas/git/tags/")) {
  const sha = args[1].split("/").pop();
  const value = scenario.tagObjects?.[sha];
  if (!value) {
    err("unknown tag object: " + sha);
    process.exit(2);
  }
  out({ object: value });
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

function runReleaseSource(fakeGhPath, args = [`--mode=admit`, `--tag=${tag}`, `--sha=${headSha}`]) {
  return spawnSync(process.execPath, ["scripts/check-macos-release-source.mjs", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, OATLAS_GH_BIN: fakeGhPath },
  });
}

test("admit accepts a lightweight tag pinned to the current default-branch head", () => {
  withFakeGh({}, (fakeGhPath) => {
    const result = runReleaseSource(fakeGhPath);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(`${tag} resolves to ${headSha}`));
    assert.match(result.stdout, /admitted against wlsdks\/ontology-atlas main/);
  });
});

test("admit peels an annotated tag to its commit", () => {
  withFakeGh({
    refObject: { type: "tag", sha: annotatedSha },
    tagObjects: { [annotatedSha]: { type: "commit", sha: headSha } },
  }, (fakeGhPath) => {
    const result = runReleaseSource(fakeGhPath);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /resolves to/);
  });
});

test("pin accepts the admitted tag after main advances and does not read moving main", () => {
  withFakeGh({ rejectHeadLookup: true }, (fakeGhPath) => {
    const result = runReleaseSource(fakeGhPath, [`--mode=pin`, `--tag=${tag}`, `--sha=${headSha}`]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /remains pinned/);
  });
});

test("admit rejects a tag whose commit differs from the supplied SHA", () => {
  withFakeGh({ tagSha: staleSha }, (fakeGhPath) => {
    const result = runReleaseSource(fakeGhPath);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /resolves to/);
    assert.match(result.stderr, /admitted SHA/);
  });
});

test("admit rejects a supplied SHA that is not the current default-branch head", () => {
  withFakeGh({ headSha: staleSha }, (fakeGhPath) => {
    const result = runReleaseSource(fakeGhPath);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /default-branch head/);
  });
});

test("pin fails closed when the tag is retargeted after admission", () => {
  withFakeGh({ tagSha: staleSha, rejectHeadLookup: true }, (fakeGhPath) => {
    const result = runReleaseSource(fakeGhPath, [`--mode=pin`, `--tag=${tag}`, `--sha=${headSha}`]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /tag changed after admission/);
  });
});

test("tag peeling rejects cycles instead of following them indefinitely", () => {
  withFakeGh({
    refObject: { type: "tag", sha: annotatedSha },
    tagObjects: { [annotatedSha]: { type: "tag", sha: annotatedSha } },
  }, (fakeGhPath) => {
    const result = runReleaseSource(fakeGhPath);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /cycle/);
  });
});

test("arguments can come from RELEASE_TAG and GITHUB_SHA", () => {
  withFakeGh({}, (fakeGhPath) => {
    const result = spawnSync(process.execPath, ["scripts/check-macos-release-source.mjs", "--mode=admit"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, OATLAS_GH_BIN: fakeGhPath, RELEASE_TAG: tag, GITHUB_SHA: headSha },
    });
    assert.equal(result.status, 0, result.stderr);
  });
});

test("help explains admit and pin trust boundaries", () => {
  const stdout = execFileSync(process.execPath, ["scripts/check-macos-release-source.mjs", "--help"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.match(stdout, /--mode=admit\|pin/);
  assert.match(stdout, /annotated/);
  assert.match(stdout, /main may advance/);
});
