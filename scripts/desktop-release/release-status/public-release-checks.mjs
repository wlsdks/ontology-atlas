/** The public release requirements: the workflow, the tag slot, the GitHub Release and its download assets. */

import { runGh, runGhStatus, runGitStatus, runNode } from "./command-runners.mjs";
import { blocked, ok } from "./check-result.mjs";
import { prMerged } from "./pull-request-check.mjs";
import { SIGNING_ENVIRONMENT } from "./signing-secrets-check.mjs";

function defaultBranchCommand(repo) {
  return `gh repo view ${repo} --json defaultBranchRef --jq .defaultBranchRef.name`;
}

export function releasePublishCommands({ repo, tag, prNumber }) {
  const defaultBranch = defaultBranchCommand(repo);
  const commands = [
    `pnpm desktop:release-github -- --repo=${repo} --tag=${tag}`,
    `gh secret list --env ${SIGNING_ENVIRONMENT} --repo ${repo}`,
    `DEFAULT_BRANCH="$(${defaultBranch})"`,
    `git fetch origin "$DEFAULT_BRANCH" --tags`,
    `git tag ${tag} "origin/$DEFAULT_BRANCH"`,
    `git push origin ${tag}`,
    `pnpm desktop:release-source -- --mode=admit --repo=${repo} --tag=${tag} --sha="$(git rev-parse "origin/$DEFAULT_BRANCH")"`,
    `pnpm desktop:release-run -- --repo=${repo} --tag=${tag} --ref="$DEFAULT_BRANCH"`,
    `gh release view ${tag} --repo ${repo}`,
    `pnpm desktop:verify-download -- --repo=${repo} --tag=${tag}`,
  ];
  if (prNumber) {
    commands.unshift(`gh pr view ${prNumber} --repo ${repo} --json state,mergedAt,reviewDecision,mergeStateStatus,statusCheckRollup,url`);
  }
  return commands;
}

export function releaseMissingNext({ prMerged: merged, tag }) {
  if (merged) {
    return `Configure the protected ${SIGNING_ENVIRONMENT} environment, create ${tag} at the current default-branch head, then dispatch .github/workflows/release-macos.yml from that branch.`;
  }
  return `Merge the desktop PR, configure the protected ${SIGNING_ENVIRONMENT} environment, create ${tag} at the current default-branch head, then dispatch .github/workflows/release-macos.yml from that branch.`;
}

export function isNotFound(message) {
  return /\b404\b|not found|release not found/i.test(message);
}

function statusOutput(result) {
  return `${result?.stderr || ""}\n${result?.stdout || ""}`.trim();
}

function workflowUnavailableMessage(repo) {
  return `release-macos.yml is not available to GitHub for ${repo}. If the workflow is still on a PR branch, merge the desktop PR before pushing the release tag.`;
}

export function checkReleaseWorkflow(options, checks) {
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
}

export function checkReleaseTagSlot(options, checks) {
  const localTagRef = runGitStatus(["rev-parse", "--verify", "--quiet", `refs/tags/${options.tag}`]);
  const remoteTagRef = runGhStatus(["api", `repos/${options.repo}/git/ref/tags/${options.tag}`]);
  const remoteTagOutput = statusOutput(remoteTagRef);
  if (localTagRef.status !== 0 && localTagRef.status !== 1) {
    checks.push(blocked(
      "release_tag_slot",
      "Release tag slot",
      `git rev-parse --verify refs/tags/${options.tag} failed: ${statusOutput(localTagRef) || `exit ${localTagRef.status}`}`,
      `Run git rev-parse --verify --quiet refs/tags/${options.tag} locally before tagging.`,
      [`git rev-parse --verify --quiet refs/tags/${options.tag}`],
      { scope: "local", owner: "developer" },
    ));
  } else if (remoteTagRef.status === 0) {
    checks.push(ok(
      "release_tag_slot",
      "Release tag slot",
      `${options.tag} exists remotely as the expected workflow_dispatch release input${localTagRef.status === 0 ? " and is also present locally" : ""}`,
    ));
  } else if (!isNotFound(remoteTagOutput)) {
    checks.push(blocked(
      "release_tag_slot",
      "Release tag slot",
      `gh api repos/${options.repo}/git/ref/tags/${options.tag} failed: ${remoteTagOutput || `exit ${remoteTagRef.status}`}`,
      `Run gh api repos/${options.repo}/git/ref/tags/${options.tag} to inspect the remote tag.`,
      [`gh api repos/${options.repo}/git/ref/tags/${options.tag}`],
    ));
  } else if (localTagRef.status === 0) {
    checks.push(blocked(
      "release_tag_slot",
      "Release tag slot",
      `local git tag ${options.tag} exists but the remote tag does not`,
      `Delete the stale local tag with git tag -d ${options.tag}, or push it only after desktop:release-github succeeds.`,
      [`git tag -d ${options.tag}`],
      { scope: "local", owner: "developer" },
    ));
  } else {
    checks.push(ok("release_tag_slot", "Release tag slot", `${options.tag} is available for creation before protected dispatch`));
  }
}

export function checkGithubRelease(options, checks, selectedPr) {
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
      checks.push(blocked(
        "download_assets",
        "Download assets",
        "verification skipped by OATLAS_RELEASE_STATUS_SKIP_DOWNLOAD_VERIFY=1",
        `Run pnpm desktop:verify-download -- --repo=${options.repo} --tag=${options.tag} without the skip environment variable.`,
        [`pnpm desktop:verify-download -- --repo=${options.repo} --tag=${options.tag}`],
      ));
    } else {
      const download = runNode([
        "scripts/download/check-macos-download-release.mjs",
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
}
