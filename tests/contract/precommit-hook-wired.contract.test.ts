import { accessSync, constants, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 커밋 훅이 **실재하고 연결돼 있는가**를 지키는 게이트.
 *
 * `.githooks/pre-commit` 은 볼트 생성물 드리프트를 커밋 자리에서 막는다
 * (2026-08-02 — 같은 실패가 #826 · #828 · #831 로 이틀에 세 번 났다).
 * 그런데 이 훅에는 다른 게이트에 없는 **조용한 소멸 경로**가 둘 있다:
 *
 * 1. `core.hooksPath` 가 가리키는 디렉터리가 **없으면 git 은 아무 말도 안 한다.**
 *    훅이 없는 게 아니라 훅이 있었다는 사실 자체가 화면에서 사라진다. 실측:
 *    이 브랜치를 만들기 전 모든 워크트리에서 `.githooks/` 가 없었고, git 은
 *    경고 한 줄 없이 커밋을 통과시켰다.
 * 2. 실행 비트가 빠지면 git 은 훅을 **건너뛴다.** 파일은 그대로 보이는데
 *    게이트만 없어진다 — 리뷰에서 가장 안 보이는 형태의 회귀다.
 *
 * 그래서 여기서 재는 것은 훅의 *판정*이 아니라 훅의 *존재*다. 판정은 훅
 * 자신이 매 커밋마다 증명하고, 이 테스트는 그 훅이 매 커밋에 실제로 불릴
 * 배선인지를 증명한다. 「통과만 하는 게이트는 게이트가 아니다」의 한 단계
 * 앞 — **불리지도 않는 게이트**를 막는다.
 */

const ROOT = join(__dirname, "..", "..");
const HOOK = join(ROOT, ".githooks", "pre-commit");

describe("pre-commit 훅 배선", () => {
  it("훅 파일이 있고 실행 가능하다", () => {
    expect(() => accessSync(HOOK, constants.X_OK)).not.toThrow();
  });

  it("package.json 의 prepare 가 core.hooksPath 를 .githooks 로 건다", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
    expect(pkg.scripts?.prepare).toBeTypeOf("string");
    expect(pkg.scripts.prepare).toContain("core.hooksPath");
    expect(pkg.scripts.prepare).toContain(".githooks");
  });

  it("훅이 재생성기를 --check 로 부른다 — 고치지 않고 막기만 한다", () => {
    const source = readFileSync(HOOK, "utf-8");
    expect(source).toContain("scripts/build-docs-vault.mjs --check");
    // 훅이 스테이지를 말없이 바꾸면 사람이 안 쓴 바이트가 사람 이름으로
    // 커밋된다. 그래서 훅 안에서의 `git add` 는 금지다.
    expect(source).not.toMatch(/^\s*git add/m);
  });

  it("볼트 입력과 산출물 양쪽을 사정거리에 둔다", () => {
    const source = readFileSync(HOOK, "utf-8");
    for (const path of [
      "docs/",
      "samples/storefront/",
      "src/entities/docs-vault/data/",
      "public/docs-vault/",
    ]) {
      expect(source).toContain(path);
    }
  });
});
