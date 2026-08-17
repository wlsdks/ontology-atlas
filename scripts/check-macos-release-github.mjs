#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const DEFAULT_REPO = "wlsdks/ontology-atlas";
const SIGNING_ENVIRONMENT = "release-signing";
const PUBLICATION_ENVIRONMENT = "release";
const ENVIRONMENT_REQUIRED_SECRETS = [
  "APPLE_API_KEY_P8_BASE64",
  "APPLE_API_KEY_ID",
  "APPLE_API_ISSUER_ID",
];
const REPOSITORY_REQUIRED_SECRETS = [
  "APPLE_CERTIFICATE_P12_BASE64",
  "APPLE_CERTIFICATE_PASSWORD",
  "TAURI_SIGNING_PRIVATE_KEY",
  "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
];
const OBSOLETE_REPOSITORY_SECRETS = [
  "APPLE_ID",
  "APPLE_APP_SPECIFIC_PASSWORD",
  "APPLE_TEAM_ID",
];
const REQUIRED_WORKFLOWS = [
  {
    file: "release-macos.yml",
    description: "macOS release",
  },
];

function printHelp() {
  console.log(`Usage: pnpm desktop:release-github [--repo=${DEFAULT_REPO}] [--tag=vX.Y.Z] [--allow-obsolete-repository-secrets]

Checks GitHub-side prerequisites for the protected release workflow before a
public workflow_dispatch release: gh authentication, the active workflow file,
an automatic main-only ${SIGNING_ENVIRONMENT} environment with no admin bypass,
a separately reviewed main-only ${PUBLICATION_ENVIRONMENT} publication environment,
API notarization secrets stored in ${SIGNING_ENVIRONMENT}, legacy certificate/updater
material retained at repository scope, optional local tag/version
alignment, and clean remote tag/Release slots.

This check can only prove that required secret names exist at their approved
scope and redundant repository API secrets are absent. The dispatched workflow still runs
desktop:release-secrets to verify values and certificate structure.

For the one transition release that proves the new API-key workflow before
deleting unreadable legacy credentials, --allow-obsolete-repository-secrets
permits only APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID to remain.
The release workflow contract must still prove those names are not referenced,
and the normal gate remains red until they are deleted after the release passes.

Required ${SIGNING_ENVIRONMENT} environment secret names:
${ENVIRONMENT_REQUIRED_SECRETS.map((name) => `  ${name}`).join("\n")}

Required repository secret names:
${REPOSITORY_REQUIRED_SECRETS.map((name) => `  ${name}`).join("\n")}

The hosted website deploy is intentionally excluded from this macOS app release
gate. GitHub Pages (deploy-pages.yml) publishes the static promo/download site
separately; run pnpm desktop:verify-hosted to check that surface.
`);
}

function fail(message) {
  console.error(`[desktop-release-github] ${message}`);
  process.exit(1);
}

function secretSetHints(repo, names) {
  return names
    .map((name) => `  gh secret set ${name} --env ${SIGNING_ENVIRONMENT} --repo ${repo} < /path/to/${name}`)
    .join("\n");
}

function repositorySecretSetHints(repo, names) {
  return names
    .map((name) => `  gh secret set ${name} --repo ${repo} < /path/to/${name}`)
    .join("\n");
}

function parseArgs(argv) {
  const options = {
    repo: DEFAULT_REPO,
    tag: "",
    allowObsoleteRepositorySecrets: false,
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
    if (arg === "--allow-obsolete-repository-secrets") {
      options.allowObsoleteRepositorySecrets = true;
      continue;
    }
    fail(`unknown argument: ${arg}`);
  }
  if (!/^[^/\s]+\/[^/\s]+$/.test(options.repo)) {
    fail("--repo must use owner/name format.");
  }
  if (options.tag && !/^v.+/.test(options.tag)) {
    fail(`--tag must be v-prefixed, got ${options.tag}.`);
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
    fail(`failed to run gh ${args.join(" ")}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    if (
      args.some((arg) => String(arg).includes("actions/workflows/")) &&
      /\b404\b|not found/i.test(result.stderr || result.stdout)
    ) {
      const workflowFile = String(args.find((arg) => String(arg).includes("actions/workflows/")) ?? "")
        .split("/")
        .pop() ?? "workflow";
      fail(
        `${workflowFile} is not available to GitHub for this repo yet. If the workflow is still on a PR branch, merge that PR into the default branch before pushing the release tag. Otherwise, commit and push .github/workflows/${workflowFile} first.`,
      );
    }
    fail(`gh ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`);
  }
  if (!parseJson) return result.stdout;
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    fail(`gh ${args.join(" ")} returned invalid JSON: ${error.message}`);
  }
}

function runGhStatus(args) {
  const result = spawnSync(ghBin(), args, {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (result.error) {
    fail(`failed to run gh ${args.join(" ")}: ${result.error.message}`);
  }
  return result;
}

function runGitStatus(args) {
  const result = spawnSync(gitBin(), args, {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (result.error) {
    fail(`failed to run git ${args.join(" ")}: ${result.error.message}`);
  }
  return result;
}

function runNode(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (result.status !== 0) {
    fail((result.stderr || result.stdout).trim());
  }
}

const options = parseArgs(process.argv.slice(2));

runGh(["auth", "status"]);

for (const workflowInfo of REQUIRED_WORKFLOWS) {
  const workflow = runGh([
    "api",
    `repos/${options.repo}/actions/workflows/${workflowInfo.file}`,
  ], { parseJson: true });
  if (workflow?.state !== "active") {
    fail(`${workflowInfo.file} workflow for ${options.repo} is not active.`);
  }
}

const defaultBranch = runGh([
  "repo",
  "view",
  options.repo,
  "--json",
  "defaultBranchRef",
  "--jq",
  ".defaultBranchRef.name",
]).trim();
if (!defaultBranch) {
  fail(`GitHub did not report a default branch for ${options.repo}.`);
}

const signingEnvironment = runGh([
  "api",
  `repos/${options.repo}/environments/${SIGNING_ENVIRONMENT}`,
], { parseJson: true });
const reviewerRule = Array.isArray(signingEnvironment?.protection_rules)
  ? signingEnvironment.protection_rules.find((rule) => rule?.type === "required_reviewers")
  : null;
if (Array.isArray(reviewerRule?.reviewers) && reviewerRule.reviewers.length > 0) {
  fail(`${SIGNING_ENVIRONMENT} must not require a signing-stage reviewer; keep the human approval on the separate release publication environment.`);
}
if (signingEnvironment?.can_admins_bypass !== false) {
  fail(`${SIGNING_ENVIRONMENT} must disable administrator bypass.`);
}
if (
  signingEnvironment?.deployment_branch_policy?.protected_branches !== false ||
  signingEnvironment?.deployment_branch_policy?.custom_branch_policies !== true
) {
  fail(`${SIGNING_ENVIRONMENT} must use a custom deployment branch policy that allows only ${defaultBranch}.`);
}
const branchPolicies = runGh([
  "api",
  `repos/${options.repo}/environments/${SIGNING_ENVIRONMENT}/deployment-branch-policies`,
], { parseJson: true });
const admittedPolicies = Array.isArray(branchPolicies?.branch_policies)
  ? branchPolicies.branch_policies
      .filter((policy) => typeof policy?.name === "string" && typeof policy?.type === "string")
      .map((policy) => ({ name: policy.name, type: policy.type }))
      .sort((left, right) => `${left.type}:${left.name}`.localeCompare(`${right.type}:${right.name}`))
  : [];
if (
  admittedPolicies.length !== 1 ||
  admittedPolicies[0]?.type !== "branch" ||
  admittedPolicies[0]?.name !== defaultBranch
) {
  fail(
    `${SIGNING_ENVIRONMENT} must allow exactly the default branch ${defaultBranch} and no tag rules; found ${admittedPolicies.map((policy) => `${policy.type}:${policy.name}`).join(", ") || "none"}.`,
  );
}

const publicationEnvironment = runGh([
  "api",
  `repos/${options.repo}/environments/${PUBLICATION_ENVIRONMENT}`,
], { parseJson: true });
const publicationReviewerRule = Array.isArray(publicationEnvironment?.protection_rules)
  ? publicationEnvironment.protection_rules.find((rule) => rule?.type === "required_reviewers")
  : null;
if (!Array.isArray(publicationReviewerRule?.reviewers) || publicationReviewerRule.reviewers.length === 0) {
  fail(`${PUBLICATION_ENVIRONMENT} must require a reviewer before a draft release can be published.`);
}
if (publicationEnvironment?.can_admins_bypass !== false) {
  fail(`${PUBLICATION_ENVIRONMENT} must disable administrator bypass.`);
}
if (
  publicationEnvironment?.deployment_branch_policy?.protected_branches !== false ||
  publicationEnvironment?.deployment_branch_policy?.custom_branch_policies !== true
) {
  fail(`${PUBLICATION_ENVIRONMENT} must use a custom deployment branch policy that allows only ${defaultBranch}.`);
}
const publicationPolicies = runGh([
  "api",
  `repos/${options.repo}/environments/${PUBLICATION_ENVIRONMENT}/deployment-branch-policies`,
], { parseJson: true });
const admittedPublicationPolicies = Array.isArray(publicationPolicies?.branch_policies)
  ? publicationPolicies.branch_policies
      .filter((policy) => typeof policy?.name === "string" && typeof policy?.type === "string")
      .map((policy) => ({ name: policy.name, type: policy.type }))
  : [];
if (
  admittedPublicationPolicies.length !== 1 ||
  admittedPublicationPolicies[0]?.type !== "branch" ||
  admittedPublicationPolicies[0]?.name !== defaultBranch
) {
  fail(`${PUBLICATION_ENVIRONMENT} must allow exactly the default branch ${defaultBranch} and no tag rules.`);
}

const secrets = runGh([
  "secret",
  "list",
  "--env",
  SIGNING_ENVIRONMENT,
  "--repo",
  options.repo,
  "--json",
  "name",
], { parseJson: true });
if (!Array.isArray(secrets)) {
  fail("gh secret list did not return an array.");
}
const secretNames = new Set(secrets.map((secret) => secret?.name).filter(Boolean));
const missing = ENVIRONMENT_REQUIRED_SECRETS.filter((name) => !secretNames.has(name));
if (missing.length > 0) {
  fail(
    `missing ${SIGNING_ENVIRONMENT} environment secrets for ${options.repo}: ${missing.join(", ")}. Add the Developer ID signing/notary secrets for direct-download DMGs (not Mac App Store submission) and updater secrets before dispatching the release.\n\nSet them with:\n${secretSetHints(options.repo, missing)}`,
  );
}

const repositorySecrets = runGh([
  "secret",
  "list",
  "--repo",
  options.repo,
  "--json",
  "name",
], { parseJson: true });
if (!Array.isArray(repositorySecrets)) {
  fail("gh secret list for repository scope did not return an array.");
}
const repositorySecretNames = new Set(repositorySecrets.map((secret) => secret?.name).filter(Boolean));
const missingRepositorySecrets = REPOSITORY_REQUIRED_SECRETS.filter(
  (name) => !repositorySecretNames.has(name),
);
if (missingRepositorySecrets.length > 0) {
  fail(
    `missing required repository signing secrets for ${options.repo}: ${missingRepositorySecrets.join(", ")}. Preserve the existing Developer ID certificate and Tauri updater identity; do not regenerate updater keys.\n\nSet them with:\n${repositorySecretSetHints(options.repo, missingRepositorySecrets)}`,
  );
}
const overScopedRepositorySecrets = ENVIRONMENT_REQUIRED_SECRETS.filter(
  (name) => repositorySecretNames.has(name),
);
if (overScopedRepositorySecrets.length > 0) {
  fail(
    `over-scoped repository API secrets remain for ${options.repo}: ${overScopedRepositorySecrets.join(", ")}. Keep API credentials only in ${SIGNING_ENVIRONMENT}:\n${overScopedRepositorySecrets.map((name) => `  gh secret delete ${name} --repo ${options.repo}`).join("\n")}`,
  );
}
const obsoleteRepositorySecrets = OBSOLETE_REPOSITORY_SECRETS.filter(
  (name) => repositorySecretNames.has(name),
);
if (obsoleteRepositorySecrets.length > 0 && !options.allowObsoleteRepositorySecrets) {
  fail(
    `obsolete or over-scoped repository signing secrets remain for ${options.repo}: ${obsoleteRepositorySecrets.join(", ")}. Prove one release with the API-key workflow by rerunning this command with --allow-obsolete-repository-secrets, then delete these unused Apple ID credentials only after that release passes:\n${obsoleteRepositorySecrets.map((name) => `  gh secret delete ${name} --repo ${options.repo}`).join("\n")}`,
  );
}
if (obsoleteRepositorySecrets.length > 0) {
  console.warn(
    `[desktop-release-github] transition release only: ${obsoleteRepositorySecrets.join(", ")} remain at repository scope but are not referenced by release-macos.yml. The workflow security contract keeps them unused. Prove the API-key release, then delete them only after this release passes:\n${obsoleteRepositorySecrets.map((name) => `  gh secret delete ${name} --repo ${options.repo}`).join("\n")}`,
  );
}

if (options.tag) {
  runNode(["scripts/check-macos-release-tag.mjs", `--tag=${options.tag}`]);
  const localTagRef = runGitStatus(["rev-parse", "--verify", "--quiet", `refs/tags/${options.tag}`]);
  if (localTagRef.status === 0) {
    fail(
      `local git tag ${options.tag} already exists. Delete the stale local tag with git tag -d ${options.tag} after verifying it was not pushed, or choose a new version before pushing a macOS release tag.`,
    );
  }
  if (localTagRef.status !== 1) {
    const output = `${localTagRef.stderr || ""}\n${localTagRef.stdout || ""}`.trim();
    fail(`git rev-parse --verify refs/tags/${options.tag} failed: ${output || `exit ${localTagRef.status}`}`);
  }
  const tagRef = runGhStatus(["api", `repos/${options.repo}/git/ref/tags/${options.tag}`]);
  if (tagRef.status === 0) {
    fail(
      `git tag ${options.tag} already exists for ${options.repo}. Inspect the existing tag workflow run or choose a new version before pushing a macOS release tag.`,
    );
  }
  const tagRefOutput = `${tagRef.stderr || ""}\n${tagRef.stdout || ""}`;
  if (!/\b404\b|not found/i.test(tagRefOutput)) {
    fail(`gh api repos/${options.repo}/git/ref/tags/${options.tag} failed: ${tagRefOutput.trim() || `exit ${tagRef.status}`}`);
  }
  runNode(["scripts/check-macos-release-slot.mjs", `--repo=${options.repo}`, `--tag=${options.tag}`]);
}

console.log(
  `[desktop-release-github] ${options.repo} has the protected ${SIGNING_ENVIRONMENT} environment, reviewed ${PUBLICATION_ENVIRONMENT} environment, and all required split-scope signing secret names`,
);
if (options.tag) {
  console.log(`[desktop-release-github] ${options.tag} matches package, Tauri, and Cargo versions`);
  console.log(`[desktop-release-github] ${options.tag} has no existing local Git tag`);
  console.log(`[desktop-release-github] ${options.tag} has no existing Git tag`);
  console.log(`[desktop-release-github] ${options.tag} has no existing GitHub Release`);
}
