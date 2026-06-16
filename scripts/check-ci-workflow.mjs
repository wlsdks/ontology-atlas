#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const REQUIRED_CI_GATES = [
  "pnpm docs-vault:check",
  "pnpm desktop:check",
  "pnpm test:desktop:check",
  "pnpm exec tsc --noEmit",
  "pnpm lint",
  "pnpm test:run",
  "pnpm test:contracts",
  "pnpm design:ontology",
  "pnpm build",
  "pnpm bundle:check",
];

function fail(message) {
  console.error(`CI workflow check failed: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  let root = process.cwd();
  for (const arg of argv) {
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") {
      console.log("Usage: node scripts/check-ci-workflow.mjs [--root=<path>]");
      process.exit(0);
    }
    if (arg.startsWith("--root=")) {
      root = arg.slice("--root=".length);
      continue;
    }
    fail(`unknown argument: ${arg}`);
  }
  return { root: resolve(root) };
}

function readRequiredFile(path, label) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    fail(`${label} is missing or unreadable at ${path}: ${error.message}`);
  }
}

function requireText(text, needle, label) {
  if (!text.includes(needle)) {
    fail(`${label} must include ${needle}`);
  }
}

function requirePattern(text, pattern, label) {
  if (!pattern.test(text)) {
    fail(label);
  }
}

export function checkCiWorkflow(root = process.cwd()) {
  const projectRoot = resolve(root);
  const workflowPath = join(projectRoot, ".github/workflows/ci.yml");
  const packagePath = join(projectRoot, "package.json");
  const workflow = readRequiredFile(workflowPath, "main CI workflow");
  const packageJson = JSON.parse(readRequiredFile(packagePath, "package.json"));
  const ciScript = packageJson.scripts?.["ci:check"];

  if (!ciScript) {
    fail('package.json scripts must define "ci:check"');
  }

  requirePattern(
    workflow,
    /push:\s*\n(?:[ \t]+.*\n){0,6}[ \t]+branches:\s*\[[ \t]*main[ \t]*\]/m,
    "CI workflow must run on pushes to main",
  );
  requirePattern(
    workflow,
    /pull_request:\s*\n(?:[ \t]+.*\n){0,6}[ \t]+branches:\s*\[[ \t]*main[ \t]*\]/m,
    "CI workflow must run on pull requests targeting main",
  );
  requireText(workflow, "FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true", "CI workflow");
  requireText(workflow, "uses: actions/checkout@v6", "CI workflow");
  requireText(workflow, "uses: actions/setup-node@v6", "CI workflow");
  requirePattern(workflow, /node-version:\s*24\b/, "CI workflow must use Node.js 24");
  requireText(workflow, "corepack prepare pnpm@10.18.0 --activate", "CI workflow");
  requireText(workflow, "pnpm install --frozen-lockfile", "CI workflow");
  requireText(workflow, "pnpm ci:check", "CI workflow");

  for (const command of REQUIRED_CI_GATES) {
    requireText(ciScript, command, "ci:check script");
  }

  const buildIndex = ciScript.indexOf("pnpm build");
  const bundleIndex = ciScript.indexOf("pnpm bundle:check");
  if (bundleIndex < buildIndex) {
    fail("ci:check script must run pnpm bundle:check after pnpm build");
  }

  return {
    workflowPath,
    gates: REQUIRED_CI_GATES,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { root } = parseArgs(process.argv.slice(2));
  const result = checkCiWorkflow(root);
  console.log(`main/pull_request CI workflow ready: ${result.workflowPath}`);
  for (const gate of result.gates) {
    console.log(`✓ ${gate}`);
  }
}
