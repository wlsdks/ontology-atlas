import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

// The release gates compare a tag against package.json/Tauri/Cargo, so these
// fixtures follow the repo version instead of freezing one — a frozen tag
// would fail on exactly the version bump the gate exists to protect.
const APP_TAG = `v${JSON.parse(readFileSync("package.json", "utf8")).version}`;
const APP_TAG_PATTERN = APP_TAG.replace(/\./g, "\\.");

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
    isDraft: Boolean(scenario.prDraft),
    mergedAt: scenario.prMergedAt ?? null,
    mergeStateStatus: scenario.prMergeState ?? "CLEAN",
    reviewDecision: scenario.prReviewDecision ?? "APPROVED",
    url: "https://github.com/wlsdks/ontology-atlas/pull/" + args[2],
    statusCheckRollup: scenario.prChecks ?? [
      { status: "COMPLETED", conclusion: "SUCCESS" },
    ],
  });
  process.exit(0);
}
if (args[0] === "pr" && args[1] === "list" && args.includes("--state") && args.includes("merged")) {
  if (scenario.latestMergedPrCheckFails) {
    err("latest merged PR lookup failed");
    process.exit(1);
  }
  const number = scenario.latestMergedPrNumber ?? 274;
  out(number
    ? [{
        number,
        title: scenario.latestMergedPrTitle ?? "Latest merged PR",
        mergedAt: scenario.latestMergedPrMergedAt ?? "2026-06-07T03:47:53Z",
      }]
    : []);
  process.exit(0);
}
if (args[0] === "api" && args[1] === "repos/wlsdks/ontology-atlas/actions/workflows/release-macos.yml") {
  if (scenario.workflowMissing) {
    err("HTTP 404: Not Found");
    process.exit(1);
  }
  if (scenario.workflowCheckFails) {
    err("workflow API unavailable");
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
  if (scenario.gitTagCheckFails) {
    err("tag API unavailable");
    process.exit(1);
  }
  err("HTTP 404: Not Found");
  process.exit(1);
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
  const names = scenario.secretNames ?? ${JSON.stringify([...requiredSecrets])};
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
    url: "https://github.com/wlsdks/ontology-atlas/releases/tag/" + args[2],
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

function writeFakeGit(root, scenario) {
  const binPath = join(root, "fake-git.mjs");
  writeFileSync(
    binPath,
    `#!/usr/bin/env node
const scenario = ${JSON.stringify(scenario)};
const args = process.argv.slice(2);
if (args[0] === "rev-parse" && args[1] === "--verify" && args[2] === "--quiet" && args[3]?.startsWith("refs/tags/")) {
  if (scenario.localTagExists) {
    process.stdout.write("1".repeat(40) + "\\n");
    process.exit(0);
  }
  if (scenario.localTagCheckFails) {
    process.stderr.write("local tag check failed");
    process.exit(2);
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

function withFakeGh(scenario, run) {
  const root = mkdtempSync(join(tmpdir(), "omo-release-status-"));
  try {
    run(writeFakeGh(root, scenario), writeFakeGit(root, scenario));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runStatus(fakeGhPath, args = [`--tag=${APP_TAG}`, "--pr=274"], extraEnv = {}) {
  const fakeGitPath = fakeGhPath.replace(/fake-gh\.mjs$/, "fake-git.mjs");
  return spawnSync(process.execPath, ["scripts/check-macos-release-status.mjs", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    env: {
      ...process.env,
      OATLAS_GH_BIN: fakeGhPath,
      OATLAS_GIT_BIN: fakeGitPath,
      OATLAS_RELEASE_STATUS_SKIP_DOWNLOAD_VERIFY: "1",
      OATLAS_RELEASE_STATUS_NOW: "2026-06-06T15:30:00.000Z",
      ...extraEnv,
    },
  });
}

test("desktop release status emits machine-readable blockers for automation", () => {
  withFakeGh(
    {
      prMergeState: "BLOCKED",
      prReviewDecision: "REVIEW_REQUIRED",
      secretNames: [],
      releaseMissing: true,
    },
    (fakeGhPath) => {
      const result = runStatus(fakeGhPath, [`--tag=${APP_TAG}`, "--pr=274", "--json"]);

      assert.equal(result.status, 1);
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.schemaVersion, 1);
      assert.match(payload.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
      assert.equal(payload.repo, "wlsdks/ontology-atlas");
      assert.equal(payload.tag, `${APP_TAG}`);
      assert.equal(payload.pr, "274");
      assert.equal(payload.ready, false);
      assert.equal(payload.status, "blocked");
      assert.equal(payload.readyAt, null);
      assert.equal(payload.blockedAt, payload.generatedAt);
      assert.equal(payload.blockerCount, 3);
      assert.deepEqual(payload.missingSecrets, requiredSecrets);
      assert.deepEqual(payload.blockerIds, [
        "pull_request",
        "apple_release_secrets",
        "github_release",
      ]);
      assert.deepEqual(payload.localBlockerIds, []);
      assert.deepEqual(payload.externalBlockerIds, [
        "pull_request",
        "apple_release_secrets",
        "github_release",
      ]);
      assert.deepEqual(payload.blockersByOwner, {
        reviewer: ["pull_request"],
        release_operator: ["apple_release_secrets", "github_release"],
      });
      assert.deepEqual(Object.keys(payload.nextActionsByOwner), ["reviewer", "release_operator"]);
      assert.deepEqual(
        payload.nextActionsByOwner.reviewer.map((action) => action.id),
        ["pull_request"],
      );
      assert.deepEqual(
        payload.nextActionsByOwner.release_operator.map((action) => action.id),
        ["apple_release_secrets", "github_release"],
      );
      assert.deepEqual(
        payload.nextActions.map((action) => action.id),
        ["pull_request", "apple_release_secrets", "github_release"],
      );
      assert.deepEqual(
        payload.nextActions.map((action) => action.scope),
        ["external", "external", "external"],
      );
      assert.deepEqual(
        payload.nextActions.map((action) => action.owner),
        ["reviewer", "release_operator", "release_operator"],
      );
      assert.deepEqual(
        payload.nextActions.find((action) => action.id === "pull_request").commands,
        [
          "gh pr view 274 --repo wlsdks/ontology-atlas --json reviewDecision,mergeStateStatus,statusCheckRollup,url",
        ],
      );
      assert.deepEqual(
        payload.nextActions.find((action) => action.id === "apple_release_secrets").commands.at(-1),
        "gh secret set APPLE_TEAM_ID --repo wlsdks/ontology-atlas < /path/to/APPLE_TEAM_ID",
      );
      assert.deepEqual(
        payload.nextActions.find((action) => action.id === "github_release").commands,
        [
          "gh pr view 274 --repo wlsdks/ontology-atlas --json state,mergedAt,reviewDecision,mergeStateStatus,statusCheckRollup,url",
          `pnpm desktop:release-github -- --repo=wlsdks/ontology-atlas --tag=${APP_TAG}`,
          "gh secret list --repo wlsdks/ontology-atlas",
          "DEFAULT_BRANCH=\"$(gh repo view wlsdks/ontology-atlas --json defaultBranchRef --jq .defaultBranchRef.name)\"",
          "git fetch origin \"$DEFAULT_BRANCH\" --tags",
          "pnpm desktop:release-source -- --repo=wlsdks/ontology-atlas --sha=\"$(git rev-parse \"origin/$DEFAULT_BRANCH\")\"",
          `git tag ${APP_TAG} "origin/$DEFAULT_BRANCH"`,
          `git push origin ${APP_TAG}`,
          `pnpm desktop:release-run -- --repo=wlsdks/ontology-atlas --tag=${APP_TAG}`,
          `gh release view ${APP_TAG} --repo wlsdks/ontology-atlas`,
          `pnpm desktop:verify-download -- --repo=wlsdks/ontology-atlas --tag=${APP_TAG}`,
        ],
      );
      assert.deepEqual(
        payload.checks.map((check) => check.id),
        [
          "github_cli_auth",
          "version_alignment",
          "local_preflight",
          "pull_request",
          "release_workflow",
          "release_tag_slot",
          "apple_release_secrets",
          "github_release",
        ],
      );
      assert.deepEqual(
        payload.checks.filter((check) => check.status === "blocked").map((check) => check.scope),
        ["external", "external", "external"],
      );
      assert.deepEqual(
        payload.checks.filter((check) => check.status === "blocked").map((check) => check.owner),
        ["reviewer", "release_operator", "release_operator"],
      );
      assert.deepEqual(
        payload.checks.filter((check) => check.status === "blocked").map((check) => check.label),
        ["Pull request", "Developer ID direct-download secrets", "GitHub Release"],
      );
      assert.deepEqual(
        payload.checks.filter((check) => check.status === "blocked").map((check) => check.id),
        ["pull_request", "apple_release_secrets", "github_release"],
      );
      assert.match(
        payload.checks.find((check) => check.label === "Developer ID direct-download secrets").next,
        /gh secret set APPLE_TEAM_ID --repo wlsdks\/ontology-atlas/,
      );
      assert.match(result.stderr, /blocked: 3 release requirement/);
    },
  );
});

test("desktop release status writes machine-readable blockers to a JSON file", () => {
  withFakeGh(
    {
      prMergeState: "BLOCKED",
      prReviewDecision: "REVIEW_REQUIRED",
      secretNames: [],
      releaseMissing: true,
    },
    (fakeGhPath) => {
      const root = mkdtempSync(join(tmpdir(), "omo-release-status-json-"));
      try {
        const jsonPath = join(root, "nested", "release-status.json");
        const result = runStatus(fakeGhPath, [
          `--tag=${APP_TAG}`,
          "--pr=274",
          `--json-file=${jsonPath}`,
        ]);

        assert.equal(result.status, 1);
        assert.match(result.stdout, new RegExp(`\\[desktop-release-status\\] wlsdks\\/ontology-atlas ${APP_TAG_PATTERN}`));
        assert.ok(existsSync(jsonPath));
        const payload = JSON.parse(readFileSync(jsonPath, "utf8"));
        assert.equal(payload.schemaVersion, 1);
        assert.match(payload.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
        assert.equal(payload.ready, false);
        assert.equal(payload.status, "blocked");
        assert.equal(payload.readyAt, null);
        assert.equal(payload.blockedAt, payload.generatedAt);
        assert.equal(payload.blockerCount, 3);
        assert.deepEqual(payload.missingSecrets, requiredSecrets);
        assert.deepEqual(payload.localBlockerIds, []);
        assert.deepEqual(payload.externalBlockerIds, [
          "pull_request",
          "apple_release_secrets",
          "github_release",
        ]);
        assert.deepEqual(payload.blockersByOwner, {
          reviewer: ["pull_request"],
          release_operator: ["apple_release_secrets", "github_release"],
        });
        assert.deepEqual(Object.keys(payload.nextActionsByOwner), ["reviewer", "release_operator"]);
        assert.deepEqual(
          payload.nextActionsByOwner.release_operator.map((action) => action.label),
          ["Developer ID direct-download secrets", "GitHub Release"],
        );
        assert.deepEqual(payload.blockerIds, [
          "pull_request",
          "apple_release_secrets",
          "github_release",
        ]);
        assert.deepEqual(
          payload.nextActions.map((action) => action.id),
          ["pull_request", "apple_release_secrets", "github_release"],
        );
        assert.equal(
          payload.nextActions.find((action) => action.id === "apple_release_secrets").commands.length,
          requiredSecrets.length,
        );
        assert.deepEqual(
          payload.checks.filter((check) => check.status === "blocked").map((check) => check.id),
          ["pull_request", "apple_release_secrets", "github_release"],
        );
        assert.deepEqual(
          payload.checks.filter((check) => check.status === "blocked").map((check) => check.label),
          ["Pull request", "Developer ID direct-download secrets", "GitHub Release"],
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});

test("desktop release status writes a human-readable markdown checklist", () => {
  withFakeGh(
    {
      prMergeState: "BLOCKED",
      prReviewDecision: "REVIEW_REQUIRED",
      secretNames: [],
      releaseMissing: true,
    },
    (fakeGhPath) => {
      const root = mkdtempSync(join(tmpdir(), "omo-release-status-md-"));
      try {
        const markdownPath = join(root, "nested", "release-status.md");
        const result = runStatus(fakeGhPath, [
          `--tag=${APP_TAG}`,
          "--pr=274",
          `--markdown-file=${markdownPath}`,
        ]);

        assert.equal(result.status, 1);
        assert.ok(existsSync(markdownPath));
        const markdown = readFileSync(markdownPath, "utf8");
        assert.match(markdown, /^# macOS Release Status/);
        assert.match(markdown, /- Repo: `wlsdks\/ontology-atlas`/);
        assert.match(markdown, new RegExp("- Tag: `" + APP_TAG_PATTERN + "`"));
        assert.match(markdown, /- Status: blocked/);
        assert.match(markdown, /- Ready: no/);
        assert.match(markdown, /- Ready at: not ready/);
        assert.match(markdown, /- Blocked at: \d{4}-\d{2}-\d{2}T/);
        assert.match(markdown, /- Local blockers: none/);
        assert.match(markdown, /- External blockers: pull_request, apple_release_secrets, github_release/);
        assert.match(markdown, /## Owner Handoff/);
        assert.match(markdown, /### reviewer/);
        assert.match(markdown, /- Pull request \(`pull_request`\): Resolve PR review\/merge blockers: https:\/\/github\.com\/wlsdks\/ontology-atlas\/pull\/274/);
        assert.match(markdown, /### release_operator/);
        assert.match(markdown, /- Developer ID direct-download secrets \(`apple_release_secrets`\): gh secret set APPLE_CERTIFICATE_P12_BASE64/);
        assert.match(markdown, /  - First command:\n    - `gh secret set APPLE_CERTIFICATE_P12_BASE64 --repo wlsdks\/ontology-atlas < \/path\/to\/APPLE_CERTIFICATE_P12_BASE64`/);
        assert.match(markdown, /## Blockers/);
        assert.match(markdown, /- \[ \] Pull request \(`pull_request`\)/);
        assert.match(markdown, /  - Scope: external/);
        assert.match(markdown, /  - Owner: reviewer/);
        assert.match(markdown, /- \[ \] Developer ID direct-download secrets \(`apple_release_secrets`\)/);
        assert.match(markdown, /  - Owner: release_operator/);
        assert.match(markdown, /- \[ \] GitHub Release \(`github_release`\)/);
        assert.match(markdown, new RegExp(`git push origin ${APP_TAG_PATTERN}`));
        assert.match(markdown, /gh repo view wlsdks\/ontology-atlas --json defaultBranchRef --jq \.defaultBranchRef\.name/);
        assert.match(markdown, /gh secret set APPLE_TEAM_ID --repo wlsdks\/ontology-atlas/);
        assert.match(markdown, /  - Commands \(run in one shell session\):\n    - `gh secret set APPLE_CERTIFICATE_P12_BASE64 --repo wlsdks\/ontology-atlas < \/path\/to\/APPLE_CERTIFICATE_P12_BASE64`/);
        assert.match(markdown, /  - Missing secrets:\n    - `APPLE_CERTIFICATE_P12_BASE64`/);
        assert.match(markdown, /## Checks/);
        assert.match(markdown, /- \[x\] GitHub CLI auth \(`github_cli_auth`\)/);
        assert.match(markdown, /- \[-\] Local release preflight \(`local_preflight`\) - not asserted by desktop:release-status/);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});

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
          detailsUrl: "https://github.com/wlsdks/ontology-atlas/actions/runs/1/job/2",
        },
        { name: "lint", status: "COMPLETED", conclusion: "SUCCESS" },
        {
          name: "build",
          status: "IN_PROGRESS",
          conclusion: null,
          startedAt: "2026-06-06T13:00:00Z",
        },
        { name: "deploy", status: "QUEUED", conclusion: "" },
      ],
      secretNames: [],
      releaseMissing: true,
    },
    (fakeGhPath) => {
      const result = runStatus(fakeGhPath);

      assert.equal(result.status, 1);
      assert.match(result.stdout, /local blockers: none/);
      assert.match(result.stdout, /external blockers: pull_request, apple_release_secrets, github_release/);
      assert.match(result.stdout, /next handoff by owner:\n  reviewer: pull_request\n  release_operator: apple_release_secrets, github_release/);
      assert.match(result.stdout, new RegExp(`✓ Version alignment: ${APP_TAG_PATTERN} matches package, Tauri, Cargo, and release-facts versions`));
      assert.match(result.stdout, /✗ Pull request: PR #274 is not merge-ready/);
      assert.match(result.stdout, /review=REVIEW_REQUIRED/);
      assert.match(result.stdout, /merge=BLOCKED/);
      assert.match(result.stdout, /1\/4 checks successful/);
      assert.match(
        result.stdout,
        /blocked checks: desktop release preflight=FAILURE .*build=IN_PROGRESS since 2026-06-06T13:00:00.000Z \(2h 30m\), deploy=QUEUED/,
      );
      assert.match(result.stdout, /actions\/runs\/1\/job\/2/);
      assert.match(result.stdout, /next: Run gh pr checks 274 --repo wlsdks\/ontology-atlas/);
      assert.match(result.stdout, /commands \(run in one shell session\):\n    - gh pr checks 274 --repo wlsdks\/ontology-atlas/);
      assert.match(result.stdout, /✗ Developer ID direct-download secrets: missing APPLE_CERTIFICATE_P12_BASE64/);
      assert.match(result.stdout, /not Mac App Store submission/);
      assert.match(result.stdout, /gh secret set APPLE_TEAM_ID --repo wlsdks\/ontology-atlas/);
      assert.match(result.stdout, /✗ GitHub Release: release not found/);
      assert.match(result.stdout, /release-macos\.yml can publish signed DMGs/);
      assert.match(result.stdout, /DEFAULT_BRANCH="\$\(gh repo view wlsdks\/ontology-atlas --json defaultBranchRef --jq \.defaultBranchRef\.name\)"/);
      assert.doesNotMatch(result.stdout, /Firebase Hosting deploy secrets/);
      assert.match(result.stderr, /blocked: 3 release requirement/);
    },
  );
});

test("desktop release status exposes command arrays for actionable blockers", () => {
  withFakeGh(
    {
      prMergeState: "BLOCKED",
      prReviewDecision: "REVIEW_REQUIRED",
      prChecks: [{ name: "build", status: "IN_PROGRESS", conclusion: null }],
      secretNames: [],
      releaseMissing: true,
    },
    (fakeGhPath) => {
      const result = runStatus(fakeGhPath, [`--tag=${APP_TAG}`, "--pr=274", "--json"]);

      assert.equal(result.status, 1);
      const payload = JSON.parse(result.stdout);
      assert.deepEqual(
        payload.nextActions.find((action) => action.id === "pull_request").commands,
        [
          "gh pr checks 274 --repo wlsdks/ontology-atlas",
          "gh pr view 274 --repo wlsdks/ontology-atlas --json reviewDecision,mergeStateStatus,statusCheckRollup,url",
        ],
      );
      assert.equal(
        payload.checks.find((check) => check.id === "apple_release_secrets").commands.length,
        requiredSecrets.length,
      );
      assert.deepEqual(
        payload.checks.find((check) => check.id === "apple_release_secrets").missingSecrets,
        requiredSecrets,
      );
      assert.deepEqual(
        payload.nextActions.find((action) => action.id === "github_release").commands,
        [
          "gh pr view 274 --repo wlsdks/ontology-atlas --json state,mergedAt,reviewDecision,mergeStateStatus,statusCheckRollup,url",
          `pnpm desktop:release-github -- --repo=wlsdks/ontology-atlas --tag=${APP_TAG}`,
          "gh secret list --repo wlsdks/ontology-atlas",
          "DEFAULT_BRANCH=\"$(gh repo view wlsdks/ontology-atlas --json defaultBranchRef --jq .defaultBranchRef.name)\"",
          "git fetch origin \"$DEFAULT_BRANCH\" --tags",
          "pnpm desktop:release-source -- --repo=wlsdks/ontology-atlas --sha=\"$(git rev-parse \"origin/$DEFAULT_BRANCH\")\"",
          `git tag ${APP_TAG} "origin/$DEFAULT_BRANCH"`,
          `git push origin ${APP_TAG}`,
          `pnpm desktop:release-run -- --repo=wlsdks/ontology-atlas --tag=${APP_TAG}`,
          `gh release view ${APP_TAG} --repo wlsdks/ontology-atlas`,
          `pnpm desktop:verify-download -- --repo=wlsdks/ontology-atlas --tag=${APP_TAG}`,
        ],
      );
    },
  );
});

test("desktop release status blocks stale local release tags", () => {
  withFakeGh({ localTagExists: true }, (fakeGhPath) => {
    const result = runStatus(fakeGhPath, [`--tag=${APP_TAG}`, "--pr=274", "--json"]);

    assert.equal(result.status, 1);
    const payload = JSON.parse(result.stdout);
    assert.deepEqual(payload.localBlockerIds, ["release_tag_slot"]);
    assert.deepEqual(payload.externalBlockerIds, ["download_assets"]);
    assert.deepEqual(payload.blockersByOwner, {
      developer: ["release_tag_slot"],
      release_operator: ["download_assets"],
    });
    const blocker = payload.checks.find((check) => check.id === "release_tag_slot");
    assert.equal(blocker.scope, "local");
    assert.equal(blocker.owner, "developer");
    assert.match(blocker.detail, new RegExp(`local git tag ${APP_TAG_PATTERN} already exists`));
    assert.deepEqual(blocker.commands, [`git tag -d ${APP_TAG}`]);
  });
});

test("desktop release status blocks existing remote release tags", () => {
  withFakeGh({ gitTagExists: true }, (fakeGhPath) => {
    const result = runStatus(fakeGhPath, [`--tag=${APP_TAG}`, "--pr=274", "--json"]);

    assert.equal(result.status, 1);
    const payload = JSON.parse(result.stdout);
    assert.deepEqual(payload.localBlockerIds, []);
    assert.deepEqual(payload.externalBlockerIds, ["release_tag_slot", "download_assets"]);
    assert.deepEqual(payload.blockersByOwner, {
      release_operator: ["release_tag_slot", "download_assets"],
    });
    const blocker = payload.checks.find((check) => check.id === "release_tag_slot");
    assert.equal(blocker.scope, "external");
    assert.equal(blocker.owner, "release_operator");
    assert.match(blocker.detail, new RegExp(`git tag ${APP_TAG_PATTERN} already exists`));
    assert.deepEqual(blocker.commands, [
      `gh api repos/wlsdks/ontology-atlas/git/ref/tags/${APP_TAG}`,
      "gh run list --repo wlsdks/ontology-atlas --workflow release-macos.yml --event push --limit 10",
    ]);
  });
});

test("desktop release status blocks unavailable release workflows", () => {
  withFakeGh({ workflowMissing: true }, (fakeGhPath) => {
    const result = runStatus(fakeGhPath, [`--tag=${APP_TAG}`, "--pr=274", "--json"]);

    assert.equal(result.status, 1);
    const payload = JSON.parse(result.stdout);
    assert.deepEqual(payload.localBlockerIds, []);
    assert.deepEqual(payload.externalBlockerIds, ["release_workflow", "download_assets"]);
    assert.deepEqual(payload.blockersByOwner, {
      release_operator: ["release_workflow", "download_assets"],
    });
    const blocker = payload.checks.find((check) => check.id === "release_workflow");
    assert.equal(blocker.scope, "external");
    assert.equal(blocker.owner, "release_operator");
    assert.match(blocker.detail, /release-macos\.yml is not available to GitHub/);
    assert.match(blocker.next, /merged into the default branch/);
    assert.deepEqual(blocker.commands, [
      "gh api repos/wlsdks/ontology-atlas/actions/workflows/release-macos.yml",
      "gh pr view 274 --repo wlsdks/ontology-atlas --json state,mergedAt,reviewDecision,mergeStateStatus,url",
    ]);
  });
});

test("desktop release status blocks disabled release workflows", () => {
  withFakeGh({ workflowState: "disabled_manually" }, (fakeGhPath) => {
    const result = runStatus(fakeGhPath, [`--tag=${APP_TAG}`, "--pr=274", "--json"]);

    assert.equal(result.status, 1);
    const payload = JSON.parse(result.stdout);
    assert.deepEqual(payload.externalBlockerIds, ["release_workflow", "download_assets"]);
    const blocker = payload.checks.find((check) => check.id === "release_workflow");
    assert.match(blocker.detail, /workflow is disabled_manually/);
    assert.deepEqual(blocker.commands, [
      "gh workflow enable release-macos.yml --repo wlsdks/ontology-atlas",
    ]);
  });
});

test("desktop release status separates local and external blockers", () => {
  withFakeGh({}, (fakeGhPath) => {
    const result = runStatus(fakeGhPath, ["--tag=v9.9.9", "--pr=274", "--json"]);

    assert.equal(result.status, 1);
    const payload = JSON.parse(result.stdout);
    assert.deepEqual(payload.localBlockerIds, ["version_alignment"]);
    assert.deepEqual(payload.externalBlockerIds, ["download_assets"]);
    assert.deepEqual(payload.blockersByOwner, {
      developer: ["version_alignment"],
      release_operator: ["download_assets"],
    });
    assert.equal(
      payload.checks.find((check) => check.id === "version_alignment").scope,
      "local",
    );
    assert.equal(
      payload.checks.find((check) => check.id === "version_alignment").owner,
      "developer",
    );
  });
});

test("desktop release status skips check rerun advice when checks already pass", () => {
  withFakeGh(
    {
      prMergeState: "BLOCKED",
      prReviewDecision: "REVIEW_REQUIRED",
      releaseMissing: true,
    },
    (fakeGhPath) => {
      const result = runStatus(fakeGhPath);

      assert.equal(result.status, 1);
      assert.match(result.stdout, /1\/1 checks successful/);
      assert.match(result.stdout, /next: Resolve PR review\/merge blockers:/);
      assert.doesNotMatch(result.stdout, /next: Run gh pr checks 274/);
    },
  );
});

test("desktop release status reports draft PRs as actionable merge blockers", () => {
  withFakeGh(
    {
      prDraft: true,
      releaseMissing: true,
    },
    (fakeGhPath) => {
      const result = runStatus(fakeGhPath, [`--tag=${APP_TAG}`, "--pr=274", "--json"]);

      assert.equal(result.status, 1);
      const payload = JSON.parse(result.stdout);
      const blocker = payload.checks.find((check) => check.id === "pull_request");
      assert.equal(blocker.status, "blocked");
      assert.match(blocker.detail, /draft=yes/);
      assert.match(blocker.detail, /merge=CLEAN/);
      assert.match(blocker.detail, /1\/1 checks successful/);
      assert.match(blocker.next, /gh pr ready 274 --repo wlsdks\/ontology-atlas/);
      assert.doesNotMatch(blocker.next, /gh pr checks 274/);
      assert.deepEqual(blocker.commands, [
        "gh pr view 274 --repo wlsdks/ontology-atlas --json reviewDecision,mergeStateStatus,statusCheckRollup,url",
        "gh pr ready 274 --repo wlsdks/ontology-atlas",
      ]);
    },
  );
});

test("desktop release status accepts clean PRs when no review is required", () => {
  withFakeGh(
    {
      prReviewDecision: "",
    },
    (fakeGhPath) => {
      const result = runStatus(fakeGhPath, [`--tag=${APP_TAG}`, "--pr=274", "--json"]);

      assert.equal(result.status, 1, result.stdout);
      const payload = JSON.parse(result.stdout);
      const check = payload.checks.find((row) => row.id === "pull_request");
      assert.equal(check.status, "ok");
      assert.match(check.detail, /PR #274 is merge-ready/);
    },
  );
});

test("desktop release status cannot report ready when download verification is skipped", () => {
  withFakeGh({}, (fakeGhPath) => {
    const result = runStatus(fakeGhPath);

    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout, new RegExp(`✓ Version alignment: ${APP_TAG_PATTERN} matches package, Tauri, Cargo, and release-facts versions`));
    assert.match(result.stdout, /✓ Pull request: PR #274 is merge-ready/);
    assert.match(result.stdout, /✓ Developer ID direct-download secrets: all required Developer ID signing\/notary secret names exist for direct-download DMGs/);
    assert.match(result.stdout, new RegExp(`✓ GitHub Release: ${APP_TAG_PATTERN} is public and stable`));
    assert.match(result.stdout, /✗ Download assets: verification skipped by OATLAS_RELEASE_STATUS_SKIP_DOWNLOAD_VERIFY=1/);
    assert.doesNotMatch(result.stdout, /Hosted website/);
    assert.doesNotMatch(result.stdout, /ready: public macOS release requirements are satisfied/);
  });
});

test("desktop release status JSON exposes skipped download verification as a blocker", () => {
  withFakeGh({}, (fakeGhPath) => {
    const result = runStatus(fakeGhPath, [`--tag=${APP_TAG}`, "--pr=274", "--json"]);

    assert.equal(result.status, 1, result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.schemaVersion, 1);
    assert.match(payload.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(payload.ready, false);
    assert.equal(payload.status, "blocked");
    assert.equal(payload.readyAt, null);
    assert.equal(payload.blockedAt, payload.generatedAt);
    assert.equal(payload.blockerCount, 1);
    assert.deepEqual(payload.missingSecrets, []);
    assert.deepEqual(payload.localBlockerIds, []);
    assert.deepEqual(payload.externalBlockerIds, ["download_assets"]);
    assert.deepEqual(payload.blockersByOwner, { release_operator: ["download_assets"] });
    assert.deepEqual(payload.blockerIds, ["download_assets"]);
    assert.equal(payload.nextActions.length, 1);
    assert.equal(payload.nextActions[0].id, "download_assets");
    assert.deepEqual(
      payload.checks.map((check) => check.status),
      ["ok", "ok", "skipped", "ok", "ok", "ok", "ok", "ok", "blocked"],
    );
    assert.deepEqual(
      payload.checks.map((check) => check.id),
      [
        "github_cli_auth",
        "version_alignment",
        "local_preflight",
        "pull_request",
        "release_workflow",
        "release_tag_slot",
        "apple_release_secrets",
        "github_release",
        "download_assets",
      ],
    );
    assert.match(result.stderr, /blocked: 1 release requirement/);
  });
});

test("desktop release status blocks JSON readiness without PR evidence", () => {
  withFakeGh({}, (fakeGhPath) => {
    const result = runStatus(fakeGhPath, [`--tag=${APP_TAG}`, "--json"]);

    assert.equal(result.status, 1);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ready, false);
    assert.equal(payload.status, "blocked");
    assert.deepEqual(payload.blockerIds, ["pull_request", "download_assets"]);
    assert.deepEqual(payload.blockersByOwner, {
      reviewer: ["pull_request"],
      release_operator: ["download_assets"],
    });
    const blocker = payload.checks.find((check) => check.id === "pull_request");
    assert.equal(blocker.status, "blocked");
    assert.equal(blocker.detail, "--pr=NUMBER is required to prove review and merge readiness");
    assert.equal(blocker.next, `Rerun desktop:release-status with --pr=NUMBER, or use pnpm desktop:goal-audit -- --pr=NUMBER --tag=${APP_TAG} for the full completion gate.`);
    assert.deepEqual(blocker.commands, [
      `pnpm desktop:release-status -- --pr=<number> --tag=${APP_TAG}`,
      `pnpm desktop:goal-audit -- --pr=<number> --tag=${APP_TAG}`,
    ]);
  });
});

test("desktop release status records local preflight proof when goal audit passes it through", () => {
  withFakeGh({}, (fakeGhPath) => {
    const result = runStatus(
      fakeGhPath,
      [`--tag=${APP_TAG}`, "--pr=274", "--json"],
      { OATLAS_RELEASE_STATUS_LOCAL_PREFLIGHT: "1" },
    );

    assert.equal(result.status, 1, result.stdout);
    const payload = JSON.parse(result.stdout);
    const preflight = payload.checks.find((check) => check.id === "local_preflight");
    assert.equal(preflight.status, "ok");
    assert.equal(preflight.scope, "local");
    assert.equal(preflight.owner, "developer");
    assert.match(preflight.detail, /desktop:release-preflight passed before this audit/);
    assert.match(preflight.detail, /LaunchServices app content proof/);
    assert.match(preflight.detail, /DMG install smoke/);
  });
});

test("desktop release status markdown marks skipped download verification as blocked", () => {
  withFakeGh({}, (fakeGhPath) => {
    const root = mkdtempSync(join(tmpdir(), "omo-release-status-md-ready-"));
    try {
      const markdownPath = join(root, "release-status.md");
      const result = runStatus(fakeGhPath, [
        `--tag=${APP_TAG}`,
        "--pr=274",
        `--markdown-file=${markdownPath}`,
      ]);

      assert.equal(result.status, 1, result.stdout);
      const markdown = readFileSync(markdownPath, "utf8");
      assert.match(markdown, /- Status: blocked/);
      assert.match(markdown, /- Ready: no/);
      assert.match(markdown, /- Ready at: not ready/);
      assert.match(markdown, /- Blocked at: \d{4}-\d{2}-\d{2}T/);
      assert.match(markdown, /- \[ \] Download assets \(`download_assets`\)/);
      assert.match(markdown, /- \[x\] Pull request \(`pull_request`\)/);
      assert.match(markdown, /- \[-\] Local release preflight \(`local_preflight`\)/);
      assert.doesNotMatch(markdown, /No blockers\./);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

test("desktop release status keeps Firebase out when GitHub secret listing fails", () => {
  withFakeGh({ secretListFails: true, releaseMissing: true }, (fakeGhPath) => {
    const result = runStatus(fakeGhPath);

    assert.equal(result.status, 1);
    assert.match(result.stdout, /✗ Developer ID direct-download secrets: secret API unavailable/);
    assert.doesNotMatch(result.stdout, /Firebase Hosting deploy secrets/);
    assert.doesNotMatch(result.stderr, /Firebase Hosting deploy secrets/);
  });
});

test("desktop release status keeps Firebase out when GitHub secret JSON is malformed", () => {
  withFakeGh({ secretListInvalidJson: true, releaseMissing: true }, (fakeGhPath) => {
    const result = runStatus(fakeGhPath);

    assert.equal(result.status, 1);
    assert.match(result.stdout, /✗ Developer ID direct-download secrets: gh secret list .* returned invalid JSON/);
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

      assert.equal(result.status, 1, result.stdout);
      assert.match(result.stdout, /✓ Pull request: PR #274 is already merged/);
      assert.doesNotMatch(result.stdout, /ready: public macOS release requirements are satisfied/);
    },
  );
});

test("desktop release status blocks stale merged PR evidence", () => {
  withFakeGh(
    {
      prState: "MERGED",
      prMergeState: "UNKNOWN",
      prMergedAt: "2026-05-26T00:00:00Z",
      latestMergedPrNumber: 303,
      latestMergedPrTitle: "Clarify direct-download macOS release gates",
    },
    (fakeGhPath) => {
      const result = runStatus(fakeGhPath, [`--tag=${APP_TAG}`, "--pr=274", "--json"]);

      assert.equal(result.status, 1);
      const payload = JSON.parse(result.stdout);
      assert.deepEqual(payload.blockerIds, ["pull_request", "download_assets"]);
      const blocker = payload.checks.find((check) => check.id === "pull_request");
      assert.equal(blocker.status, "blocked");
      assert.equal(blocker.detail, "PR #274 is merged, but latest merged PR is #303: Clarify direct-download macOS release gates");
      assert.equal(blocker.next, "Rerun the audit with --pr=303 so release readiness cites the latest merged PR on the release branch.");
      assert.deepEqual(blocker.commands, [
        `pnpm desktop:release-status -- --pr=303 --tag=${APP_TAG}`,
        `pnpm desktop:goal-audit -- --pr=303 --tag=${APP_TAG}`,
      ]);
    },
  );
});

test("desktop release status skips merge advice for missing releases after PR merge", () => {
  withFakeGh(
    {
      prState: "MERGED",
      prMergeState: "UNKNOWN",
      prMergedAt: "2026-05-26T00:00:00Z",
      secretNames: [],
      releaseMissing: true,
    },
    (fakeGhPath) => {
      const result = runStatus(fakeGhPath, [`--tag=${APP_TAG}`, "--pr=274", "--json"]);

      assert.equal(result.status, 1);
      const payload = JSON.parse(result.stdout);
      const blocker = payload.checks.find((check) => check.id === "github_release");
      assert.match(blocker.next, new RegExp(`^Add Developer ID direct-download signing\\/notarization secrets \\(not Mac App Store submission\\), then push ${APP_TAG_PATTERN}`));
      assert.doesNotMatch(blocker.next, /Merge the desktop PR/);
      assert.equal(
        blocker.commands[0],
        "gh pr view 274 --repo wlsdks/ontology-atlas --json state,mergedAt,reviewDecision,mergeStateStatus,statusCheckRollup,url",
      );
    },
  );
});

test("desktop release status handles missing releases without PR evidence", () => {
  withFakeGh(
    {
      secretNames: [],
      releaseMissing: true,
    },
    (fakeGhPath) => {
      const result = runStatus(fakeGhPath, [`--tag=${APP_TAG}`, "--json"]);

      assert.equal(result.status, 1);
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.pr, null);
      assert.deepEqual(
        payload.checks.find((check) => check.id === "pull_request"),
        {
          id: "pull_request",
          label: "Pull request",
          status: "blocked",
          detail: "--pr=NUMBER is required to prove review and merge readiness",
          next: `Rerun desktop:release-status with --pr=NUMBER, or use pnpm desktop:goal-audit -- --pr=NUMBER --tag=${APP_TAG} for the full completion gate.`,
          commands: [
            `pnpm desktop:release-status -- --pr=<number> --tag=${APP_TAG}`,
            `pnpm desktop:goal-audit -- --pr=<number> --tag=${APP_TAG}`,
          ],
          scope: "external",
          owner: "reviewer",
        },
      );
      const blocker = payload.checks.find((check) => check.id === "github_release");
      assert.match(blocker.next, /^Merge the desktop PR, add Developer ID direct-download signing\/notarization secrets/);
      assert.deepEqual(
        blocker.commands.filter((command) => command.startsWith("gh pr view")),
        [],
      );
    },
  );
});

test("desktop release status blocks version-mismatched tags before completion", () => {
  withFakeGh({}, (fakeGhPath) => {
    const result = runStatus(fakeGhPath, ["--tag=v9.9.9", "--pr=274"]);

    assert.equal(result.status, 1);
    assert.match(result.stdout, /✗ Version alignment: release tag v9\.9\.9 does not match macOS app versions/);
    assert.match(result.stdout, /next: Run pnpm desktop:release-tag -- --tag=v9\.9\.9/);
    assert.match(result.stderr, /blocked: 2 release requirement/);
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
  assert.match(stdout, /--json/);
  assert.match(stdout, /--json-file=PATH/);
  assert.match(stdout, /--markdown-file=PATH/);
  assert.match(stdout, /machine-readable blocker list/);
  assert.match(stdout, /write that same payload to disk/);
  assert.match(stdout, /human-readable release checklist/);
  assert.match(stdout, /desktop:release-preflight already passed locally/);
  assert.match(stdout, /Standalone desktop:release-status runs\s+show that local proof as skipped/);
  assert.match(stdout, /GitHub Pages \(deploy-pages\.yml\) publishes that surface separately/);
  assert.doesNotMatch(stdout, /--include-hosted-surface/);
  assert.doesNotMatch(stdout, /FIREBASE/);
  assert.doesNotMatch(stdout, /Hosted website/);
});
