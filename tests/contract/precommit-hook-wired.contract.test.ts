import { execFileSync, spawnSync } from "node:child_process";
import { accessSync, chmodSync, constants, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
const REFRESH_HOOKS = ["post-checkout", "post-merge"] as const;

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

  it("훅이 staged snapshot 안에서 생성 가능성을 검증하고 stage 는 건드리지 않는다", () => {
    const source = readFileSync(HOOK, "utf-8");
    expect(source).toContain("node scripts/build-docs-vault.mjs");
    expect(source).not.toContain("build-docs-vault.mjs --check");
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
    expect(source).toMatch(/cd "\$staging_tree"[\s\S]*build-docs-vault\.mjs/);
    expect(source).toContain("GIT_WORK_TREE=$staging_tree");
  });

  it("작성 원본과 생성기 입력만 사정거리에 두고 생성 산출물은 요구하지 않는다", () => {
    const source = readFileSync(HOOK, "utf-8");
    for (const path of [
      "docs/",
      "samples/storefront/",
      "scripts/build-docs-vault",
      "record-ledgers",
      "po-pilot-records",
    ]) {
      expect(source).toContain(path);
    }
    expect(source).not.toContain("git add src/entities/docs-vault/data public/docs-vault");
  });

  it.each(REFRESH_HOOKS)("%s 는 생성물을 갱신하되 stage 하지 않는다", (name) => {
    const hook = join(ROOT, ".githooks", name);
    expect(() => accessSync(hook, constants.X_OK)).not.toThrow();
    const source = readFileSync(hook, "utf8");
    expect(source).toContain("node scripts/build-docs-vault.mjs");
    expect(source).not.toMatch(/^\s*git add/m);
    expect(source).toMatch(/materialization failed/);
  });

  it("staged 원본만 재료로 쓰고 그 생성 실패를 차단한다", () => {
    const repo = mkdtempSync(join(tmpdir(), "atlas-precommit-index-"));
    const bin = join(repo, "bin");
    try {
      execFileSync("git", ["init", "-q"], { cwd: repo });
      mkdirSync(join(repo, "docs"));
      mkdirSync(bin);
      writeFileSync(join(repo, "docs", "GUIDE.md"), "GOOD\n");
      execFileSync("git", ["add", "docs/GUIDE.md"], { cwd: repo });
      const fakeNode = join(bin, "node");
      writeFileSync(fakeNode, "#!/bin/sh\ngrep -q BROKEN docs/GUIDE.md && exit 9\nexit 0\n");
      chmodSync(fakeNode, 0o755);
      const run = () => spawnSync(HOOK, [], {
        cwd: repo,
        encoding: "utf8",
        env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` },
      });

      // Working copy is broken, index is good: the staged snapshot must pass.
      writeFileSync(join(repo, "docs", "GUIDE.md"), "BROKEN\n");
      expect(run().status).toBe(0);

      // Index is broken, working copy is repaired: staged generation must block.
      execFileSync("git", ["add", "docs/GUIDE.md"], { cwd: repo });
      writeFileSync(join(repo, "docs", "GUIDE.md"), "GOOD\n");
      const blocked = run();
      expect(blocked.status).toBe(1);
      expect(blocked.stdout).toContain("staged Docs Vault sources cannot be generated");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
