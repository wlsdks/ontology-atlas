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
  if (scenario.secretListFails) {
    err("secret API unavailable");
    process.exit(1);
  }
  if (scenario.secretListInvalidJson) {
    out("not-json");
    process.exit(0);
  }
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
    },
  });
}

test("desktop release status reports current completion blockers together", () => {
  withFakeGh(
    {
      prMergeState: "BLOCKED",
      prReviewDecision: "REVIEW_REQUIRED",
      prChecks: [
        {
          name: "desktop release preflight",
          status: "COMPLETED",
          conclusion: "FAILURE",
          detailsUrl: "https://github.com/wlsdks/oh-my-ontology/actions/runs/1/job/2",
        },
        { name: "lint", status: "COMPLETED", conclusion: "SUCCESS" },
        { name: "build", status: "IN_PROGRESS", conclusion: null },
        { name: "deploy", status: "QUEUED", conclusion: "" },
      ],
      secretNames: [],
      releaseMissing: true,
    },
    (fakeGhPath) => {
      const result = runStatus(fakeGhPath);

      assert.equal(result.status, 1);
      assert.match(result.stdout, /✓ Version alignment: v0\.1\.0 matches package, Tauri, and Cargo versions/);
      assert.match(result.stdout, /✗ Pull request: PR #274 is not merge-ready/);
      assert.match(result.stdout, /review=REVIEW_REQUIRED/);
      assert.match(result.stdout, /merge=BLOCKED/);
      assert.match(result.stdout, /1\/4 checks successful/);
      assert.match(
        result.stdout,
        /blocked checks: desktop release preflight=FAILURE .*build=IN_PROGRESS, deploy=QUEUED/,
      );
      assert.match(result.stdout, /actions\/runs\/1\/job\/2/);
      assert.match(result.stdout, /next: Run gh pr checks 274 --repo wlsdks\/oh-my-ontology/);
      assert.match(result.stdout, /✗ Apple release secrets: missing APPLE_CERTIFICATE_P12_BASE64/);
      assert.match(result.stdout, /gh secret set APPLE_TEAM_ID --repo wlsdks\/oh-my-ontology/);
      assert.match(result.stdout, /✗ GitHub Release: release not found/);
      assert.match(result.stdout, /release-macos\.yml can publish signed DMGs/);
      assert.doesNotMatch(result.stdout, /Firebase Hosting deploy secrets/);
      assert.match(result.stderr, /blocked: 3 release requirement/);
    },
  );
});

test("desktop release status passes when PR, secrets, and stable release are ready", () => {
  withFakeGh({}, (fakeGhPath) => {
    const result = runStatus(fakeGhPath);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /✓ Version alignment: v0\.1\.0 matches package, Tauri, and Cargo versions/);
    assert.match(result.stdout, /✓ Pull request: PR #274 is merge-ready/);
    assert.match(result.stdout, /✓ Apple release secrets: all required Apple signing\/notary secret names exist/);
    assert.match(result.stdout, /✓ GitHub Release: v0\.1\.0 is public and stable/);
    assert.match(result.stdout, /· Download assets: skipped by OMOT_RELEASE_STATUS_SKIP_DOWNLOAD_VERIFY=1/);
    assert.doesNotMatch(result.stdout, /Hosted website/);
    assert.match(result.stdout, /ready: public macOS release requirements are satisfied/);
  });
});

test("desktop release status keeps Firebase out when GitHub secret listing fails", () => {
  withFakeGh({ secretListFails: true, releaseMissing: true }, (fakeGhPath) => {
    const result = runStatus(fakeGhPath);

    assert.equal(result.status, 1);
    assert.match(result.stdout, /✗ Apple release secrets: secret API unavailable/);
    assert.doesNotMatch(result.stdout, /Firebase Hosting deploy secrets/);
    assert.doesNotMatch(result.stderr, /Firebase Hosting deploy secrets/);
  });
});

test("desktop release status keeps Firebase out when GitHub secret JSON is malformed", () => {
  withFakeGh({ secretListInvalidJson: true, releaseMissing: true }, (fakeGhPath) => {
    const result = runStatus(fakeGhPath);

    assert.equal(result.status, 1);
    assert.match(result.stdout, /✗ Apple release secrets: gh secret list .* returned invalid JSON/);
    assert.doesNotMatch(result.stdout, /Firebase Hosting deploy secrets/);
    assert.doesNotMatch(result.stderr, /Firebase Hosting deploy secrets/);
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

test("desktop release status blocks version-mismatched tags before completion", () => {
  withFakeGh({}, (fakeGhPath) => {
    const result = runStatus(fakeGhPath, ["--tag=v9.9.9", "--pr=274"]);

    assert.equal(result.status, 1);
    assert.match(result.stdout, /✗ Version alignment: release tag v9\.9\.9 does not match macOS app versions/);
    assert.match(result.stdout, /next: Run pnpm desktop:release-tag -- --tag=v9\.9\.9/);
    assert.match(result.stderr, /blocked: 1 release requirement/);
  });
});

test("desktop release status help describes the completion audit", () => {
  const stdout = execFileSync(process.execPath, ["scripts/check-macos-release-status.mjs", "--help"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.match(stdout, /release completion state/);
  assert.match(stdout, /release tag version alignment/);
  assert.match(stdout, /downloadable\s+DMG\/checksum assets/);
  assert.match(stdout, /Firebase Hosting is intentionally excluded/);
  assert.doesNotMatch(stdout, /Hosted website/);
});
