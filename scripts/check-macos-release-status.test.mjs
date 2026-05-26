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
if (args[0] === "pr" && args[1] === "view") {
  out({
    state: scenario.prState ?? "OPEN",
    mergedAt: scenario.prMergedAt ?? null,
    mergeStateStatus: scenario.prMergeState ?? "CLEAN",
    reviewDecision: scenario.prReviewDecision ?? "APPROVED",
    url: "https://github.com/wlsdks/oh-my-ontology/pull/" + args[2],
    statusCheckRollup: scenario.prChecks ?? [
      { status: "COMPLETED", conclusion: "SUCCESS" },
    ],
  });
  process.exit(0);
}
if (args[0] === "secret" && args[1] === "list") {
  const names = scenario.secretNames ?? ${JSON.stringify(requiredSecrets)};
  out(names.map((name) => ({ name })));
  process.exit(0);
}
if (args[0] === "release" && args[1] === "view") {
  if (scenario.releaseMissing) {
    err("release not found");
    process.exit(1);
  }
  out({
    tagName: args[2],
    isDraft: Boolean(scenario.releaseDraft),
    isPrerelease: Boolean(scenario.releasePrerelease),
    url: "https://github.com/wlsdks/oh-my-ontology/releases/tag/" + args[2],
  });
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
  const root = mkdtempSync(join(tmpdir(), "omo-release-status-"));
  try {
    run(writeFakeGh(root, scenario));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runStatus(fakeGhPath, args = ["--tag=v0.1.0", "--pr=274"]) {
  return spawnSync(process.execPath, ["scripts/check-macos-release-status.mjs", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      OMOT_GH_BIN: fakeGhPath,
      OMOT_RELEASE_STATUS_SKIP_DOWNLOAD_VERIFY: "1",
      OMOT_RELEASE_STATUS_SKIP_HOSTED_VERIFY: "1",
    },
  });
}

test("desktop release status reports current completion blockers together", () => {
  withFakeGh(
    {
      prMergeState: "BLOCKED",
      prReviewDecision: "REVIEW_REQUIRED",
      secretNames: [],
      releaseMissing: true,
    },
    (fakeGhPath) => {
      const result = runStatus(fakeGhPath);

      assert.equal(result.status, 1);
      assert.match(result.stdout, /✗ Pull request: PR #274 is not merge-ready/);
      assert.match(result.stdout, /review=REVIEW_REQUIRED/);
      assert.match(result.stdout, /merge=BLOCKED/);
      assert.match(result.stdout, /✗ Apple release secrets: missing APPLE_CERTIFICATE_P12_BASE64/);
      assert.match(result.stdout, /gh secret set APPLE_TEAM_ID --repo wlsdks\/oh-my-ontology/);
      assert.match(result.stdout, /✗ GitHub Release: release not found/);
      assert.match(result.stderr, /blocked: 3 release requirement/);
    },
  );
});

test("desktop release status passes when PR, secrets, and stable release are ready", () => {
  withFakeGh({}, (fakeGhPath) => {
    const result = runStatus(fakeGhPath);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /✓ Pull request: PR #274 is merge-ready/);
    assert.match(result.stdout, /✓ Apple release secrets: all required Apple signing\/notary secret names exist/);
    assert.match(result.stdout, /✓ GitHub Release: v0\.1\.0 is public and stable/);
    assert.match(result.stdout, /· Download assets: skipped by OMOT_RELEASE_STATUS_SKIP_DOWNLOAD_VERIFY=1/);
    assert.match(result.stdout, /· Hosted website: skipped by OMOT_RELEASE_STATUS_SKIP_HOSTED_VERIFY=1/);
    assert.match(result.stdout, /ready: public macOS release requirements are satisfied/);
  });
});

test("desktop release status accepts an already merged PR", () => {
  withFakeGh(
    {
      prState: "MERGED",
      prMergeState: "UNKNOWN",
      prMergedAt: "2026-05-26T00:00:00Z",
    },
    (fakeGhPath) => {
      const result = runStatus(fakeGhPath);

      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /✓ Pull request: PR #274 is already merged/);
      assert.match(result.stdout, /ready: public macOS release requirements are satisfied/);
    },
  );
});

test("desktop release status help describes the completion audit", () => {
  const stdout = execFileSync(process.execPath, ["scripts/check-macos-release-status.mjs", "--help"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.match(stdout, /release completion state/);
  assert.match(stdout, /downloadable DMG\/checksum assets/);
  assert.match(stdout, /Hosted website/);
});
