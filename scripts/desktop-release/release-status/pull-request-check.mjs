/** The pull request requirement: is it merge-ready, or the latest merged one, and what to do next. */

import { runGh, currentDate } from "./environment.mjs";
import { blocked, ok } from "./check-result.mjs";

export function prChecksPassed(pr) {
  const checks = Array.isArray(pr.statusCheckRollup) ? pr.statusCheckRollup : [];
  if (checks.length === 0) return false;
  return checks.every((check) => check.status === "COMPLETED" && check.conclusion === "SUCCESS");
}

export function prCheckSummary(pr) {
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

export function prNextAction({ checksOk, isDraft, prNumber, repo, url }) {
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

export function prNextCommands({ checksOk, isDraft, prNumber, repo }) {
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

export function formatElapsed(ms) {
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours === 0 ? `${days}d` : `${days}d ${restHours}h`;
}

export function prMerged(pr) {
  if (!pr) return false;
  return pr.state === "MERGED" || Boolean(pr.mergedAt);
}

function latestMergedPr(repo) {
  return runGh([
    "pr",
    "list",
    "--repo",
    repo,
    "--state",
    "merged",
    "--limit",
    "1",
    "--json",
    "number,title,mergedAt",
  ], { parseJson: true });
}

export function prReviewSatisfied(pr) {
  return !pr.reviewDecision || pr.reviewDecision === "APPROVED";
}

/** Pushes this requirement's result; returns the pull request GitHub reported, or null when it could not be read. */
export function checkPullRequest(options, checks) {
  let selectedPr = null;
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
        const latest = latestMergedPr(options.repo);
        if (!latest.ok) {
          checks.push(blocked(
            "pull_request",
            "Pull request",
            `PR #${options.pr} is merged, but latest merged PR lookup failed: ${latest.message}`,
            `Run gh pr list --repo ${options.repo} --state merged --limit 1 --json number,title,mergedAt and rerun the audit with the latest merged PR number.`,
            [
              `gh pr list --repo ${options.repo} --state merged --limit 1 --json number,title,mergedAt`,
              `pnpm desktop:release-status -- --pr=<latest-merged-pr> --tag=${options.tag}`,
            ],
          ));
        } else {
          const latestValue = Array.isArray(latest.value) ? latest.value[0] : null;
          const latestNumber = latestValue?.number ? String(latestValue.number) : "";
          if (!latestNumber) {
            checks.push(blocked(
              "pull_request",
              "Pull request",
              `PR #${options.pr} is merged, but GitHub did not return a latest merged PR for ${options.repo}`,
              `Run gh pr list --repo ${options.repo} --state merged --limit 1 --json number,title,mergedAt and verify the PR evidence manually.`,
              [`gh pr list --repo ${options.repo} --state merged --limit 1 --json number,title,mergedAt`],
            ));
          } else if (latestNumber !== options.pr) {
            const latestTitle = typeof latestValue.title === "string" && latestValue.title
              ? `: ${latestValue.title}`
              : "";
            checks.push(blocked(
              "pull_request",
              "Pull request",
              `PR #${options.pr} is merged, but latest merged PR is #${latestNumber}${latestTitle}`,
              `Rerun the audit with --pr=${latestNumber} so release readiness cites the latest merged PR on the release branch.`,
              [
                `pnpm desktop:release-status -- --pr=${latestNumber} --tag=${options.tag}`,
                `pnpm desktop:goal-audit -- --pr=${latestNumber} --tag=${options.tag}`,
              ],
            ));
          } else {
            checks.push(ok("pull_request", "Pull request", `PR #${options.pr} is already merged and is the latest merged PR`));
          }
        }
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
    checks.push(blocked(
      "pull_request",
      "Pull request",
      "--pr=NUMBER is required to prove review and merge readiness",
      `Rerun desktop:release-status with --pr=NUMBER, or use pnpm desktop:goal-audit -- --pr=NUMBER --tag=${options.tag} for the full completion gate.`,
      [
        `pnpm desktop:release-status -- --pr=<number> --tag=${options.tag}`,
        `pnpm desktop:goal-audit -- --pr=<number> --tag=${options.tag}`,
      ],
    ));
  }
  return selectedPr;
}
