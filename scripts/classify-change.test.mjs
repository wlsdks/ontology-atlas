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
 * ⚠️ 이 시험의 예전 이름은 「fails open — an empty or unknown diff never
 * silently disables CI」였는데, 단언은 **정확히 그 반대**를 못박고 있었다:
 * 빈 diff → 전부 생략. 이름이 주장하는 성질을 단언이 부정한 것이다.
 *
 * `classify` 는 경로를 맞춰 보는 층이라 빈 목록에 대해 «맞는 것 없음» 을
 * 돌려주는 것이 맞다. 「비교할 수 없으면 전부 돌린다」는 판정은 `decide` 의
 * 몫이고, 그 판정이 없던 동안 main 에서 전체 Playwright 가 통째로 생략됐다.
 * 그래서 이름을 사실대로 바꾸고, 성질은 아래 `decide` 시험이 지킨다.
 */
test("classify — 경로가 하나도 안 맞으면 빠른 게이트만 (판정층이 아니다)", () => {
  assert.deepEqual({ runtime: false, browser: false }, pick(classify([])));
  // Anything unrecognised outside the runtime list is prose-shaped by
  // definition; the fast gates still run and catch governance drift.
  assert.deepEqual({ runtime: false, browser: false }, pick(classify(["README.md"])));
});

/*
 * **여기가 그 사고를 막는 자리다.**
 *
 * 실측(2026-08-08): main 런 넷이 전부 `no files changed` 로 전체 Playwright 를
 * 생략했고 47초에 초록으로 끝났다. `merge-base HEAD origin/main` 이 main 푸시
 * 에서는 HEAD 자신이라 `HEAD...HEAD` diff 가 비었기 때문이다. 그 초록이 실제
 * 파손(#987 이 깬 e2e 스펙 둘)을 태우고 갔다.
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
 * 공회전 차단 — 위 둘이 「전부 돌린다」를 말할 때, `decide` 가 **무엇이든**
 * 전부 돌리는 상태가 아닌지 확인한다. base 가 HEAD 와 다르고 걸릴 경로가
 * 없으면 여전히 빠른 게이트만이어야 한다. 이 단언이 없으면 위의 두 초록은
 * 「고쳤다」가 아니라 「전부 켜 놓고 잊었다」와 구별되지 않는다.
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
  // 그리고 브라우저 경로는 base 가 달라도 제대로 잡힌다.
  assert.deepEqual(
    { runtime: true, browser: true },
    pick(decide({ base: "aaa", head: "bbb", files: ["src/app/providers.tsx"] })),
  );
});

/*
 * e2e — 스펙이나 Playwright 설정을 고친 PR 은 **그 PR 에서** 전체 스위트를
 * 본다. 머지 후 스위프로 미룬 스펙(post-merge 프로젝트)을 고치면서 자기
 * 빨강을 못 보는 구멍을 막는 출력이다.
 */
test("classify — e2e 인프라 변경은 e2e=true, 그 밖은 false", () => {
  assert.equal(classify(["tests/e2e/nav-yield-map-frames.spec.ts"]).e2e, true);
  assert.equal(classify(["playwright.config.ts"]).e2e, true);
  // 렌더 코드는 browser=true 지만 e2e 인프라는 아니다 — PR 게이트(smoke)로 충분.
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
