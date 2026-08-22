import { accessSync, constants, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The gate that keeps the commit hook **present and wired.**
 *
 * `.githooks/pre-commit` blocks vault-artifact drift at commit time (2026-08-02 — the
 * same failure happened three times in two days as #826, #828, and #831). This hook
 * has two **quiet disappearance paths** that other gates do not:
 *
 * 1. If the directory `core.hooksPath` points at **does not exist, git says nothing.**
 *    It is not that the hook is missing — the fact that a hook ever existed vanishes
 *    from view. Measured: before this branch, `.githooks/` was missing in every
 *    worktree and git passed commits without a single warning.
 * 2. Without the executable bit git **skips** the hook. The file is still visible while
 *    only the gate is gone — the least visible form of regression in review.
 *
 * So what is measured here is not the hook's *verdict* but its *existence*. The hook
 * proves its verdict on every commit; this test proves the hook is wired to actually
 * be called on every commit. One step before "a gate that only ever passes is not a
 * gate" — this blocks **a gate that is never even called.**
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
    // A hook that silently changes the stage commits bytes nobody wrote under a person's
    // name. So `git add` inside the hook is forbidden.
    expect(source).not.toMatch(/^\s*git add/m);
  });

  /**
   * The hook's first version ran `--check` against the **working tree**, and so passed
   * the very PR containing it (#834): a commit that had regenerated the artifacts
   * without staging them. The working tree was clean, so the hook saw green; CI looks at
   * the committed tree and went red. What a commit leaves behind is the index, so the
   * index is what must be measured.
   */
  it("작업본이 아니라 인덱스를 잰다", () => {
    const source = readFileSync(HOOK, "utf-8");
    expect(source).toContain("git checkout-index");
    // The checker only means something when run where the index was expanded — running
    // it at the repository root measures the working tree again.
    expect(source).toMatch(/cd "\$staging_tree"[\s\S]*build-docs-vault\.mjs --check/);
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
