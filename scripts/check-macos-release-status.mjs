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
const CHECK_SCOPES = new Map([
  ["github_cli_auth", "local"],
  ["version_alignment", "local"],
  ["pull_request", "external"],
  ["apple_release_secrets", "external"],
  ["github_release", "external"],
  ["download_assets", "external"],
]);
function defaultTag() {
  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
  return `v${pkg.version}`;
}

function printHelp() {
  console.log(`Usage: pnpm desktop:release-status [--repo=${DEFAULT_REPO}] [--tag=vX.Y.Z] [--pr=NUMBER] [--json] [--json-file=PATH] [--markdown-file=PATH]

Checks the public macOS release completion state in one fail-closed pass:
release tag version alignment, pull-request merge readiness, Apple
signing/notary secret names, public GitHub Release state, and downloadable
DMG/checksum assets.

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

function withScope(check) {
  return { scope: CHECK_SCOPES.get(check.id) ?? "local", ...check };
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
    .map(prCheckLabel)
    .filter(Boolean);
  const failingSummary = failing.length > 0
    ? `; blocked checks: ${failing.join(", ")}`
    : "";
  return `${passed}/${checks.length} checks successful${failingSummary}`;
}

function prNextAction({ checksOk, prNumber, repo, url }) {
  const reviewAndMerge =
    `Resolve PR review/merge blockers: ${url ?? `https://github.com/${repo}/pull/${prNumber}`}`;
  if (checksOk) return reviewAndMerge;
  return `Run gh pr checks ${prNumber} --repo ${repo}, then ${reviewAndMerge}`;
}

function prNextCommands({ checksOk, prNumber, repo }) {
  return checksOk ? [] : [`gh pr checks ${prNumber} --repo ${repo}`];
}

function prCheckLabel(check) {
  const name = check.name ?? check.context ?? check.workflowName ?? check.__typename ?? "unnamed check";
  const state = check.conclusion || check.status || "unknown";
  const detail = typeof check.detailsUrl === "string" && check.detailsUrl
    ? ` (${check.detailsUrl})`
    : "";
  return `${name}=${state}${detail}`;
}

function prMerged(pr) {
  return pr.state === "MERGED" || Boolean(pr.mergedAt);
}

function secretSetHints(repo, names) {
  return names.map((name) => `gh secret set ${name} --repo ${repo} < /path/to/${name}`).join("; ");
}

function secretSetCommands(repo, names) {
  return names.map((name) => `gh secret set ${name} --repo ${repo} < /path/to/${name}`);
}

function isNotFound(message) {
  return /\b404\b|not found|release not found/i.test(message);
}

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
      "mergeStateStatus,mergedAt,reviewDecision,state,statusCheckRollup,url",
    ], { parseJson: true });
    if (!pr.ok) {
      checks.push(blocked("pull_request", "Pull request", pr.message, `Open https://github.com/${options.repo}/pull/${options.pr} and verify it manually.`));
    } else {
      const value = pr.value;
      const checksOk = prChecksPassed(value);
      const reviewOk = value.reviewDecision === "APPROVED";
      const mergeOk = value.mergeStateStatus === "CLEAN";
      if (prMerged(value)) {
        checks.push(ok("pull_request", "Pull request", `PR #${options.pr} is already merged`));
      } else if (checksOk && reviewOk && mergeOk) {
        checks.push(ok("pull_request", "Pull request", `PR #${options.pr} is merge-ready (${prCheckSummary(value)})`));
      } else {
        checks.push(blocked(
          "pull_request",
          "Pull request",
          `PR #${options.pr} is not merge-ready: review=${value.reviewDecision ?? "unknown"}, merge=${value.mergeStateStatus ?? "unknown"}, ${prCheckSummary(value)}`,
          prNextAction({
            checksOk,
            prNumber: options.pr,
            repo: options.repo,
            url: value.url,
          }),
          prNextCommands({
            checksOk,
            prNumber: options.pr,
            repo: options.repo,
          }),
        ));
      }
    }
  } else {
    checks.push(skipped("pull_request", "Pull request", "pass --pr=NUMBER to include review and merge readiness"));
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
    checks.push(blocked("apple_release_secrets", "Apple release secrets", secrets.message, `Run gh secret list --repo ${options.repo}.`, [`gh secret list --repo ${options.repo}`]));
  } else if (!Array.isArray(secrets.value)) {
    checks.push(blocked("apple_release_secrets", "Apple release secrets", "gh secret list did not return an array.", `Run gh secret list --repo ${options.repo}.`, [`gh secret list --repo ${options.repo}`]));
  } else {
    const secretNames = new Set(secrets.value.map((secret) => secret?.name).filter(Boolean));
    const missing = REQUIRED_SECRETS.filter((name) => !secretNames.has(name));
    if (missing.length === 0) {
      checks.push(ok("apple_release_secrets", "Apple release secrets", "all required Apple signing/notary secret names exist"));
    } else {
      checks.push(blocked(
        "apple_release_secrets",
        "Apple release secrets",
        `missing ${missing.join(", ")}`,
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
      ? `Merge the desktop PR, add Apple release secrets, then push ${options.tag} so .github/workflows/release-macos.yml can publish signed DMGs.`
      : `Run gh release view ${options.tag} --repo ${options.repo}.`;
    const commands = isNotFound(release.message)
      ? []
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
    if (process.env.OMOT_RELEASE_STATUS_SKIP_DOWNLOAD_VERIFY === "1") {
      checks.push(skipped("download_assets", "Download assets", "skipped by OMOT_RELEASE_STATUS_SKIP_DOWNLOAD_VERIFY=1"));
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

  renderAndExit(options, checks);
}

function renderAndExit(options, checks) {
  const blockers = checks.filter((check) => check.status === "blocked");
  const generatedAt = new Date().toISOString();
  const ready = blockers.length === 0;
  const payload = {
    schemaVersion: 1,
    generatedAt,
    repo: options.repo,
    tag: options.tag,
    pr: options.pr || null,
    ready,
    status: ready ? "ready" : "blocked",
    readyAt: ready ? generatedAt : null,
    blockedAt: ready ? null : generatedAt,
    blockerCount: blockers.length,
    blockerIds: blockers.map((check) => check.id),
    localBlockerIds: blockers.filter((check) => check.scope === "local").map((check) => check.id),
    externalBlockerIds: blockers.filter((check) => check.scope === "external").map((check) => check.id),
    missingSecrets: checks.find((check) => check.id === "apple_release_secrets")?.missingSecrets ?? [],
    nextActions: blockers
      .filter((check) => check.next)
      .map((check) => ({
        id: check.id,
        label: check.label,
        scope: check.scope,
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
    console.log(JSON.stringify(payload, null, 2));
    if (blockers.length > 0) {
      console.error(`[desktop-release-status] blocked: ${blockers.length} release requirement(s) are not satisfied`);
      process.exit(1);
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
  }
  if (blockers.length > 0) {
    console.error(`[desktop-release-status] blocked: ${blockers.length} release requirement(s) are not satisfied`);
    process.exit(1);
  }
  console.log("[desktop-release-status] ready: public macOS release requirements are satisfied");
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
      lines.push(`  - Detail: ${check.detail}`);
      if (check.next) {
        lines.push(`  - Next: \`${check.next}\``);
      }
      if (Array.isArray(check.commands) && check.commands.length > 0) {
        lines.push("  - Commands:");
        for (const command of check.commands) {
          lines.push(`    - \`${command}\``);
        }
      }
      if (Array.isArray(check.missingSecrets) && check.missingSecrets.length > 0) {
        lines.push("  - Missing secrets:");
        for (const secret of check.missingSecrets) {
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
