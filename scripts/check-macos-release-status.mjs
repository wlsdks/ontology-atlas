#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const DEFAULT_REPO = "wlsdks/ontology-atlas";
const REQUIRED_SECRETS = [
  "APPLE_CERTIFICATE_P12_BASE64",
  "APPLE_CERTIFICATE_PASSWORD",
  "APPLE_KEYCHAIN_PASSWORD",
  "APPLE_SIGNING_IDENTITY",
  "APPLE_ID",
  "APPLE_APP_SPECIFIC_PASSWORD",
  "APPLE_TEAM_ID",
];
const REQUIRED_HOSTED_SECRETS = [
  "FIREBASE_SERVICE_ACCOUNT_JSON",
];
const DIRECT_DOWNLOAD_SECRET_LABEL = "Developer ID direct-download secrets";
const CHECK_SCOPES = new Map([
  ["github_cli_auth", "local"],
  ["version_alignment", "local"],
  ["pull_request", "external"],
  ["release_workflow", "external"],
  ["release_tag_slot", "external"],
  ["apple_release_secrets", "external"],
  ["github_release", "external"],
  ["download_assets", "external"],
  ["hosted_deploy_workflow", "external"],
  ["hosted_deploy_secrets", "external"],
  ["hosted_surface", "external"],
]);
const CHECK_OWNERS = new Map([
  ["github_cli_auth", "developer"],
  ["version_alignment", "developer"],
  ["pull_request", "reviewer"],
  ["release_workflow", "release_operator"],
  ["release_tag_slot", "release_operator"],
  ["apple_release_secrets", "release_operator"],
  ["github_release", "release_operator"],
  ["download_assets", "release_operator"],
  ["hosted_deploy_workflow", "website_operator"],
  ["hosted_deploy_secrets", "website_operator"],
  ["hosted_surface", "website_operator"],
]);
function defaultTag() {
  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
  return `v${pkg.version}`;
}

function printHelp() {
  console.log(`Usage: pnpm desktop:release-status [--repo=${DEFAULT_REPO}] [--tag=vX.Y.Z] [--pr=NUMBER] [--include-hosted-surface] [--hosted-base-url=https://ontology-atlas.web.app] [--json] [--json-file=PATH] [--markdown-file=PATH]

Checks the public macOS release completion state in one fail-closed pass:
release tag version alignment, pull-request merge readiness, active macOS
release workflow availability, Developer ID direct-download signing/notary
secret names (not Mac App Store submission), public GitHub Release state, and
downloadable DMG/checksum assets.

This command is an operator/completion audit. It does not publish tags, set
secrets, or edit releases.

Use --json when a goal runner, CI wrapper, or release dashboard needs a
machine-readable blocker list. Human-readable output remains the default.
Use --json-file=PATH to write that same payload to disk even when a package
runner adds lifecycle text around stdout.
Use --markdown-file=PATH to write a human-readable release checklist for PR
reviewers and release operators.

Firebase Hosting is intentionally excluded from this macOS app release audit.
Use pnpm desktop:verify-hosted after the separate static promo/download website
deploy.

Pass --include-hosted-surface when using this command as the full desktop goal
completion audit: it also checks the hosted deploy workflow, the
FIREBASE_SERVICE_ACCOUNT_JSON website deploy secret, and the deployed
promo/download website verifier in the same blocker list.
`);
}

function parseArgs(argv) {
  const options = {
    repo: DEFAULT_REPO,
    tag: defaultTag(),
    pr: "",
    json: false,
    jsonFile: "",
    markdownFile: "",
    includeHostedSurface: false,
    hostedBaseUrl: "https://ontology-atlas.web.app",
  };

  for (const arg of argv) {
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    if (arg.startsWith("--repo=")) {
      options.repo = arg.slice("--repo=".length).trim();
      continue;
    }
    if (arg.startsWith("--tag=")) {
      options.tag = arg.slice("--tag=".length).trim();
      continue;
    }
    if (arg.startsWith("--pr=")) {
      options.pr = arg.slice("--pr=".length).trim();
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg.startsWith("--json-file=")) {
      options.jsonFile = arg.slice("--json-file=".length).trim();
      continue;
    }
    if (arg.startsWith("--markdown-file=")) {
      options.markdownFile = arg.slice("--markdown-file=".length).trim();
      continue;
    }
    if (arg === "--include-hosted-surface") {
      options.includeHostedSurface = true;
      continue;
    }
    if (arg.startsWith("--hosted-base-url=")) {
      options.hostedBaseUrl = arg.slice("--hosted-base-url=".length).replace(/\/+$/, "");
      continue;
    }
    fail(`unknown argument: ${arg}`);
  }

  if (!/^[^/\s]+\/[^/\s]+$/.test(options.repo)) {
    fail("--repo must use owner/name format.");
  }
  if (!/^v.+/.test(options.tag)) {
    fail(`--tag must be v-prefixed, got ${options.tag || "(empty)"}.`);
  }
  if (options.pr && !/^\d+$/.test(options.pr)) {
    fail(`--pr must be a pull request number, got ${options.pr}.`);
  }
  if (options.jsonFile && options.jsonFile.includes("\0")) {
    fail("--json-file must not contain null bytes.");
  }
  if (options.markdownFile && options.markdownFile.includes("\0")) {
    fail("--markdown-file must not contain null bytes.");
  }
  try {
    const hostedUrl = new URL(options.hostedBaseUrl);
    if (!["http:", "https:"].includes(hostedUrl.protocol)) {
      fail("--hosted-base-url must use http or https.");
    }
  } catch {
    fail(`--hosted-base-url must be a valid URL, got ${options.hostedBaseUrl || "(empty)"}.`);
  }
  return options;
}

function ghBin() {
  return process.env.OATLAS_GH_BIN || "gh";
}

function gitBin() {
  return process.env.OATLAS_GIT_BIN || "git";
}

function runGh(args, { parseJson = false } = {}) {
  const result = spawnSync(ghBin(), args, {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (result.error) {
    return { ok: false, message: `failed to run gh ${args.join(" ")}: ${result.error.message}` };
  }
  if (result.status !== 0) {
    return {
      ok: false,
      message: (result.stderr || result.stdout || `gh ${args.join(" ")} failed with ${result.status}`).trim(),
    };
  }
  if (!parseJson) return { ok: true, value: result.stdout };
  try {
    return { ok: true, value: JSON.parse(result.stdout) };
  } catch (error) {
    return { ok: false, message: `gh ${args.join(" ")} returned invalid JSON: ${error.message}` };
  }
}

function runGhStatus(args) {
  const result = spawnSync(ghBin(), args, {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (result.error) {
    return { status: null, stdout: "", stderr: `failed to run gh ${args.join(" ")}: ${result.error.message}` };
  }
  return result;
}

function runGitStatus(args) {
  const result = spawnSync(gitBin(), args, {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (result.error) {
    return { status: null, stdout: "", stderr: `failed to run git ${args.join(" ")}: ${result.error.message}` };
  }
  return result;
}

function runNode(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
  return {
    ok: result.status === 0,
    message: (result.stdout || result.stderr || "").trim(),
  };
}

function fail(message) {
  console.error(`[desktop-release-status] ${message}`);
  process.exit(1);
}

function withScope(check) {
  return {
    scope: CHECK_SCOPES.get(check.id) ?? "local",
    owner: CHECK_OWNERS.get(check.id) ?? "developer",
    ...check,
  };
}

function ok(id, label, detail) {
  return withScope({ id, status: "ok", label, detail });
}

function blocked(id, label, detail, next, commands = [], extra = {}) {
  const check = withScope({ id, status: "blocked", label, detail, next });
  if (commands.length > 0) {
    check.commands = commands;
  }
  Object.assign(check, extra);
  return check;
}

function skipped(id, label, detail) {
  return withScope({ id, status: "skipped", label, detail });
}

function prChecksPassed(pr) {
  const checks = Array.isArray(pr.statusCheckRollup) ? pr.statusCheckRollup : [];
  if (checks.length === 0) return false;
  return checks.every((check) => check.status === "COMPLETED" && check.conclusion === "SUCCESS");
}

function prCheckSummary(pr) {
  const checks = Array.isArray(pr.statusCheckRollup) ? pr.statusCheckRollup : [];
  const passed = checks.filter((check) => check.status === "COMPLETED" && check.conclusion === "SUCCESS").length;
  const failing = checks
    .filter((check) => !(check.status === "COMPLETED" && check.conclusion === "SUCCESS"))
    .map((check) => prCheckLabel(check))
    .filter(Boolean);
  const failingSummary = failing.length > 0
    ? `; blocked checks: ${failing.join(", ")}`
    : "";
  return `${passed}/${checks.length} checks successful${failingSummary}`;
}

function prNextAction({ checksOk, isDraft, prNumber, repo, url }) {
  const reviewAndMerge =
    `Resolve PR review/merge blockers: ${url ?? `https://github.com/${repo}/pull/${prNumber}`}`;
  const actions = [];
  if (!checksOk) {
    actions.push(`Run gh pr checks ${prNumber} --repo ${repo}`);
  }
  if (isDraft) {
    actions.push(`Run gh pr ready ${prNumber} --repo ${repo}`);
  }
  actions.push(reviewAndMerge);
  return actions.join(", then ");
}

function prNextCommands({ checksOk, isDraft, prNumber, repo }) {
  const commands = [`gh pr view ${prNumber} --repo ${repo} --json reviewDecision,mergeStateStatus,statusCheckRollup,url`];
  if (!checksOk) {
    commands.unshift(`gh pr checks ${prNumber} --repo ${repo}`);
  }
  if (isDraft) {
    commands.push(`gh pr ready ${prNumber} --repo ${repo}`);
  }
  return commands;
}

function prCheckLabel(check) {
  const name = check.name ?? check.context ?? check.workflowName ?? check.__typename ?? "unnamed check";
  const state = check.conclusion || check.status || "unknown";
  const timing = prCheckTiming(check);
  const detail = typeof check.detailsUrl === "string" && check.detailsUrl
    ? ` (${check.detailsUrl})`
    : "";
  return `${name}=${state}${timing}${detail}`;
}

function currentDate() {
  const raw = process.env.OATLAS_RELEASE_STATUS_NOW;
  if (!raw) return new Date();
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function parseRealDate(raw) {
  if (typeof raw !== "string" || !raw || raw.startsWith("0001-")) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function prCheckTiming(check) {
  if (check.status === "COMPLETED") return "";
  const startedAt = parseRealDate(check.startedAt);
  if (!startedAt) return "";
  const elapsedMs = Math.max(0, currentDate().getTime() - startedAt.getTime());
  return ` since ${startedAt.toISOString()} (${formatElapsed(elapsedMs)})`;
}

function formatElapsed(ms) {
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours === 0 ? `${days}d` : `${days}d ${restHours}h`;
}

function prMerged(pr) {
  return pr.state === "MERGED" || Boolean(pr.mergedAt);
}

function prReviewSatisfied(pr) {
  return !pr.reviewDecision || pr.reviewDecision === "APPROVED";
}

function secretSetHints(repo, names) {
  return names.map((name) => `gh secret set ${name} --repo ${repo} < /path/to/${name}`).join("; ");
}

function secretSetCommands(repo, names) {
  return names.map((name) => `gh secret set ${name} --repo ${repo} < /path/to/${name}`);
}

function defaultBranchCommand(repo) {
  return `gh repo view ${repo} --json defaultBranchRef --jq .defaultBranchRef.name`;
}

function releasePublishCommands({ repo, tag, prNumber }) {
  const defaultBranch = defaultBranchCommand(repo);
  const commands = [
    `pnpm desktop:release-github -- --repo=${repo} --tag=${tag}`,
    `gh secret list --repo ${repo}`,
    `DEFAULT_BRANCH="$(${defaultBranch})"`,
    `git fetch origin "$DEFAULT_BRANCH" --tags`,
    `pnpm desktop:release-source -- --repo=${repo} --sha="$(git rev-parse "origin/$DEFAULT_BRANCH")"`,
    `git tag ${tag} "origin/$DEFAULT_BRANCH"`,
    `git push origin ${tag}`,
    `pnpm desktop:release-run -- --repo=${repo} --tag=${tag}`,
    `gh release view ${tag} --repo ${repo}`,
    `pnpm desktop:verify-download -- --repo=${repo} --tag=${tag}`,
  ];
  if (prNumber) {
    commands.unshift(`gh pr view ${prNumber} --repo ${repo} --json state,mergedAt,reviewDecision,mergeStateStatus,statusCheckRollup,url`);
  }
  return commands;
}

function releaseMissingNext({ prMerged: merged, tag }) {
  if (merged) {
    return `Add Developer ID direct-download signing/notarization secrets (not Mac App Store submission), then push ${tag} so .github/workflows/release-macos.yml can publish signed DMGs.`;
  }
  return `Merge the desktop PR, add Developer ID direct-download signing/notarization secrets (not Mac App Store submission), then push ${tag} so .github/workflows/release-macos.yml can publish signed DMGs.`;
}

function isNotFound(message) {
  return /\b404\b|not found|release not found/i.test(message);
}

function statusOutput(result) {
  return `${result?.stderr || ""}\n${result?.stdout || ""}`.trim();
}

function workflowUnavailableMessage(repo) {
  return `release-macos.yml is not available to GitHub for ${repo}. If the workflow is still on a PR branch, merge the desktop PR before pushing the release tag.`;
}

function hostedWorkflowUnavailableMessage(repo) {
  return `deploy-hosting.yml is not available to GitHub for ${repo}. If the workflow is still on a PR branch, merge the desktop PR before deploying the hosted download page.`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const checks = [];
  let selectedPr = null;

  const auth = runGh(["auth", "status"]);
  if (!auth.ok) {
    checks.push(blocked("github_cli_auth", "GitHub CLI auth", auth.message, "Run gh auth login, then rerun desktop:release-status.", ["gh auth login"]));
    renderAndExit(options, checks);
  }
  checks.push(ok("github_cli_auth", "GitHub CLI auth", "gh auth status succeeded"));

  const tagAlignment = runNode([
    "scripts/check-macos-release-tag.mjs",
    `--tag=${options.tag}`,
  ]);
  if (tagAlignment.ok) {
    checks.push(ok("version_alignment", "Version alignment", tagAlignment.message.replace(/^\[desktop-release-tag\]\s*/, "")));
  } else {
    checks.push(blocked(
      "version_alignment",
      "Version alignment",
      tagAlignment.message.replace(/^\[desktop-release-tag\]\s*/, ""),
      `Run pnpm desktop:release-tag -- --tag=${options.tag} and update package.json, src-tauri/tauri.conf.json, and src-tauri/Cargo.toml together before tagging.`,
      [`pnpm desktop:release-tag -- --tag=${options.tag}`],
    ));
  }

  if (options.pr) {
    const pr = runGh([
      "pr",
      "view",
      options.pr,
      "--repo",
      options.repo,
      "--json",
      "isDraft,mergeStateStatus,mergedAt,reviewDecision,state,statusCheckRollup,url",
    ], { parseJson: true });
    if (!pr.ok) {
      checks.push(blocked("pull_request", "Pull request", pr.message, `Open https://github.com/${options.repo}/pull/${options.pr} and verify it manually.`));
    } else {
      const value = pr.value;
      selectedPr = value;
      const checksOk = prChecksPassed(value);
      const reviewOk = prReviewSatisfied(value);
      const mergeOk = value.mergeStateStatus === "CLEAN";
      const isDraft = Boolean(value.isDraft);
      if (prMerged(value)) {
        checks.push(ok("pull_request", "Pull request", `PR #${options.pr} is already merged`));
      } else if (checksOk && reviewOk && mergeOk && !isDraft) {
        checks.push(ok("pull_request", "Pull request", `PR #${options.pr} is merge-ready (${prCheckSummary(value)})`));
      } else {
        checks.push(blocked(
          "pull_request",
          "Pull request",
          `PR #${options.pr} is not merge-ready: draft=${isDraft ? "yes" : "no"}, review=${value.reviewDecision ?? "unknown"}, merge=${value.mergeStateStatus ?? "unknown"}, ${prCheckSummary(value)}`,
          prNextAction({
            checksOk,
            isDraft,
            prNumber: options.pr,
            repo: options.repo,
            url: value.url,
          }),
          prNextCommands({
            checksOk,
            isDraft,
            prNumber: options.pr,
            repo: options.repo,
          }),
        ));
      }
    }
  } else {
    checks.push(skipped("pull_request", "Pull request", "pass --pr=NUMBER to include review and merge readiness"));
  }

  const workflow = runGh([
    "api",
    `repos/${options.repo}/actions/workflows/release-macos.yml`,
  ], { parseJson: true });
  if (!workflow.ok) {
    const detail = isNotFound(workflow.message)
      ? workflowUnavailableMessage(options.repo)
      : workflow.message;
    checks.push(blocked(
      "release_workflow",
      "Release workflow",
      detail,
      `Ensure .github/workflows/release-macos.yml is merged into the default branch and active before pushing ${options.tag}.`,
      [
        `gh api repos/${options.repo}/actions/workflows/release-macos.yml`,
        options.pr
          ? `gh pr view ${options.pr} --repo ${options.repo} --json state,mergedAt,reviewDecision,mergeStateStatus,url`
          : `gh workflow view release-macos.yml --repo ${options.repo}`,
      ],
    ));
  } else if (workflow.value?.state !== "active") {
    checks.push(blocked(
      "release_workflow",
      "Release workflow",
      `release-macos.yml workflow is ${workflow.value?.state ?? "not active"}`,
      `Enable the release-macos.yml workflow before pushing ${options.tag}.`,
      [`gh workflow enable release-macos.yml --repo ${options.repo}`],
    ));
  } else {
    checks.push(ok("release_workflow", "Release workflow", "release-macos.yml is active on GitHub"));
  }

  const localTagRef = runGitStatus(["rev-parse", "--verify", "--quiet", `refs/tags/${options.tag}`]);
  if (localTagRef.status === 0) {
    checks.push(blocked(
      "release_tag_slot",
      "Release tag slot",
      `local git tag ${options.tag} already exists`,
      `Delete the stale local tag with git tag -d ${options.tag} after verifying it was not pushed, or choose a new version before release.`,
      [`git tag -d ${options.tag}`],
      { scope: "local", owner: "developer" },
    ));
  } else if (localTagRef.status !== 1) {
    checks.push(blocked(
      "release_tag_slot",
      "Release tag slot",
      `git rev-parse --verify refs/tags/${options.tag} failed: ${statusOutput(localTagRef) || `exit ${localTagRef.status}`}`,
      `Run git rev-parse --verify --quiet refs/tags/${options.tag} locally before tagging.`,
      [`git rev-parse --verify --quiet refs/tags/${options.tag}`],
      { scope: "local", owner: "developer" },
    ));
  } else {
    const remoteTagRef = runGhStatus(["api", `repos/${options.repo}/git/ref/tags/${options.tag}`]);
    const remoteTagOutput = statusOutput(remoteTagRef);
    if (remoteTagRef.status === 0) {
      checks.push(blocked(
        "release_tag_slot",
        "Release tag slot",
        `git tag ${options.tag} already exists for ${options.repo}`,
        "Inspect the existing tag workflow run or choose a new version before pushing a macOS release tag.",
        [
          `gh api repos/${options.repo}/git/ref/tags/${options.tag}`,
          `gh run list --repo ${options.repo} --workflow release-macos.yml --event push --limit 10`,
        ],
      ));
    } else if (!isNotFound(remoteTagOutput)) {
      checks.push(blocked(
        "release_tag_slot",
        "Release tag slot",
        `gh api repos/${options.repo}/git/ref/tags/${options.tag} failed: ${remoteTagOutput || `exit ${remoteTagRef.status}`}`,
        `Run gh api repos/${options.repo}/git/ref/tags/${options.tag} to inspect the remote tag slot.`,
        [`gh api repos/${options.repo}/git/ref/tags/${options.tag}`],
      ));
    } else {
      checks.push(ok("release_tag_slot", "Release tag slot", `${options.tag} has no existing local or remote Git tag`));
    }
  }

  let repoSecretNames = null;
  let repoSecretListError = null;
  const secrets = runGh([
    "secret",
    "list",
    "--repo",
    options.repo,
    "--json",
    "name",
  ], { parseJson: true });
  if (!secrets.ok) {
    repoSecretListError = secrets.message;
    checks.push(blocked("apple_release_secrets", DIRECT_DOWNLOAD_SECRET_LABEL, secrets.message, `Run gh secret list --repo ${options.repo}.`, [`gh secret list --repo ${options.repo}`]));
  } else if (!Array.isArray(secrets.value)) {
    repoSecretListError = "gh secret list did not return an array.";
    checks.push(blocked("apple_release_secrets", DIRECT_DOWNLOAD_SECRET_LABEL, "gh secret list did not return an array.", `Run gh secret list --repo ${options.repo}.`, [`gh secret list --repo ${options.repo}`]));
  } else {
    repoSecretNames = new Set(secrets.value.map((secret) => secret?.name).filter(Boolean));
    const missing = REQUIRED_SECRETS.filter((name) => !repoSecretNames.has(name));
    if (missing.length === 0) {
      checks.push(ok("apple_release_secrets", DIRECT_DOWNLOAD_SECRET_LABEL, "all required Developer ID signing/notary secret names exist for direct-download DMGs"));
    } else {
      checks.push(blocked(
        "apple_release_secrets",
        DIRECT_DOWNLOAD_SECRET_LABEL,
        `missing ${missing.join(", ")} (Developer ID signing/notarization for direct-download DMGs, not Mac App Store submission)`,
        secretSetHints(options.repo, missing),
        secretSetCommands(options.repo, missing),
        { missingSecrets: missing },
      ));
    }
  }

  const release = runGh([
    "release",
    "view",
    options.tag,
    "--repo",
    options.repo,
    "--json",
    "tagName,isDraft,isPrerelease,url",
  ], { parseJson: true });
  if (!release.ok) {
    const next = isNotFound(release.message)
      ? releaseMissingNext({
          prMerged: prMerged(selectedPr),
          tag: options.tag,
        })
      : `Run gh release view ${options.tag} --repo ${options.repo}.`;
    const commands = isNotFound(release.message)
      ? releasePublishCommands({
          repo: options.repo,
          tag: options.tag,
          prNumber: options.pr,
        })
      : [`gh release view ${options.tag} --repo ${options.repo}`];
    checks.push(blocked("github_release", "GitHub Release", release.message, next, commands));
  } else if (release.value?.isDraft || release.value?.isPrerelease) {
    checks.push(blocked(
      "github_release",
      "GitHub Release",
      `${options.tag} is ${release.value.isDraft ? "draft" : "prerelease"}`,
      "Publish a stable, non-draft release only after signed/notarized DMGs and checksums pass.",
    ));
  } else {
    checks.push(ok("github_release", "GitHub Release", `${options.tag} is public and stable${release.value?.url ? ` (${release.value.url})` : ""}`));
    if (process.env.OATLAS_RELEASE_STATUS_SKIP_DOWNLOAD_VERIFY === "1") {
      checks.push(skipped("download_assets", "Download assets", "skipped by OATLAS_RELEASE_STATUS_SKIP_DOWNLOAD_VERIFY=1"));
    } else {
      const download = runNode([
        "scripts/check-macos-download-release.mjs",
        `--repo=${options.repo}`,
        `--tag=${options.tag}`,
      ]);
      if (download.ok) {
        checks.push(ok("download_assets", "Download assets", "public DMGs and .sha256 assets passed byte verification"));
      } else {
        checks.push(blocked(
          "download_assets",
          "Download assets",
          download.message,
          `Run pnpm desktop:verify-download -- --repo=${options.repo} --tag=${options.tag}.`,
          [`pnpm desktop:verify-download -- --repo=${options.repo} --tag=${options.tag}`],
        ));
      }
    }
  }

  if (options.includeHostedSurface) {
    const hostedWorkflow = runGh([
      "api",
      `repos/${options.repo}/actions/workflows/deploy-hosting.yml`,
    ], { parseJson: true });
    if (!hostedWorkflow.ok) {
      const detail = isNotFound(hostedWorkflow.message)
        ? hostedWorkflowUnavailableMessage(options.repo)
        : hostedWorkflow.message;
      checks.push(blocked(
        "hosted_deploy_workflow",
        "Hosted deploy workflow",
        detail,
        "Ensure .github/workflows/deploy-hosting.yml is merged into the default branch and active before deploying the hosted download page.",
        [
          `gh api repos/${options.repo}/actions/workflows/deploy-hosting.yml`,
          options.pr
            ? `gh pr view ${options.pr} --repo ${options.repo} --json state,mergedAt,reviewDecision,mergeStateStatus,url`
            : `gh workflow view deploy-hosting.yml --repo ${options.repo}`,
        ],
      ));
    } else if (hostedWorkflow.value?.state !== "active") {
      checks.push(blocked(
        "hosted_deploy_workflow",
        "Hosted deploy workflow",
        `deploy-hosting.yml workflow is ${hostedWorkflow.value?.state ?? "not active"}`,
        "Enable the deploy-hosting.yml workflow before deploying the hosted download page.",
        [`gh workflow enable deploy-hosting.yml --repo ${options.repo}`],
      ));
    } else {
      checks.push(ok("hosted_deploy_workflow", "Hosted deploy workflow", "deploy-hosting.yml is active on GitHub"));
    }

    if (repoSecretNames) {
      const missing = REQUIRED_HOSTED_SECRETS.filter((name) => !repoSecretNames.has(name));
      if (missing.length === 0) {
        checks.push(ok("hosted_deploy_secrets", "Hosted deploy secrets", "required Firebase Hosting deploy secret name exists"));
      } else {
        checks.push(blocked(
          "hosted_deploy_secrets",
          "Hosted deploy secrets",
          `missing ${missing.join(", ")}`,
          secretSetHints(options.repo, missing),
          secretSetCommands(options.repo, missing),
          { missingHostedSecrets: missing },
        ));
      }
    } else {
      checks.push(blocked(
        "hosted_deploy_secrets",
        "Hosted deploy secrets",
        repoSecretListError ?? "gh secret list did not return repository secrets.",
        `Run gh secret list --repo ${options.repo}.`,
        [`gh secret list --repo ${options.repo}`],
      ));
    }

    const hosted = runNode([
      "scripts/check-hosted-download-surface.mjs",
      `--base-url=${options.hostedBaseUrl}`,
    ]);
    if (hosted.ok) {
      checks.push(ok(
        "hosted_surface",
        "Hosted website",
        `${options.hostedBaseUrl} is promo/download aligned`,
      ));
    } else {
      checks.push(blocked(
        "hosted_surface",
        "Hosted website",
        hosted.message,
        `Deploy the static promo/download website, then run pnpm desktop:verify-hosted -- --base-url=${options.hostedBaseUrl}.`,
        [
          `gh workflow run deploy-hosting.yml --repo ${options.repo}`,
          `pnpm desktop:verify-hosted -- --base-url=${options.hostedBaseUrl}`,
        ],
      ));
    }
  }

  renderAndExit(options, checks);
}

function renderAndExit(options, checks) {
  const blockers = checks.filter((check) => check.status === "blocked");
  const generatedAt = currentDate().toISOString();
  const ready = blockers.length === 0;
  const payload = {
    schemaVersion: 1,
    generatedAt,
    repo: options.repo,
    tag: options.tag,
    pr: options.pr || null,
    includeHostedSurface: options.includeHostedSurface,
    hostedBaseUrl: options.includeHostedSurface ? options.hostedBaseUrl : null,
    ready,
    status: ready ? "ready" : "blocked",
    readyAt: ready ? generatedAt : null,
    blockedAt: ready ? null : generatedAt,
    blockerCount: blockers.length,
    blockerIds: blockers.map((check) => check.id),
    localBlockerIds: blockers.filter((check) => check.scope === "local").map((check) => check.id),
    externalBlockerIds: blockers.filter((check) => check.scope === "external").map((check) => check.id),
    blockersByOwner: groupBlockersByOwner(blockers),
    missingSecrets: checks.find((check) => check.id === "apple_release_secrets")?.missingSecrets ?? [],
    missingHostedSecrets: checks.find((check) => check.id === "hosted_deploy_secrets")?.missingHostedSecrets ?? [],
    nextActions: blockers
      .filter((check) => check.next)
      .map((check) => ({
        id: check.id,
        label: check.label,
        scope: check.scope,
        owner: check.owner,
        next: check.next,
        commands: check.commands ?? [],
      })),
    checks,
  };
  if (options.jsonFile) {
    const jsonFilePath = path.resolve(process.cwd(), options.jsonFile);
    fs.mkdirSync(path.dirname(jsonFilePath), { recursive: true });
    fs.writeFileSync(jsonFilePath, `${JSON.stringify(payload, null, 2)}\n`);
  }
  if (options.markdownFile) {
    const markdownFilePath = path.resolve(process.cwd(), options.markdownFile);
    fs.mkdirSync(path.dirname(markdownFilePath), { recursive: true });
    fs.writeFileSync(markdownFilePath, renderMarkdownChecklist(payload));
  }
  if (options.json) {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
    if (blockers.length > 0) {
      console.error(`[desktop-release-status] blocked: ${blockers.length} release requirement(s) are not satisfied`);
      process.exitCode = 1;
    }
    return;
  }

  console.log(`[desktop-release-status] ${options.repo} ${options.tag}`);
  for (const check of checks) {
    const marker = check.status === "ok" ? "✓" : check.status === "skipped" ? "·" : "✗";
    console.log(`${marker} ${check.label}: ${check.detail}`);
    if (check.next) {
      console.log(`  next: ${check.next}`);
    }
    if (Array.isArray(check.commands) && check.commands.length > 0) {
      console.log("  commands (run in one shell session):");
      for (const command of check.commands) {
        console.log(`    - ${command}`);
      }
    }
  }
  if (blockers.length > 0) {
    console.error(`[desktop-release-status] blocked: ${blockers.length} release requirement(s) are not satisfied`);
    process.exitCode = 1;
    return;
  }
  console.log("[desktop-release-status] ready: public macOS release requirements are satisfied");
}

function groupBlockersByOwner(blockers) {
  const byOwner = {};
  for (const check of blockers) {
    const owner = check.owner ?? "developer";
    byOwner[owner] ??= [];
    byOwner[owner].push(check.id);
  }
  return byOwner;
}

function renderMarkdownChecklist(payload) {
  const lines = [
    "# macOS Release Status",
    "",
    `- Repo: \`${payload.repo}\``,
    `- Tag: \`${payload.tag}\``,
    `- PR: ${payload.pr ? `#${payload.pr}` : "not checked"}`,
    `- Status: ${payload.status}`,
    `- Ready: ${payload.ready ? "yes" : "no"}`,
    `- Generated: ${payload.generatedAt}`,
    `- Ready at: ${payload.readyAt ?? "not ready"}`,
    `- Blocked at: ${payload.blockedAt ?? "not blocked"}`,
    "",
    "## Blockers",
    "",
  ];

  const blockers = payload.checks.filter((check) => check.status === "blocked");
  if (blockers.length === 0) {
    lines.push("No blockers.", "");
  } else {
    for (const check of blockers) {
      lines.push(`- [ ] ${check.label} (\`${check.id}\`)`);
      lines.push(`  - Scope: ${check.scope}`);
      lines.push(`  - Owner: ${check.owner}`);
      lines.push(`  - Detail: ${check.detail}`);
      if (check.next) {
        lines.push(`  - Next: \`${check.next}\``);
      }
      if (Array.isArray(check.commands) && check.commands.length > 0) {
        lines.push("  - Commands (run in one shell session):");
        for (const command of check.commands) {
          lines.push(`    - \`${command}\``);
        }
      }
      const missingSecretNames = [
        ...(Array.isArray(check.missingSecrets) ? check.missingSecrets : []),
        ...(Array.isArray(check.missingHostedSecrets) ? check.missingHostedSecrets : []),
      ];
      if (missingSecretNames.length > 0) {
        lines.push("  - Missing secrets:");
        for (const secret of missingSecretNames) {
          lines.push(`    - \`${secret}\``);
        }
      }
    }
    lines.push("");
  }

  lines.push("## Checks", "");
  for (const check of payload.checks) {
    const marker = check.status === "ok" ? "[x]" : check.status === "skipped" ? "[-]" : "[ ]";
    lines.push(`- ${marker} ${check.label} (\`${check.id}\`) - ${check.detail}`);
  }
  lines.push("");
  return `${lines.join("\n")}`;
}

await main();
