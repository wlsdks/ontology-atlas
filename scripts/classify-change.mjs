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

/**
 * E2E infrastructure itself. A PR that edits a spec or the Playwright config
 * must see that spec red **in the PR**, not after merge — so when these paths
 * change, CI runs the full suite (both projects) instead of the PR gate only.
 * The smoke/post-merge boundary lives in `tests/e2e/post-merge-specs.ts`.
 */
const E2E_INFRA = [/^tests\/e2e\//, /^playwright\.config\.ts$/];

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
  const e2eHits = hit(E2E_INFRA);
  return {
    runtime: runtimeHits.length > 0,
    browser: browserHits.length > 0,
    e2e: e2eHits.length > 0,
    reason:
      runtimeHits.length > 0
        ? `runtime paths changed (${runtimeHits.length}): ${runtimeHits.slice(0, 3).join(", ")}`
        : `no runtime path in ${meaningful.length} meaningful file(s) — fast gates only`,
  };
}

/**
 * **"Nothing changed" and "there is nothing to compare against" are different**
 * (measured 2026-08-08).
 *
 * A comment further down this file recorded the intent exactly — *"No comparable base
 * (shallow checkout, fresh clone, **push to main**) means we cannot tell what
 * changed — run everything. **Failing open would silently disable CI**, which
 * is the one outcome worse than a slow pipeline."*
 *
 * But the code did the opposite. `resolveBase` returns `merge-base HEAD origin/main`,
 * and **on a push to main, HEAD is origin/main**, so that merge-base is HEAD itself.
 * The `HEAD...HEAD` diff is empty, the empty list resolves to
 * `{runtime:false, browser:false}`, and **everything was skipped.**
 *
 * The result: the full Playwright suite **had never once run on main.** All four main
 * runs inspected reported
 * `[classify] runtime=false browser=false — no files changed` and finished green in 47
 * seconds (checkout and cleanup only). That green carried real breakage past — #987
 * moved the docs header controls and broke two e2e specs; they were red in the PR and
 * green on main because they were skipped.
 *
 * **Skipped and passed look identical on screen.** So the two are separated here: if
 * the base is HEAD itself, that is not "nothing changed" but "there is no way to know
 * what changed", and the answer is to run everything.
 */
export function decide({ base, head, files }) {
  if (!base) {
    return {
      runtime: true,
      browser: true,
      e2e: true,
      reason: "no comparable base ref — running everything",
    };
  }
  if (head && base === head) {
    return {
      runtime: true,
      browser: true,
      e2e: true,
      reason: "base resolves to HEAD itself (push to the default branch) — running everything",
    };
  }
  if (files.length === 0) {
    return { runtime: false, browser: false, e2e: false, reason: "no files changed" };
  }
  return classify(files);
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

function emit({ runtime, browser, e2e, reason }) {
  console.log(`[classify] runtime=${runtime} browser=${browser} e2e=${e2e} — ${reason}`);
  const out = process.env.GITHUB_OUTPUT;
  if (out) {
    execFileSync("bash", [
      "-c",
      `printf '%s\\n' "runtime=${runtime}" "browser=${browser}" "e2e=${e2e}" >> "${out}"`,
    ]);
  }
  process.exit(0);
}

// Executed directly (not imported by the test) → do the git work.
if (process.argv[1] && process.argv[1].endsWith("classify-change.mjs")) {
  const baseArg = process.argv.find((a) => a.startsWith("--base="))?.slice("--base=".length);
  const base = resolveBase(baseArg?.trim());
  const head = (() => {
    try {
      return git(["rev-parse", "HEAD"]);
    } catch {
      return null;
    }
  })();

  // `decide` makes the verdict — a pure function, so it is testable without a git
  // fixture. What counts as "not comparable" is this gate's weak point, and while that
  // verdict lived inline here, the full Playwright suite was skipped wholesale on main
  // (see `decide`'s comment).
  const files = base ? git(["diff", "--name-only", `${base}...HEAD`]).split("\n").filter(Boolean) : [];
  emit(decide({ base, head, files }));
}
