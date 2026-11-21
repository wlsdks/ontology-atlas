#!/usr/bin/env node
import { runGh, runNode } from "./release-status/environment.mjs";
import { blocked, ok, skipped } from "./release-status/check-result.mjs";
import { parseArgs } from "./release-status/options.mjs";
import { checkPullRequest } from "./release-status/pull-request-check.mjs";
import { checkGithubRelease, checkReleaseTagSlot, checkReleaseWorkflow } from "./release-status/public-release-checks.mjs";
import { checkSigningSecrets } from "./release-status/signing-secrets-check.mjs";
import { renderAndExit } from "./release-status/status-report.mjs";

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const checks = [];

  const auth = runGh(["auth", "status"]);
  if (!auth.ok) {
    checks.push(blocked("github_cli_auth", "GitHub CLI auth", auth.message, "Run gh auth login, then rerun desktop:release-status.", ["gh auth login"]));
    renderAndExit(options, checks);
  }
  checks.push(ok("github_cli_auth", "GitHub CLI auth", "gh auth status succeeded"));

  const tagAlignment = runNode([
    "scripts/desktop-release/check-macos-release-tag.mjs",
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

  if (process.env.OATLAS_RELEASE_STATUS_LOCAL_PREFLIGHT === "1") {
    checks.push(ok(
      "local_preflight",
      "Local release preflight",
      "desktop:release-preflight passed before this audit, including LaunchServices app content proof and DMG install smoke",
    ));
  } else {
    checks.push(skipped(
      "local_preflight",
      "Local release preflight",
      "not asserted by desktop:release-status; run pnpm desktop:goal-audit to chain local preflight with this public release audit",
    ));
  }
  const selectedPr = checkPullRequest(options, checks);
  checkReleaseWorkflow(options, checks);
  checkReleaseTagSlot(options, checks);
  checkSigningSecrets(options, checks);
  checkGithubRelease(options, checks, selectedPr);

  renderAndExit(options, checks);
}

await main();
