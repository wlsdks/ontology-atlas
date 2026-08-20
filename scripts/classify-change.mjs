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
 * **「변경 없음」과 「비교할 것이 없음」은 다르다** (2026-08-08 실측).
 *
 * 이 파일 아래쪽 주석은 의도를 정확히 적어 뒀다 — *"No comparable base
 * (shallow checkout, fresh clone, **push to main**) means we cannot tell what
 * changed — run everything. **Failing open would silently disable CI**, which
 * is the one outcome worse than a slow pipeline."*
 *
 * 그런데 코드는 그 반대를 했다. `resolveBase` 는 `merge-base HEAD origin/main`
 * 을 돌려주고, **main 으로 푸시하면 HEAD 가 곧 origin/main** 이라 그 merge-base
 * 는 HEAD 자신이다. `HEAD...HEAD` 의 diff 는 비고, 빈 목록이
 * `{runtime:false, browser:false}` 로 떨어져 **전부 생략**됐다.
 *
 * 결과: 전체 Playwright 가 **main 에서 한 번도 돈 적이 없다.** 확인한 main 런
 * 넷이 모두 `[classify] runtime=false browser=false — no files changed` 였고,
 * 잡은 47초에 초록으로 끝났다(체크아웃하고 정리만 했다). 그 초록이 실제
 * 파손을 태우고 갔다 — #987 이 문서함 헤더 컨트롤을 옮기며 e2e 스펙 둘을
 * 깼는데, PR 에서는 빨갰지만 main 에서는 생략돼 초록이었다.
 *
 * **생략과 통과는 화면에서 똑같이 생긴다.** 그래서 여기서 갈라 준다: base 가
 * HEAD 자신이면 그것은 「아무것도 안 바뀌었다」가 아니라 「무엇이 바뀌었는지
 * 알 수 없다」이고, 답은 전부 돌리는 것이다.
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

  // 판정은 `decide` 가 한다 — 순수 함수라 git fixture 없이 시험된다. 무엇을
  // 「비교할 수 없음」으로 볼지가 이 게이트의 급소이고, 그 판정이 여기 인라인으로
  // 있던 동안 main 에서 전체 Playwright 가 통째로 생략됐다(`decide` 주석).
  const files = base ? git(["diff", "--name-only", `${base}...HEAD`]).split("\n").filter(Boolean) : [];
  emit(decide({ base, head, files }));
}
