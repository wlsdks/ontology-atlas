#!/usr/bin/env node
/**
 * Classify a change so CI runs what the change can actually break.
 *
 * Measured 2026-07-27: a Checks run is ~5–6 min and **270s of it is the unit
 * suite**; the Playwright job is another ~5 min. This session's changes were
 * almost entirely agent briefs and prose, and they booted a browser every time.
 *
 * Two booleans, deliberately few:
 *
 *   runtime — code that ships, or that something shipped imports. Full unit suite.
 *   browser — anything a rendered page depends on. Playwright.
 *
 * Everything else — agent briefs, skills, docs, workflows, contract tests —
 * still runs the **fast** gates (contract suite, tsc, lint, package and i18n
 * contracts, vault checks). Those take seconds and they are exactly the gates
 * that catch governance drift, so they are never skipped.
 *
 * Bias: when it cannot tell, it says runtime. A missed test is a bug that
 * ships; a redundant test is four minutes.
 */

import { execFileSync } from "node:child_process";

/** Paths whose change can alter shipped behaviour. */
const RUNTIME = [
  /^src\//,
  /^app\//,
  /^mcp\/(?!README)/,
  /^cli\/(?!README)/,
  /^messages\//,
  /^public\//,
  /^src-tauri\//,
  /^scripts\//,
  /^tests\/(?!contract\/)/,
  /^(package\.json|pnpm-lock\.yaml|next\.config\.ts|tsconfig\.json|vitest\.config\.ts|vitest\.setup\.ts|eslint\.config\.mjs|postcss\.config\.mjs|playwright\.config\.ts)$/,
];

/** The subset a rendered page actually depends on. */
const BROWSER = [
  /^src\//,
  /^app\//,
  /^messages\//,
  /^public\//,
  /^tests\/e2e\//,
  /^(package\.json|pnpm-lock\.yaml|next\.config\.ts|postcss\.config\.mjs|playwright\.config\.ts)$/,
];

/**
 * Generated bundles of `docs/**` prose. They change on every doc edit, so
 * counting them as runtime would classify nearly every change as runtime and
 * defeat the point. What actually validates them — `docs-vault:check`,
 * `package:check`, `desktop:check` — runs unconditionally.
 */
const GENERATED = [/^public\/docs-vault\//, /^src\/entities\/docs-vault\/data\//];

/** Pure, so the decision is testable without a git fixture. */
export function classify(files) {
  const meaningful = files.filter((file) => !GENERATED.some((pattern) => pattern.test(file)));
  const hit = (patterns) => meaningful.filter((file) => patterns.some((pattern) => pattern.test(file)));
  const runtimeHits = hit(RUNTIME);
  const browserHits = hit(BROWSER);
  return {
    runtime: runtimeHits.length > 0,
    browser: browserHits.length > 0,
    reason:
      runtimeHits.length > 0
        ? `runtime paths changed (${runtimeHits.length}): ${runtimeHits.slice(0, 3).join(", ")}`
        : `no runtime path in ${meaningful.length} meaningful file(s) — fast gates only`,
  };
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function resolveBase(explicit) {
  for (const ref of [explicit, "origin/main", "main"].filter(Boolean)) {
    try {
      return git(["merge-base", "HEAD", ref]);
    } catch {
      // try the next candidate
    }
  }
  return null;
}

function emit({ runtime, browser, reason }) {
  console.log(`[classify] runtime=${runtime} browser=${browser} — ${reason}`);
  const out = process.env.GITHUB_OUTPUT;
  if (out) {
    execFileSync("bash", [
      "-c",
      `printf '%s\\n' "runtime=${runtime}" "browser=${browser}" >> "${out}"`,
    ]);
  }
  process.exit(0);
}

// Executed directly (not imported by the test) → do the git work.
if (process.argv[1] && process.argv[1].endsWith("classify-change.mjs")) {
  const baseArg = process.argv.find((a) => a.startsWith("--base="))?.slice("--base=".length);
  const base = resolveBase(baseArg?.trim());

  // No comparable base (shallow checkout, fresh clone, push to main) means we
  // cannot tell what changed — run everything. Failing open would silently
  // disable CI, which is the one outcome worse than a slow pipeline.
  if (!base) {
    emit({ runtime: true, browser: true, reason: "no comparable base ref — running everything" });
  }

  const files = git(["diff", "--name-only", `${base}...HEAD`]).split("\n").filter(Boolean);
  emit(files.length === 0 ? { runtime: false, browser: false, reason: "no files changed" } : classify(files));
}
