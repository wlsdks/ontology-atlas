/** The signing requirement: the release-signing and release environments, and the secrets kept in them. */

import { runGh } from "./command-runners.mjs";
import { blocked, ok } from "./check-result.mjs";

export const SIGNING_ENVIRONMENT = "release-signing";
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
const DIRECT_DOWNLOAD_SECRET_LABEL = "Developer ID direct-download secrets";

function secretSetHints(repo, names) {
  return names.map((name) => `gh secret set ${name} --env ${SIGNING_ENVIRONMENT} --repo ${repo} < /path/to/${name}`).join("; ");
}

function secretSetCommands(repo, names) {
  return names.map((name) => `gh secret set ${name} --env ${SIGNING_ENVIRONMENT} --repo ${repo} < /path/to/${name}`);
}

function reviewerRuleOf(environment) {
  return Array.isArray(environment?.protection_rules)
    ? environment.protection_rules.find((rule) => rule?.type === "required_reviewers")
    : null;
}

const lacksCustomBranchPolicy = (environment) =>
  environment?.deployment_branch_policy?.protected_branches !== false ||
  environment?.deployment_branch_policy?.custom_branch_policies !== true;

/** What is wrong with the signing environment's protection, or "" when it is as the release requires. */
export function signingEnvironmentFailure(environment, defaultBranch) {
  const reviewerRule = reviewerRuleOf(environment);
  if (Array.isArray(reviewerRule?.reviewers) && reviewerRule.reviewers.length > 0) {
    return `${SIGNING_ENVIRONMENT} must keep signing automatic; retain human approval only on the separate release publication environment.`;
  }
  if (environment?.can_admins_bypass !== false) {
    return `${SIGNING_ENVIRONMENT} must disable administrator bypass.`;
  }
  if (lacksCustomBranchPolicy(environment)) {
    return `${SIGNING_ENVIRONMENT} must use an exact custom branch policy for ${defaultBranch}.`;
  }
  return "";
}

/** What is wrong with the publication environment's protection, or "" when it is as the release requires. */
export function publicationEnvironmentFailure(environment, defaultBranch) {
  const reviewerRule = reviewerRuleOf(environment);
  if (!Array.isArray(reviewerRule?.reviewers) || reviewerRule.reviewers.length === 0) {
    return `${PUBLICATION_ENVIRONMENT} must require a publication reviewer.`;
  }
  if (environment?.can_admins_bypass !== false) {
    return `${PUBLICATION_ENVIRONMENT} must disable administrator bypass.`;
  }
  if (lacksCustomBranchPolicy(environment)) {
    return `${PUBLICATION_ENVIRONMENT} must use an exact custom branch policy for ${defaultBranch}.`;
  }
  return "";
}

/** Whether an environment admits exactly the default branch and no tag rules, or the sentence saying it does not. */
export function branchPolicyFailure(policies, environmentName, defaultBranch) {
  const rows = Array.isArray(policies?.branch_policies)
    ? policies.branch_policies.filter((policy) => typeof policy?.name === "string" && typeof policy?.type === "string")
    : [];
  if (rows.length !== 1 || rows[0]?.type !== "branch" || rows[0]?.name !== defaultBranch) {
    return `${environmentName} must allow exactly branch ${defaultBranch} and no tag rules.`;
  }
  return "";
}

/** Pushes this requirement's result; reads the repository's environments and secret names through gh. */
export function checkSigningSecrets(options, checks) {
  const signingCheckCommand = `pnpm desktop:release-github -- --repo=${options.repo} --tag=${options.tag}`;
  const environmentSecretListCommand = `gh secret list --env ${SIGNING_ENVIRONMENT} --repo ${options.repo}`;
  const defaultBranchResult = runGh([
    "repo",
    "view",
    options.repo,
    "--json",
    "defaultBranchRef",
  ], { parseJson: true });
  const defaultBranch = defaultBranchResult.ok
    ? defaultBranchResult.value?.defaultBranchRef?.name
    : null;
  let signingFailure = defaultBranchResult.ok
    ? (!defaultBranch ? `GitHub did not report a default branch for ${options.repo}.` : "")
    : defaultBranchResult.message;
  if (!signingFailure) {
    const environmentResult = runGh([
      "api",
      `repos/${options.repo}/environments/${SIGNING_ENVIRONMENT}`,
    ], { parseJson: true });
    if (!environmentResult.ok) {
      signingFailure = environmentResult.message;
    } else {
      signingFailure = signingEnvironmentFailure(environmentResult.value, defaultBranch);
    }
  }

  if (!signingFailure) {
    const policies = runGh([
      "api",
      `repos/${options.repo}/environments/${SIGNING_ENVIRONMENT}/deployment-branch-policies`,
    ], { parseJson: true });
    if (!policies.ok) {
      signingFailure = policies.message;
    } else {
      signingFailure = branchPolicyFailure(policies.value, SIGNING_ENVIRONMENT, defaultBranch);
    }
  }

  if (!signingFailure) {
    const publicationResult = runGh([
      "api",
      `repos/${options.repo}/environments/${PUBLICATION_ENVIRONMENT}`,
    ], { parseJson: true });
    if (!publicationResult.ok) {
      signingFailure = publicationResult.message;
    } else {
      signingFailure = publicationEnvironmentFailure(publicationResult.value, defaultBranch);
    }
  }

  if (!signingFailure) {
    const publicationPolicies = runGh([
      "api",
      `repos/${options.repo}/environments/${PUBLICATION_ENVIRONMENT}/deployment-branch-policies`,
    ], { parseJson: true });
    if (!publicationPolicies.ok) {
      signingFailure = publicationPolicies.message;
    } else {
      signingFailure = branchPolicyFailure(publicationPolicies.value, PUBLICATION_ENVIRONMENT, defaultBranch);
    }
  }

  let environmentSecretNames = null;
  if (!signingFailure) {
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
    if (!secrets.ok) {
      signingFailure = secrets.message;
    } else if (!Array.isArray(secrets.value)) {
      signingFailure = `gh secret list --env ${SIGNING_ENVIRONMENT} did not return an array.`;
    } else {
      environmentSecretNames = new Set(secrets.value.map((secret) => secret?.name).filter(Boolean));
    }
  }

  let repositorySecretNames = null;
  if (!signingFailure) {
    const repositorySecrets = runGh([
      "secret",
      "list",
      "--repo",
      options.repo,
      "--json",
      "name",
    ], { parseJson: true });
    if (!repositorySecrets.ok) {
      signingFailure = repositorySecrets.message;
    } else if (!Array.isArray(repositorySecrets.value)) {
      signingFailure = "repository gh secret list did not return an array.";
    } else {
      repositorySecretNames = new Set(repositorySecrets.value.map((secret) => secret?.name).filter(Boolean));
    }
  }

  if (signingFailure) {
    checks.push(blocked(
      "apple_release_secrets",
      DIRECT_DOWNLOAD_SECRET_LABEL,
      signingFailure,
      `Run ${signingCheckCommand}.`,
      [signingCheckCommand, environmentSecretListCommand],
    ));
  } else {
    const missingEnvironment = ENVIRONMENT_REQUIRED_SECRETS.filter(
      (name) => !environmentSecretNames.has(name),
    );
    const missingRepository = REPOSITORY_REQUIRED_SECRETS.filter(
      (name) => !repositorySecretNames.has(name),
    );
    const forbiddenRepository = [
      ...ENVIRONMENT_REQUIRED_SECRETS,
      ...OBSOLETE_REPOSITORY_SECRETS,
    ].filter((name) => repositorySecretNames.has(name));
    if (missingEnvironment.length > 0) {
      checks.push(blocked(
        "apple_release_secrets",
        DIRECT_DOWNLOAD_SECRET_LABEL,
        `missing ${missingEnvironment.join(", ")} from ${SIGNING_ENVIRONMENT} (App Store Connect API notarization credentials)`,
        secretSetHints(options.repo, missingEnvironment),
        secretSetCommands(options.repo, missingEnvironment),
        { missingSecrets: missingEnvironment },
      ));
    } else if (missingRepository.length > 0) {
      const commands = missingRepository.map(
        (name) => `gh secret set ${name} --repo ${options.repo} < /path/to/${name}`,
      );
      checks.push(blocked(
        "apple_release_secrets",
        DIRECT_DOWNLOAD_SECRET_LABEL,
        `missing retained repository signing secrets: ${missingRepository.join(", ")}`,
        "Restore the original Developer ID certificate or updater identity; never regenerate an updater key for an already distributed app.",
        commands,
        { missingSecrets: missingRepository },
      ));
    } else if (forbiddenRepository.length > 0) {
      const deleteCommands = forbiddenRepository.map((name) => `gh secret delete ${name} --repo ${options.repo}`);
      checks.push(blocked(
        "apple_release_secrets",
        DIRECT_DOWNLOAD_SECRET_LABEL,
        `obsolete or over-scoped repository signing secrets remain: ${forbiddenRepository.join(", ")}`,
        `Keep API credentials in ${SIGNING_ENVIRONMENT}; delete obsolete Apple ID credentials only after the first API-key release passes, then rerun this strict completion audit.`,
        [environmentSecretListCommand, ...deleteCommands],
      ));
    } else {
      checks.push(ok(
        "apple_release_secrets",
        DIRECT_DOWNLOAD_SECRET_LABEL,
        `${SIGNING_ENVIRONMENT} admits only ${defaultBranch}; API credentials are environment-scoped and certificate/updater identities are retained at repository scope`,
      ));
    }
  }
}
