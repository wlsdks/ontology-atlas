import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const requiredSecrets = [
  "APPLE_CERTIFICATE_P12_BASE64",
  "APPLE_CERTIFICATE_PASSWORD",
  "APPLE_KEYCHAIN_PASSWORD",
  "APPLE_SIGNING_IDENTITY",
  "APPLE_ID",
  "APPLE_APP_SPECIFIC_PASSWORD",
  "APPLE_TEAM_ID",
];
function writeFakeGh(root, scenario) {
  const binPath = join(root, "fake-gh.mjs");
  writeFileSync(
    binPath,
    `#!/usr/bin/env node
const scenario = ${JSON.stringify(scenario)};
const args = process.argv.slice(2);
function out(value) {
  process.stdout.write(typeof value === "string" ? value : JSON.stringify(value));
}
function err(value) {
  process.stderr.write(value);
}
if (args[0] === "auth" && args[1] === "status") {
  process.exit(0);
}
if (args[0] === "api" && args[1]?.startsWith("repos/wlsdks/oh-my-ontology/actions/workflows/")) {
  if (scenario.workflowMissing) {
    err("HTTP 404: Not Found");
    process.exit(1);
  }
  out({ state: scenario.workflowState ?? "active" });
  process.exit(0);
}
if (args[0] === "api" && args[1]?.startsWith("repos/wlsdks/oh-my-ontology/git/ref/tags/")) {
  if (scenario.gitTagExists) {
    out({ ref: "refs/tags/" + args[1].split("/").pop(), object: { sha: "0".repeat(40) } });
    process.exit(0);
  }
  err("HTTP 404: Not Found");
  process.exit(1);
}
if (args[0] === "secret" && args[1] === "list") {
  const names = scenario.secretNames ?? ${JSON.stringify(requiredSecrets)};
  out(names.map((name) => ({ name })));
  process.exit(0);
}
if (args[0] === "release" && args[1] === "view") {
  if (scenario.releaseExists) {
    out({
      tagName: args[2],
      isDraft: Boolean(scenario.releaseDraft),
      isPrerelease: Boolean(scenario.releasePrerelease),
      url: "https://github.com/wlsdks/oh-my-ontology/releases/tag/" + args[2],
    });
    process.exit(0);
  }
  err("release not found");
  process.exit(1);
}
err("unexpected gh call: " + args.join(" "));
process.exit(2);
`,
  );
  chmodSync(binPath, 0o755);
  return binPath;
}

function runReleaseGithub(fakeGhPath, args = ["--tag=v0.1.0"]) {
  return spawnSync(process.execPath, ["scripts/check-macos-release-github.mjs", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      OMOT_GH_BIN: fakeGhPath,
    },
  });
}

function withFakeGh(scenario, run) {
  const root = mkdtempSync(join(tmpdir(), "omo-release-github-"));
  try {
    const fakeGhPath = writeFakeGh(root, scenario);
    run(fakeGhPath);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("desktop GitHub release gate proves workflows, secrets, tag version, and clean release slot", () => {
  withFakeGh({}, (fakeGhPath) => {
    const result = runReleaseGithub(fakeGhPath);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /has the active macOS release workflow and all required Apple release secret names/);
    assert.match(result.stdout, /v0\.1\.0 matches package, Tauri, and Cargo versions/);
    assert.match(result.stdout, /v0\.1\.0 has no existing Git tag/);
    assert.match(result.stdout, /v0\.1\.0 has no existing GitHub Release/);
  });
});

test("desktop GitHub release gate fails before tag push when Apple secret names are missing", () => {
  withFakeGh({ secretNames: requiredSecrets.filter((name) => name !== "APPLE_TEAM_ID") }, (fakeGhPath) => {
    const result = runReleaseGithub(fakeGhPath);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /missing GitHub Actions secrets/);
    assert.match(result.stderr, /APPLE_TEAM_ID/);
    assert.match(result.stderr, /gh secret set APPLE_TEAM_ID --repo wlsdks\/oh-my-ontology/);
  });
});

test("desktop GitHub release gate explains that a PR-only workflow cannot receive tag pushes yet", () => {
  withFakeGh({ workflowMissing: true }, (fakeGhPath) => {
    const result = runReleaseGithub(fakeGhPath);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /release-macos\.yml is not available to GitHub/);
    assert.match(result.stderr, /merge that PR into the default branch before pushing the release tag/);
  });
});

test("desktop GitHub release gate blocks an existing same-tag release slot", () => {
  withFakeGh({ releaseExists: true, releaseDraft: true }, (fakeGhPath) => {
    const result = runReleaseGithub(fakeGhPath);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /release v0\.1\.0 already exists/);
    assert.match(result.stderr, /Delete the existing draft release/);
  });
});

test("desktop GitHub release gate blocks an existing same-tag Git ref before tag push", () => {
  withFakeGh({ gitTagExists: true }, (fakeGhPath) => {
    const result = runReleaseGithub(fakeGhPath);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /git tag v0\.1\.0 already exists/);
    assert.match(result.stderr, /Inspect the existing tag workflow run or choose a new version/);
  });
});

test("desktop GitHub release gate help lists every required Apple secret and excludes Firebase", () => {
  const stdout = execFileSync(process.execPath, ["scripts/check-macos-release-github.mjs", "--help"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  for (const name of requiredSecrets) {
    assert.match(stdout, new RegExp(name));
  }
  assert.doesNotMatch(stdout, /FIREBASE_SERVICE_ACCOUNT_JSON/);
  assert.match(stdout, /Firebase Hosting is intentionally excluded/);
});
