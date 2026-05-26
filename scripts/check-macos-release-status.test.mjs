import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
if (args[0] === "api" && args[1] === "repos/wlsdks/oh-my-ontology/actions/workflows/release-macos.yml") {
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
if (args[0] === "api" && args[1] === "repos/wlsdks/oh-my-ontology/actions/workflows/deploy-hosting.yml") {
  if (scenario.hostedWorkflowMissing) {
    err("HTTP 404: Not Found");
    process.exit(1);
  }
  if (scenario.hostedWorkflowCheckFails) {
    err("hosted workflow API unavailable");
    process.exit(1);
  }
  out({ state: scenario.hostedWorkflowState ?? "active" });
  process.exit(0);
}
if (args[0] === "api" && args[1]?.startsWith("repos/wlsdks/oh-my-ontology/git/ref/tags/")) {
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

function runStatus(fakeGhPath, args = ["--tag=v0.1.0", "--pr=274"]) {
  const fakeGitPath = fakeGhPath.replace(/fake-gh\.mjs$/, "fake-git.mjs");
  return spawnSync(process.execPath, ["scripts/check-macos-release-status.mjs", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      OMOT_GH_BIN: fakeGhPath,
      OMOT_GIT_BIN: fakeGitPath,
      OMOT_RELEASE_STATUS_SKIP_DOWNLOAD_VERIFY: "1",
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
      const result = runStatus(fakeGhPath, ["--tag=v0.1.0", "--pr=274", "--json"]);

      assert.equal(result.status, 1);
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.schemaVersion, 1);
      assert.match(payload.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
      assert.equal(payload.repo, "wlsdks/oh-my-ontology");
      assert.equal(payload.tag, "v0.1.0");
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
          "gh pr view 274 --repo wlsdks/oh-my-ontology --json reviewDecision,mergeStateStatus,statusCheckRollup,url",
        ],
      );
      assert.deepEqual(
        payload.nextActions.find((action) => action.id === "apple_release_secrets").commands.at(-1),
        "gh secret set APPLE_TEAM_ID --repo wlsdks/oh-my-ontology < /path/to/APPLE_TEAM_ID",
      );
      assert.deepEqual(
        payload.nextActions.find((action) => action.id === "github_release").commands,
        [
          "gh pr view 274 --repo wlsdks/oh-my-ontology --json state,mergedAt,reviewDecision,mergeStateStatus,statusCheckRollup,url",
          "pnpm desktop:release-github -- --repo=wlsdks/oh-my-ontology --tag=v0.1.0",
          "gh secret list --repo wlsdks/oh-my-ontology",
          "git fetch origin main --tags",
          "pnpm desktop:release-source -- --repo=wlsdks/oh-my-ontology --sha=\"$(git rev-parse origin/main)\"",
          "git tag v0.1.0 origin/main",
          "git push origin v0.1.0",
          "pnpm desktop:release-run -- --repo=wlsdks/oh-my-ontology --tag=v0.1.0",
          "gh release view v0.1.0 --repo wlsdks/oh-my-ontology",
          "pnpm desktop:verify-download -- --repo=wlsdks/oh-my-ontology --tag=v0.1.0",
        ],
      );
      assert.deepEqual(
        payload.checks.map((check) => check.id),
        [
          "github_cli_auth",
          "version_alignment",
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
        ["Pull request", "Apple release secrets", "GitHub Release"],
      );
      assert.deepEqual(
        payload.checks.filter((check) => check.status === "blocked").map((check) => check.id),
        ["pull_request", "apple_release_secrets", "github_release"],
      );
      assert.match(
        payload.checks.find((check) => check.label === "Apple release secrets").next,
        /gh secret set APPLE_TEAM_ID --repo wlsdks\/oh-my-ontology/,
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
          "--tag=v0.1.0",
          "--pr=274",
          `--json-file=${jsonPath}`,
        ]);

        assert.equal(result.status, 1);
        assert.match(result.stdout, /\[desktop-release-status\] wlsdks\/oh-my-ontology v0\.1\.0/);
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
          ["Pull request", "Apple release secrets", "GitHub Release"],
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
          "--tag=v0.1.0",
          "--pr=274",
          `--markdown-file=${markdownPath}`,
        ]);

        assert.equal(result.status, 1);
        assert.ok(existsSync(markdownPath));
        const markdown = readFileSync(markdownPath, "utf8");
        assert.match(markdown, /^# macOS Release Status/);
        assert.match(markdown, /- Repo: `wlsdks\/oh-my-ontology`/);
        assert.match(markdown, /- Tag: `v0\.1\.0`/);
        assert.match(markdown, /- Status: blocked/);
        assert.match(markdown, /- Ready: no/);
        assert.match(markdown, /- Ready at: not ready/);
        assert.match(markdown, /- Blocked at: \d{4}-\d{2}-\d{2}T/);
        assert.match(markdown, /## Blockers/);
        assert.match(markdown, /- \[ \] Pull request \(`pull_request`\)/);
        assert.match(markdown, /  - Scope: external/);
        assert.match(markdown, /  - Owner: reviewer/);
        assert.match(markdown, /- \[ \] Apple release secrets \(`apple_release_secrets`\)/);
        assert.match(markdown, /  - Owner: release_operator/);
        assert.match(markdown, /- \[ \] GitHub Release \(`github_release`\)/);
        assert.match(markdown, /git push origin v0\.1\.0/);
        assert.match(markdown, /gh secret set APPLE_TEAM_ID --repo wlsdks\/oh-my-ontology/);
        assert.match(markdown, /  - Commands:\n    - `gh secret set APPLE_CERTIFICATE_P12_BASE64 --repo wlsdks\/oh-my-ontology < \/path\/to\/APPLE_CERTIFICATE_P12_BASE64`/);
        assert.match(markdown, /  - Missing secrets:\n    - `APPLE_CERTIFICATE_P12_BASE64`/);
        assert.match(markdown, /## Checks/);
        assert.match(markdown, /- \[x\] GitHub CLI auth \(`github_cli_auth`\)/);
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
      const result = runStatus(fakeGhPath, ["--tag=v0.1.0", "--pr=274", "--json"]);

      assert.equal(result.status, 1);
      const payload = JSON.parse(result.stdout);
      assert.deepEqual(
        payload.nextActions.find((action) => action.id === "pull_request").commands,
        [
          "gh pr checks 274 --repo wlsdks/oh-my-ontology",
          "gh pr view 274 --repo wlsdks/oh-my-ontology --json reviewDecision,mergeStateStatus,statusCheckRollup,url",
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
          "gh pr view 274 --repo wlsdks/oh-my-ontology --json state,mergedAt,reviewDecision,mergeStateStatus,statusCheckRollup,url",
          "pnpm desktop:release-github -- --repo=wlsdks/oh-my-ontology --tag=v0.1.0",
          "gh secret list --repo wlsdks/oh-my-ontology",
          "git fetch origin main --tags",
          "pnpm desktop:release-source -- --repo=wlsdks/oh-my-ontology --sha=\"$(git rev-parse origin/main)\"",
          "git tag v0.1.0 origin/main",
          "git push origin v0.1.0",
          "pnpm desktop:release-run -- --repo=wlsdks/oh-my-ontology --tag=v0.1.0",
          "gh release view v0.1.0 --repo wlsdks/oh-my-ontology",
          "pnpm desktop:verify-download -- --repo=wlsdks/oh-my-ontology --tag=v0.1.0",
        ],
      );
    },
  );
});

test("desktop release status blocks stale local release tags", () => {
  withFakeGh({ localTagExists: true }, (fakeGhPath) => {
    const result = runStatus(fakeGhPath, ["--tag=v0.1.0", "--pr=274", "--json"]);

    assert.equal(result.status, 1);
    const payload = JSON.parse(result.stdout);
    assert.deepEqual(payload.localBlockerIds, ["release_tag_slot"]);
    assert.deepEqual(payload.externalBlockerIds, []);
    assert.deepEqual(payload.blockersByOwner, { developer: ["release_tag_slot"] });
    const blocker = payload.checks.find((check) => check.id === "release_tag_slot");
    assert.equal(blocker.scope, "local");
    assert.equal(blocker.owner, "developer");
    assert.match(blocker.detail, /local git tag v0\.1\.0 already exists/);
    assert.deepEqual(blocker.commands, ["git tag -d v0.1.0"]);
  });
});

test("desktop release status blocks existing remote release tags", () => {
  withFakeGh({ gitTagExists: true }, (fakeGhPath) => {
    const result = runStatus(fakeGhPath, ["--tag=v0.1.0", "--pr=274", "--json"]);

    assert.equal(result.status, 1);
    const payload = JSON.parse(result.stdout);
    assert.deepEqual(payload.localBlockerIds, []);
    assert.deepEqual(payload.externalBlockerIds, ["release_tag_slot"]);
    assert.deepEqual(payload.blockersByOwner, { release_operator: ["release_tag_slot"] });
    const blocker = payload.checks.find((check) => check.id === "release_tag_slot");
    assert.equal(blocker.scope, "external");
    assert.equal(blocker.owner, "release_operator");
    assert.match(blocker.detail, /git tag v0\.1\.0 already exists/);
    assert.deepEqual(blocker.commands, [
      "gh api repos/wlsdks/oh-my-ontology/git/ref/tags/v0.1.0",
      "gh run list --repo wlsdks/oh-my-ontology --workflow release-macos.yml --event push --limit 10",
    ]);
  });
});

test("desktop release status blocks unavailable release workflows", () => {
  withFakeGh({ workflowMissing: true }, (fakeGhPath) => {
    const result = runStatus(fakeGhPath, ["--tag=v0.1.0", "--pr=274", "--json"]);

    assert.equal(result.status, 1);
    const payload = JSON.parse(result.stdout);
    assert.deepEqual(payload.localBlockerIds, []);
    assert.deepEqual(payload.externalBlockerIds, ["release_workflow"]);
    assert.deepEqual(payload.blockersByOwner, { release_operator: ["release_workflow"] });
    const blocker = payload.checks.find((check) => check.id === "release_workflow");
    assert.equal(blocker.scope, "external");
    assert.equal(blocker.owner, "release_operator");
    assert.match(blocker.detail, /release-macos\.yml is not available to GitHub/);
    assert.match(blocker.next, /merged into the default branch/);
    assert.deepEqual(blocker.commands, [
      "gh api repos/wlsdks/oh-my-ontology/actions/workflows/release-macos.yml",
      "gh pr view 274 --repo wlsdks/oh-my-ontology --json state,mergedAt,reviewDecision,mergeStateStatus,url",
    ]);
  });
});

test("desktop release status blocks disabled release workflows", () => {
  withFakeGh({ workflowState: "disabled_manually" }, (fakeGhPath) => {
    const result = runStatus(fakeGhPath, ["--tag=v0.1.0", "--pr=274", "--json"]);

    assert.equal(result.status, 1);
    const payload = JSON.parse(result.stdout);
    assert.deepEqual(payload.externalBlockerIds, ["release_workflow"]);
    const blocker = payload.checks.find((check) => check.id === "release_workflow");
    assert.match(blocker.detail, /workflow is disabled_manually/);
    assert.deepEqual(blocker.commands, [
      "gh workflow enable release-macos.yml --repo wlsdks/oh-my-ontology",
    ]);
  });
});

test("desktop release status can include hosted surface blockers for full goal audits", () => {
  withFakeGh({}, (fakeGhPath) => {
    const result = runStatus(fakeGhPath, [
      "--tag=v0.1.0",
      "--pr=274",
      "--include-hosted-surface",
      "--hosted-base-url=http://127.0.0.1:1",
      "--json",
    ]);

    assert.equal(result.status, 1);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.includeHostedSurface, true);
    assert.equal(payload.hostedBaseUrl, "http://127.0.0.1:1");
    assert.deepEqual(payload.externalBlockerIds, ["hosted_surface"]);
    assert.deepEqual(payload.blockersByOwner, { website_operator: ["hosted_surface"] });
    const workflow = payload.checks.find((check) => check.id === "hosted_deploy_workflow");
    assert.equal(workflow.status, "ok");
    assert.equal(workflow.scope, "external");
    assert.equal(workflow.owner, "website_operator");
    const blocker = payload.checks.find((check) => check.id === "hosted_surface");
    assert.equal(blocker.scope, "external");
    assert.equal(blocker.owner, "website_operator");
    assert.equal(blocker.label, "Hosted website");
    assert.match(blocker.detail, /127\.0\.0\.1:1/);
    assert.deepEqual(blocker.commands, [
      "gh workflow run deploy-hosting.yml --repo wlsdks/oh-my-ontology",
      "pnpm desktop:verify-hosted -- --base-url=http://127.0.0.1:1",
    ]);
  });
});

test("desktop release status blocks unavailable hosted deploy workflows in full goal audits", () => {
  withFakeGh({ hostedWorkflowMissing: true }, (fakeGhPath) => {
    const result = runStatus(fakeGhPath, [
      "--tag=v0.1.0",
      "--pr=274",
      "--include-hosted-surface",
      "--hosted-base-url=http://127.0.0.1:1",
      "--json",
    ]);

    assert.equal(result.status, 1);
    const payload = JSON.parse(result.stdout);
    assert.deepEqual(payload.externalBlockerIds, ["hosted_deploy_workflow", "hosted_surface"]);
    assert.deepEqual(payload.blockersByOwner, {
      website_operator: ["hosted_deploy_workflow", "hosted_surface"],
    });
    const blocker = payload.checks.find((check) => check.id === "hosted_deploy_workflow");
    assert.equal(blocker.scope, "external");
    assert.equal(blocker.owner, "website_operator");
    assert.equal(blocker.label, "Hosted deploy workflow");
    assert.match(blocker.detail, /deploy-hosting\.yml is not available to GitHub/);
    assert.match(blocker.next, /merged into the default branch/);
    assert.deepEqual(blocker.commands, [
      "gh api repos/wlsdks/oh-my-ontology/actions/workflows/deploy-hosting.yml",
      "gh pr view 274 --repo wlsdks/oh-my-ontology --json state,mergedAt,reviewDecision,mergeStateStatus,url",
    ]);
  });
});

test("desktop release status blocks disabled hosted deploy workflows in full goal audits", () => {
  withFakeGh({ hostedWorkflowState: "disabled_manually" }, (fakeGhPath) => {
    const result = runStatus(fakeGhPath, [
      "--tag=v0.1.0",
      "--pr=274",
      "--include-hosted-surface",
      "--hosted-base-url=http://127.0.0.1:1",
      "--json",
    ]);

    assert.equal(result.status, 1);
    const payload = JSON.parse(result.stdout);
    const blocker = payload.checks.find((check) => check.id === "hosted_deploy_workflow");
    assert.equal(blocker.scope, "external");
    assert.equal(blocker.owner, "website_operator");
    assert.match(blocker.detail, /workflow is disabled_manually/);
    assert.deepEqual(blocker.commands, [
      "gh workflow enable deploy-hosting.yml --repo wlsdks/oh-my-ontology",
    ]);
  });
});

test("desktop release status separates local and external blockers", () => {
  withFakeGh({}, (fakeGhPath) => {
    const result = runStatus(fakeGhPath, ["--tag=v9.9.9", "--pr=274", "--json"]);

    assert.equal(result.status, 1);
    const payload = JSON.parse(result.stdout);
    assert.deepEqual(payload.localBlockerIds, ["version_alignment"]);
    assert.deepEqual(payload.externalBlockerIds, []);
    assert.deepEqual(payload.blockersByOwner, { developer: ["version_alignment"] });
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

test("desktop release status JSON reports ready when all release gates pass", () => {
  withFakeGh({}, (fakeGhPath) => {
    const result = runStatus(fakeGhPath, ["--tag=v0.1.0", "--pr=274", "--json"]);

    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.schemaVersion, 1);
    assert.match(payload.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(payload.ready, true);
    assert.equal(payload.status, "ready");
    assert.equal(payload.readyAt, payload.generatedAt);
    assert.equal(payload.blockedAt, null);
    assert.equal(payload.blockerCount, 0);
    assert.deepEqual(payload.missingSecrets, []);
    assert.deepEqual(payload.localBlockerIds, []);
    assert.deepEqual(payload.externalBlockerIds, []);
    assert.deepEqual(payload.blockersByOwner, {});
    assert.deepEqual(payload.blockerIds, []);
    assert.deepEqual(payload.nextActions, []);
    assert.deepEqual(
      payload.checks.map((check) => check.status),
      ["ok", "ok", "ok", "ok", "ok", "ok", "ok", "skipped"],
    );
    assert.deepEqual(
      payload.checks.map((check) => check.id),
      [
        "github_cli_auth",
        "version_alignment",
        "pull_request",
        "release_workflow",
        "release_tag_slot",
        "apple_release_secrets",
        "github_release",
        "download_assets",
      ],
    );
    assert.equal(result.stderr, "");
  });
});

test("desktop release status markdown reports ready when all release gates pass", () => {
  withFakeGh({}, (fakeGhPath) => {
    const root = mkdtempSync(join(tmpdir(), "omo-release-status-md-ready-"));
    try {
      const markdownPath = join(root, "release-status.md");
      const result = runStatus(fakeGhPath, [
        "--tag=v0.1.0",
        "--pr=274",
        `--markdown-file=${markdownPath}`,
      ]);

      assert.equal(result.status, 0, result.stderr);
      const markdown = readFileSync(markdownPath, "utf8");
      assert.match(markdown, /- Status: ready/);
      assert.match(markdown, /- Ready: yes/);
      assert.match(markdown, /- Ready at: \d{4}-\d{2}-\d{2}T/);
      assert.match(markdown, /- Blocked at: not blocked/);
      assert.match(markdown, /No blockers\./);
      assert.match(markdown, /- \[x\] Pull request \(`pull_request`\)/);
      assert.match(markdown, /- \[-\] Download assets \(`download_assets`\)/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
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
  assert.match(stdout, /--json/);
  assert.match(stdout, /--json-file=PATH/);
  assert.match(stdout, /--markdown-file=PATH/);
  assert.match(stdout, /--include-hosted-surface/);
  assert.match(stdout, /machine-readable blocker list/);
  assert.match(stdout, /write that same payload to disk/);
  assert.match(stdout, /human-readable release checklist/);
  assert.match(stdout, /full desktop goal\s+completion audit/);
  assert.match(stdout, /Firebase Hosting is intentionally excluded/);
  assert.doesNotMatch(stdout, /Hosted website/);
});
