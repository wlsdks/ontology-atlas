#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const DEFAULT_REPO = "wlsdks/oh-my-ontology";
const REQUIRED_SECRETS = [
  "APPLE_CERTIFICATE_P12_BASE64",
  "APPLE_CERTIFICATE_PASSWORD",
  "APPLE_KEYCHAIN_PASSWORD",
  "APPLE_SIGNING_IDENTITY",
  "APPLE_ID",
  "APPLE_APP_SPECIFIC_PASSWORD",
  "APPLE_TEAM_ID",
];
const REQUIRED_HOSTING_SECRETS = [
  "FIREBASE_SERVICE_ACCOUNT_JSON",
];

function defaultTag() {
  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
  return `v${pkg.version}`;
}

function printHelp() {
  console.log(`Usage: pnpm desktop:release-status [--repo=${DEFAULT_REPO}] [--tag=vX.Y.Z] [--pr=NUMBER]

Checks the public macOS release completion state in one fail-closed pass:
pull-request merge readiness, Apple signing/notary secret names, Firebase Hosting
deploy secret names, public GitHub Release state, downloadable DMG/checksum
assets, and the deployed Hosted website download surface.

This command is an operator/completion audit. It does not publish tags, set
secrets, or edit releases.
`);
}

function parseArgs(argv) {
  const options = {
    repo: DEFAULT_REPO,
    tag: defaultTag(),
    pr: "",
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
  return options;
}

function ghBin() {
  return process.env.OMOT_GH_BIN || "gh";
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

function ok(label, detail) {
  return { status: "ok", label, detail };
}

function blocked(label, detail, next) {
  return { status: "blocked", label, detail, next };
}

function skipped(label, detail) {
  return { status: "skipped", label, detail };
}

function prChecksPassed(pr) {
  const checks = Array.isArray(pr.statusCheckRollup) ? pr.statusCheckRollup : [];
  if (checks.length === 0) return false;
  return checks.every((check) => check.status === "COMPLETED" && check.conclusion === "SUCCESS");
}

function prCheckSummary(pr) {
  const checks = Array.isArray(pr.statusCheckRollup) ? pr.statusCheckRollup : [];
  const passed = checks.filter((check) => check.status === "COMPLETED" && check.conclusion === "SUCCESS").length;
  return `${passed}/${checks.length} checks successful`;
}

function prMerged(pr) {
  return pr.state === "MERGED" || Boolean(pr.mergedAt);
}

function secretSetHints(repo, names) {
  return names.map((name) => `gh secret set ${name} --repo ${repo} < /path/to/${name}`).join("; ");
}

function isNotFound(message) {
  return /\b404\b|not found|release not found/i.test(message);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const checks = [];

  const auth = runGh(["auth", "status"]);
  if (!auth.ok) {
    checks.push(blocked("GitHub CLI auth", auth.message, "Run gh auth login, then rerun desktop:release-status."));
    renderAndExit(options, checks);
  }
  checks.push(ok("GitHub CLI auth", "gh auth status succeeded"));

  if (options.pr) {
    const pr = runGh([
      "pr",
      "view",
      options.pr,
      "--repo",
      options.repo,
      "--json",
      "mergeStateStatus,mergedAt,reviewDecision,state,statusCheckRollup,url",
    ], { parseJson: true });
    if (!pr.ok) {
      checks.push(blocked("Pull request", pr.message, `Open https://github.com/${options.repo}/pull/${options.pr} and verify it manually.`));
    } else {
      const value = pr.value;
      const checksOk = prChecksPassed(value);
      const reviewOk = value.reviewDecision === "APPROVED";
      const mergeOk = value.mergeStateStatus === "CLEAN";
      if (prMerged(value)) {
        checks.push(ok("Pull request", `PR #${options.pr} is already merged`));
      } else if (checksOk && reviewOk && mergeOk) {
        checks.push(ok("Pull request", `PR #${options.pr} is merge-ready (${prCheckSummary(value)})`));
      } else {
        checks.push(blocked(
          "Pull request",
          `PR #${options.pr} is not merge-ready: review=${value.reviewDecision ?? "unknown"}, merge=${value.mergeStateStatus ?? "unknown"}, ${prCheckSummary(value)}`,
          value.url ?? `https://github.com/${options.repo}/pull/${options.pr}`,
        ));
      }
    }
  } else {
    checks.push(skipped("Pull request", "pass --pr=NUMBER to include review and merge readiness"));
  }

  const secrets = runGh([
    "secret",
    "list",
    "--repo",
    options.repo,
    "--json",
    "name",
  ], { parseJson: true });
  if (!secrets.ok) {
    checks.push(blocked("Apple release secrets", secrets.message, `Run gh secret list --repo ${options.repo}.`));
    checks.push(blocked("Firebase Hosting deploy secrets", secrets.message, `Run gh secret list --repo ${options.repo}.`));
  } else if (!Array.isArray(secrets.value)) {
    checks.push(blocked("Apple release secrets", "gh secret list did not return an array.", `Run gh secret list --repo ${options.repo}.`));
    checks.push(blocked("Firebase Hosting deploy secrets", "gh secret list did not return an array.", `Run gh secret list --repo ${options.repo}.`));
  } else {
    const secretNames = new Set(secrets.value.map((secret) => secret?.name).filter(Boolean));
    const missing = REQUIRED_SECRETS.filter((name) => !secretNames.has(name));
    if (missing.length === 0) {
      checks.push(ok("Apple release secrets", "all required Apple signing/notary secret names exist"));
    } else {
      checks.push(blocked(
        "Apple release secrets",
        `missing ${missing.join(", ")}`,
        secretSetHints(options.repo, missing),
      ));
    }
    const missingHosting = REQUIRED_HOSTING_SECRETS.filter((name) => !secretNames.has(name));
    if (missingHosting.length === 0) {
      checks.push(ok("Firebase Hosting deploy secrets", "Firebase service account secret exists for hosted download deployment"));
    } else {
      checks.push(blocked(
        "Firebase Hosting deploy secrets",
        `missing ${missingHosting.join(", ")}`,
        secretSetHints(options.repo, missingHosting),
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
      ? `Merge the desktop PR, add Apple/Firebase release secrets, then push ${options.tag} so .github/workflows/release-macos.yml can publish signed DMGs and deploy the hosted download page in the same run.`
      : `Run gh release view ${options.tag} --repo ${options.repo}.`;
    checks.push(blocked("GitHub Release", release.message, next));
  } else if (release.value?.isDraft || release.value?.isPrerelease) {
    checks.push(blocked(
      "GitHub Release",
      `${options.tag} is ${release.value.isDraft ? "draft" : "prerelease"}`,
      "Publish a stable, non-draft release only after signed/notarized DMGs and checksums pass.",
    ));
  } else {
    checks.push(ok("GitHub Release", `${options.tag} is public and stable${release.value?.url ? ` (${release.value.url})` : ""}`));
    if (process.env.OMOT_RELEASE_STATUS_SKIP_DOWNLOAD_VERIFY === "1") {
      checks.push(skipped("Download assets", "skipped by OMOT_RELEASE_STATUS_SKIP_DOWNLOAD_VERIFY=1"));
    } else {
      const download = runNode([
        "scripts/check-macos-download-release.mjs",
        `--repo=${options.repo}`,
        `--tag=${options.tag}`,
      ]);
      if (download.ok) {
        checks.push(ok("Download assets", "public DMGs and .sha256 assets passed byte verification"));
      } else {
        checks.push(blocked("Download assets", download.message, `Run pnpm desktop:verify-download -- --repo=${options.repo} --tag=${options.tag}.`));
      }
    }
  }

  if (process.env.OMOT_RELEASE_STATUS_SKIP_HOSTED_VERIFY === "1") {
    checks.push(skipped("Hosted website", "skipped by OMOT_RELEASE_STATUS_SKIP_HOSTED_VERIFY=1"));
  } else {
    const hosted = runNode(["scripts/check-hosted-download-surface.mjs"]);
    if (hosted.ok) {
      checks.push(ok("Hosted website", "deployed landing and download pages are promo/download aligned"));
    } else {
      checks.push(blocked(
        "Hosted website",
        hosted.message,
        `Let .github/workflows/release-macos.yml deploy Hosting after ${options.tag} publishes, or run the deploy-hosting fallback manually, then rerun pnpm desktop:verify-hosted.`,
      ));
    }
  }

  renderAndExit(options, checks);
}

function renderAndExit(options, checks) {
  console.log(`[desktop-release-status] ${options.repo} ${options.tag}`);
  for (const check of checks) {
    const marker = check.status === "ok" ? "✓" : check.status === "skipped" ? "·" : "✗";
    console.log(`${marker} ${check.label}: ${check.detail}`);
    if (check.next) {
      console.log(`  next: ${check.next}`);
    }
  }
  const blockers = checks.filter((check) => check.status === "blocked");
  if (blockers.length > 0) {
    console.error(`[desktop-release-status] blocked: ${blockers.length} release requirement(s) are not satisfied`);
    process.exit(1);
  }
  console.log("[desktop-release-status] ready: public macOS release requirements are satisfied");
}

await main();
