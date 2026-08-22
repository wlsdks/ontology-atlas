import assert from "node:assert/strict";
import test from "node:test";
import { classify, decide } from "./classify-change.mjs";

test("runs everything when shipped code changes", () => {
  assert.deepEqual(
    { runtime: true, browser: true },
    pick(classify(["src/views/download/ui/DownloadPage.tsx"])),
  );
  assert.deepEqual({ runtime: true, browser: true }, pick(classify(["messages/ko.json"])));
  assert.deepEqual({ runtime: true, browser: true }, pick(classify(["package.json"])));
});

test("runs the unit suite but not a browser for non-rendering runtime code", () => {
  // MCP and CLI ship, but no rendered page depends on them.
  assert.deepEqual({ runtime: true, browser: false }, pick(classify(["mcp/src/index.js"])));
  assert.deepEqual({ runtime: true, browser: false }, pick(classify(["cli/src/lib/x.mjs"])));
  assert.deepEqual({ runtime: true, browser: false }, pick(classify(["src-tauri/src/lib.rs"])));
});

test("skips both for governance and prose — the case that motivated this", () => {
  // A session spent editing agent briefs booted a browser every time.
  assert.deepEqual(
    { runtime: false, browser: false },
    pick(classify([".claude/agents/po-wedge.md", ".claude/skills/po-pass/SKILL.md"])),
  );
  assert.deepEqual({ runtime: false, browser: false }, pick(classify(["docs/DECISIONS.md"])));
  assert.deepEqual({ runtime: false, browser: false }, pick(classify(["AGENTS.md"])));
  // Contract tests read .claude/** — they still run, they are just not the
  // 270-second suite.
  assert.deepEqual(
    { runtime: false, browser: false },
    pick(classify(["tests/contract/po-council.contract.test.ts"])),
  );
});

test("ignores generated doc bundles, or every prose edit looks like runtime", () => {
  assert.deepEqual(
    { runtime: false, browser: false },
    pick(classify(["docs/FEATURES.md", "public/docs-vault/FEATURES.md", "src/entities/docs-vault/data/content.json"])),
  );
});

test("a real runtime change still wins even when bundled with prose", () => {
  assert.deepEqual(
    { runtime: true, browser: true },
    pick(classify(["docs/FEATURES.md", "public/docs-vault/FEATURES.md", "src/app/providers.tsx"])),
  );
});

/*
 * ⚠️ This test used to be named "fails open — an empty or unknown diff never silently
 * disables CI", while its assertion pinned **exactly the opposite**: empty diff → skip
 * everything. The assertion denied the property the name claimed.
 *
 * `classify` is the path-matching layer, so returning "nothing matched" for an empty
 * list is correct. The verdict "if it cannot be compared, run everything" belongs to
 * `decide`, and while that verdict was missing, the full Playwright suite was skipped
 * wholesale on main. So the name now states the fact, and the property is guarded by
 * the `decide` tests below.
 */
test("classify — 경로가 하나도 안 맞으면 빠른 게이트만 (판정층이 아니다)", () => {
  assert.deepEqual({ runtime: false, browser: false }, pick(classify([])));
  // Anything unrecognised outside the runtime list is prose-shaped by
  // definition; the fast gates still run and catch governance drift.
  assert.deepEqual({ runtime: false, browser: false }, pick(classify(["README.md"])));
});

/*
 * **This is where that accident is blocked.**
 *
 * Measured 2026-08-08: four main runs all reported `no files changed`, skipped the
 * full Playwright suite, and finished green in 47 seconds — because on a push to main
 * `merge-base HEAD origin/main` is HEAD itself, so the `HEAD...HEAD` diff is empty.
 * That green carried real breakage past (the two e2e specs #987 broke).
 */
test("decide — base 가 HEAD 자신이면 전부 돌린다 (main 푸시)", () => {
  const sha = "b85e4eaa9c0ffee0000000000000000000000000";
  assert.deepEqual(
    { runtime: true, browser: true },
    pick(decide({ base: sha, head: sha, files: [] })),
  );
});

test("decide — 비교할 base 가 없으면 전부 돌린다", () => {
  assert.deepEqual(
    { runtime: true, browser: true },
    pick(decide({ base: null, head: "abc", files: [] })),
  );
});

/*
 * Idling guard — when the two above say "run everything", confirm `decide` is not
 * simply running everything for **any** input. With a base different from HEAD and no
 * matching paths it must still be the fast gate only. Without this assertion the two
 * greens above are indistinguishable from "switched everything on and forgot".
 */
test("decide — 계기가 살아 있다: 진짜 산문 변경은 여전히 빠른 게이트만", () => {
  assert.deepEqual(
    { runtime: false, browser: false },
    pick(decide({ base: "aaa", head: "bbb", files: ["README.md"] })),
  );
  assert.deepEqual(
    { runtime: false, browser: false },
    pick(decide({ base: "aaa", head: "bbb", files: [] })),
  );
  // And browser paths are still caught correctly with a different base.
  assert.deepEqual(
    { runtime: true, browser: true },
    pick(decide({ base: "aaa", head: "bbb", files: ["src/app/providers.tsx"] })),
  );
});

/*
 * e2e — a PR editing a spec or the Playwright config sees the full suite **in that
 * PR**. This output closes the hole where someone edits a spec deferred to the
 * post-merge sweep and never sees their own red.
 */
test("classify — e2e 인프라 변경은 e2e=true, 그 밖은 false", () => {
  assert.equal(classify(["tests/e2e/nav-yield-map-frames.spec.ts"]).e2e, true);
  assert.equal(classify(["playwright.config.ts"]).e2e, true);
  // Render code is browser=true but is not e2e infrastructure — the PR gate (smoke) suffices.
  assert.equal(classify(["src/app/providers.tsx"]).e2e, false);
  assert.equal(classify(["tests/contract/po-council.contract.test.ts"]).e2e, false);
});

test("decide — 비교 불가면 e2e 도 전부 돌린다 (생략과 통과를 섞지 않는다)", () => {
  const sha = "b85e4eaa9c0ffee0000000000000000000000000";
  assert.equal(decide({ base: sha, head: sha, files: [] }).e2e, true);
  assert.equal(decide({ base: null, head: "abc", files: [] }).e2e, true);
  assert.equal(decide({ base: "aaa", head: "bbb", files: ["README.md"] }).e2e, false);
});

function pick({ runtime, browser }) {
  return { runtime, browser };
}
