import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import test from "node:test";

// The release gates compare a tag against package.json/Tauri/Cargo, so these
// fixtures follow the repo version instead of freezing one — a frozen tag
// would fail on exactly the version bump the gate exists to protect.
const APP_TAG = `v${JSON.parse(readFileSync("package.json", "utf8")).version}`;
const APP_TAG_PATTERN = APP_TAG.replace(/\./g, "\\.");

const requiredSecrets = [
  "APPLE_CERTIFICATE_P12_BASE64",
  "APPLE_CERTIFICATE_PASSWORD",
  "APPLE_API_KEY_P8_BASE64",
  "APPLE_API_KEY_ID",
  "APPLE_API_ISSUER_ID",
  "TAURI_SIGNING_PRIVATE_KEY",
  "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
];
const environmentSecrets = [
  "APPLE_API_KEY_P8_BASE64",
  "APPLE_API_KEY_ID",
  "APPLE_API_ISSUER_ID",
];
const repositorySecrets = [
  "APPLE_CERTIFICATE_P12_BASE64",
  "APPLE_CERTIFICATE_PASSWORD",
  "TAURI_SIGNING_PRIVATE_KEY",
  "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
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
if (args[0] === "repo" && args[1] === "view") {
  out("main");
  process.exit(0);
}
if (args[0] === "api" && args[1] === "repos/wlsdks/ontology-atlas/environments/release-signing") {
  if (scenario.environmentMissing) {
    err("HTTP 404: Not Found");
    process.exit(1);
  }
  out({
    name: "release-signing",
    can_admins_bypass: scenario.environmentAdminBypass ?? false,
    protection_rules: scenario.environmentReviewers
      ? [{ type: "required_reviewers", reviewers: [{ type: "User", reviewer: { login: "owner" } }] }]
      : [],
    deployment_branch_policy: {
      protected_branches: false,
      custom_branch_policies: true,
    },
  });
  process.exit(0);
}
if (args[0] === "api" && args[1] === "repos/wlsdks/ontology-atlas/environments/release-signing/deployment-branch-policies") {
  out({
    branch_policies: [
      ...(scenario.environmentBranches ?? ["main"]).map((name) => ({ name, type: "branch" })),
      ...(scenario.environmentTags ?? []).map((name) => ({ name, type: "tag" })),
    ],
  });
  process.exit(0);
}
if (args[0] === "api" && args[1] === "repos/wlsdks/ontology-atlas/environments/release") {
  out({
    name: "release",
    can_admins_bypass: scenario.publicationAdminBypass ?? false,
    protection_rules: scenario.publicationReviewers === false
      ? []
      : [{ type: "required_reviewers", reviewers: [{ type: "User", reviewer: { login: "owner" } }] }],
    deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
  });
  process.exit(0);
}
if (args[0] === "api" && args[1] === "repos/wlsdks/ontology-atlas/environments/release/deployment-branch-policies") {
  out({ branch_policies: [
    ...(scenario.publicationBranches ?? ["main"]).map((name) => ({ name, type: "branch" })),
    ...(scenario.publicationTags ?? []).map((name) => ({ name, type: "tag" })),
  ] });
  process.exit(0);
}
if (args[0] === "api" && args[1]?.startsWith("repos/wlsdks/ontology-atlas/actions/workflows/")) {
  if (scenario.workflowMissing) {
    err("HTTP 404: Not Found");
    process.exit(1);
  }
  out({ state: scenario.workflowState ?? "active" });
  process.exit(0);
}
if (args[0] === "api" && args[1]?.startsWith("repos/wlsdks/ontology-atlas/git/ref/tags/")) {
  if (scenario.gitTagExists) {
    out({ ref: "refs/tags/" + args[1].split("/").pop(), object: { sha: "0".repeat(40) } });
    process.exit(0);
  }
  err("HTTP 404: Not Found");
  process.exit(1);
}
if (args[0] === "secret" && args[1] === "list") {
  const names = args.includes("--env")
    ? (scenario.secretNames ?? ${JSON.stringify(environmentSecrets)})
    : (scenario.repoSecretNames ?? ${JSON.stringify(repositorySecrets)});
  out(names.map((name) => ({ name })));
  process.exit(0);
}
if (args[0] === "release" && args[1] === "view") {
  if (scenario.releaseExists) {
    out({
      tagName: args[2],
      isDraft: Boolean(scenario.releaseDraft),
      isPrerelease: Boolean(scenario.releasePrerelease),
      url: "https://github.com/wlsdks/ontology-atlas/releases/tag/" + args[2],
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

function writeFakeGit(root, scenario) {
  const binPath = join(root, "fake-git.mjs");
  writeFileSync(
    binPath,
    `#!/usr/bin/env node
const scenario = ${JSON.stringify(scenario)};
const args = process.argv.slice(2);
if (args[0] === "rev-parse" && args[1] === "--verify" && args[2] === "--quiet" && args[3] === "refs/tags/${APP_TAG}") {
  if (scenario.localTagExists) {
    process.stdout.write("1".repeat(40) + "\\n");
    process.exit(0);
  }
  process.exit(1);
}
process.stderr.write("unexpected git call: " + args.join(" "));
process.exit(2);
`,
  );
  chmodSync(binPath, 0o755);
  return binPath;
}

function runReleaseGithub(fakeGhPath, fakeGitPath, args = [`--tag=${APP_TAG}`]) {
  return spawnSync(process.execPath, ["scripts/check-macos-release-github.mjs", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      OATLAS_GH_BIN: fakeGhPath,
      OATLAS_GIT_BIN: fakeGitPath,
    },
  });
}

function withFakeGh(scenario, run) {
  const root = mkdtempSync(join(tmpdir(), "omo-release-github-"));
  try {
    const fakeGhPath = writeFakeGh(root, scenario);
    const fakeGitPath = writeFakeGit(root, scenario);
    run(fakeGhPath, fakeGitPath);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("desktop GitHub release gate proves workflows, secrets, tag version, and clean release slot", () => {
  withFakeGh({}, (fakeGhPath, fakeGitPath) => {
    const result = runReleaseGithub(fakeGhPath, fakeGitPath);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /all required split-scope signing secret names/);
    assert.match(result.stdout, new RegExp(`${APP_TAG_PATTERN} matches package, Tauri, and Cargo versions`));
    assert.match(result.stdout, new RegExp(`${APP_TAG_PATTERN} has no existing local Git tag`));
    assert.match(result.stdout, new RegExp(`${APP_TAG_PATTERN} has no existing Git tag`));
    assert.match(result.stdout, new RegExp(`${APP_TAG_PATTERN} has no existing GitHub Release`));
  });
});

test("desktop GitHub release gate accepts API credentials in release-signing and legacy signing material at repository scope", () => {
  withFakeGh(
    { secretNames: environmentSecrets, repoSecretNames: repositorySecrets },
    (fakeGhPath, fakeGitPath) => {
      const result = runReleaseGithub(fakeGhPath, fakeGitPath);

      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /protected release-signing environment/);
    },
  );
});

test("desktop GitHub release gate fails before tag push when Developer ID direct-download secret names are missing", () => {
  withFakeGh({ secretNames: requiredSecrets.filter((name) => name !== "APPLE_API_ISSUER_ID") }, (fakeGhPath, fakeGitPath) => {
    const result = runReleaseGithub(fakeGhPath, fakeGitPath);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /missing release-signing environment secrets/);
    assert.match(result.stderr, /direct-download DMGs \(not Mac App Store submission\)/);
    assert.match(result.stderr, /APPLE_API_ISSUER_ID/);
    assert.match(result.stderr, /gh secret set APPLE_API_ISSUER_ID --env release-signing --repo wlsdks\/ontology-atlas/);
  });
});

test("desktop GitHub release gate requires the retained certificate and updater repository secrets", () => {
  withFakeGh({ repoSecretNames: repositorySecrets.slice(0, -1) }, (fakeGhPath, fakeGitPath) => {
    const result = runReleaseGithub(fakeGhPath, fakeGitPath);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /missing required repository signing secrets/);
    assert.match(result.stderr, /TAURI_SIGNING_PRIVATE_KEY_PASSWORD/);
  });
});

test("desktop GitHub release gate rejects obsolete Apple ID repository secrets", () => {
  withFakeGh({
    repoSecretNames: [...repositorySecrets, "APPLE_ID"],
  }, (fakeGhPath, fakeGitPath) => {
    const result = runReleaseGithub(fakeGhPath, fakeGitPath);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /obsolete or over-scoped repository signing secrets remain/);
    assert.match(result.stderr, /gh secret delete APPLE_ID --repo wlsdks\/ontology-atlas/);
  });
});

test("desktop GitHub release gate rejects API credential copies at repository scope", () => {
  withFakeGh({
    repoSecretNames: [...repositorySecrets, "APPLE_API_KEY_ID"],
  }, (fakeGhPath, fakeGitPath) => {
    const result = runReleaseGithub(fakeGhPath, fakeGitPath);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /obsolete or over-scoped repository signing secrets remain/);
    assert.match(result.stderr, /gh secret delete APPLE_API_KEY_ID --repo wlsdks\/ontology-atlas/);
  });
});

test("desktop GitHub release gate requires release-signing to admit only main", () => {
  withFakeGh({ environmentBranches: ["main", "release/*"] }, (fakeGhPath, fakeGitPath) => {
    const result = runReleaseGithub(fakeGhPath, fakeGitPath);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /release-signing must allow exactly the default branch main/);
  });
});

test("desktop GitHub release gate rejects admin bypass and signing-stage reviewers", () => {
  for (const scenario of [
    { environmentAdminBypass: true },
    { environmentReviewers: true },
    { environmentTags: ["v*"] },
  ]) {
    withFakeGh(scenario, (fakeGhPath, fakeGitPath) => {
      const result = runReleaseGithub(fakeGhPath, fakeGitPath);

      assert.equal(result.status, 1);
      assert.match(result.stderr, /release-signing/);
    });
  }
});

test("desktop GitHub release gate keeps publication behind reviewed main-only release environment", () => {
  for (const scenario of [
    { publicationAdminBypass: true },
    { publicationReviewers: false },
    { publicationBranches: ["main", "release/*"] },
    { publicationTags: ["v*"] },
  ]) {
    withFakeGh(scenario, (fakeGhPath, fakeGitPath) => {
      const result = runReleaseGithub(fakeGhPath, fakeGitPath);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /release/);
    });
  }
});

test("desktop GitHub release gate explains that a PR-only workflow cannot receive tag pushes yet", () => {
  withFakeGh({ workflowMissing: true }, (fakeGhPath, fakeGitPath) => {
    const result = runReleaseGithub(fakeGhPath, fakeGitPath);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /release-macos\.yml is not available to GitHub/);
    assert.match(result.stderr, /merge that PR into the default branch before pushing the release tag/);
  });
});

test("desktop GitHub release gate blocks an existing same-tag release slot", () => {
  withFakeGh({ releaseExists: true, releaseDraft: true }, (fakeGhPath, fakeGitPath) => {
    const result = runReleaseGithub(fakeGhPath, fakeGitPath);

    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(`release ${APP_TAG_PATTERN} already exists`));
    assert.match(result.stderr, /Delete the existing draft release/);
  });
});

test("desktop GitHub release gate blocks an existing same-tag Git ref before tag push", () => {
  withFakeGh({ gitTagExists: true }, (fakeGhPath, fakeGitPath) => {
    const result = runReleaseGithub(fakeGhPath, fakeGitPath);

    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(`git tag ${APP_TAG_PATTERN} already exists`));
    assert.match(result.stderr, /Inspect the existing tag workflow run or choose a new version/);
  });
});

test("desktop GitHub release gate blocks an existing local Git tag before tag push", () => {
  withFakeGh({ localTagExists: true }, (fakeGhPath, fakeGitPath) => {
    const result = runReleaseGithub(fakeGhPath, fakeGitPath);

    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(`local git tag ${APP_TAG_PATTERN} already exists`));
    assert.match(result.stderr, new RegExp(`git tag -d ${APP_TAG_PATTERN}`));
  });
});

test("desktop GitHub release gate help lists every required Developer ID direct-download secret and excludes the hosted website deploy", () => {
  const stdout = execFileSync(process.execPath, ["scripts/check-macos-release-github.mjs", "--help"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  for (const name of requiredSecrets) {
    assert.match(stdout, new RegExp(name));
  }
  assert.doesNotMatch(stdout, /FIREBASE_SERVICE_ACCOUNT_JSON/);
  assert.doesNotMatch(stdout, /Firebase/);
    assert.match(stdout, /hosted website deploy is intentionally excluded/);
  });
