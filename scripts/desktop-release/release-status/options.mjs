/** The command line of `pnpm desktop:release-status`: its flags, defaults and the help it prints. */

import fs from "node:fs";
import path from "node:path";

const DEFAULT_REPO = "wlsdks/ontology-atlas";

function defaultTag() {
  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
  return `v${pkg.version}`;
}

function printHelp() {
  console.log(`Usage: pnpm desktop:release-status [--repo=${DEFAULT_REPO}] [--tag=vX.Y.Z] --pr=NUMBER [--json] [--json-file=PATH] [--markdown-file=PATH]

Checks the public macOS release completion state in one fail-closed pass:
release tag version alignment, pull-request merge readiness, active macOS
release workflow availability, the main-only release-signing environment,
Developer ID direct-download and updater signing secret names, public GitHub
Release state, and downloadable DMG/checksum assets.

This command is an operator/completion audit. It does not publish tags, set
secrets, or edit releases.

Pass --pr=NUMBER for PR review and merge evidence. Missing PR evidence is a
release blocker; use pnpm desktop:goal-audit -- --pr=NUMBER --tag=vX.Y.Z for
the full completion gate that also proves local preflight.

Use --json when a goal runner, CI wrapper, or release dashboard needs a
machine-readable blocker list. Human-readable output remains the default.
Use --json-file=PATH to write that same payload to disk even when a package
runner adds lifecycle text around stdout.
Use --markdown-file=PATH to write a human-readable release checklist for PR
reviewers and release operators.

When run through pnpm desktop:goal-audit, the payload also records that
pnpm desktop:release-preflight already passed locally, including LaunchServices
app content proof and DMG install smoke. Standalone desktop:release-status runs
show that local proof as skipped instead of pretending it was checked.

The hosted promo/download website is intentionally excluded from this macOS app
release audit. GitHub Pages (deploy-pages.yml) publishes that surface separately;
use pnpm desktop:verify-hosted to check the deployed website.
`);
}

export function parseArgs(argv) {
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

function fail(message) {
  console.error(`[desktop-release-status] ${message}`);
  process.exit(1);
}
