import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SCRIPT = join(__dirname, "vault-freshness-drift.mjs");

function run(args, options = {}) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: "utf8",
    ...options,
  });
}

/**
 * 노드 하나짜리 볼트를 만든다 — `src/features/auth/` 를 자기 구현으로 댄다.
 * git 은 필요 없다: `--changed-files` 는 파일 목록을 직접 받는 모드다.
 */
function makeVaultFixture() {
  const dir = mkdtempSync(join(tmpdir(), "ontology-atlas-freshness-args-"));
  mkdirSync(join(dir, "docs/ontology/capabilities"), { recursive: true });
  writeFileSync(
    join(dir, "docs/ontology/capabilities/auth.md"),
    "---\nslug: capabilities/auth\nkind: capability\ntitle: Auth\nelements: [src/features/auth/]\n---\n\n# Auth\n",
  );
  return dir;
}

describe("vault-freshness-drift script arguments", () => {
  it("prints help without requiring --base/--changed-files", () => {
    const result = run(["--help"], { cwd: ROOT });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage: node scripts\/vault-freshness-drift\.mjs/);
    assert.equal(result.stderr, "");
  });

  it("rejects unknown options before touching git or the vault", () => {
    const result = run(["--wat"], { cwd: ROOT });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Unknown option: --wat/);
  });

  it("requires either --base or --changed-files", () => {
    const result = run([], { cwd: ROOT });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Either --base <ref> or --changed-files <list> is required\./);
  });

  // ⚠️ **이 검사는 살아 있는 볼트의 상태를 못박고 있었다** (2026-08-17 발견).
  // 원래는 `--changed-files README.md` 를 **이 저장소에** 돌려서 「아무것도
  // 안 걸린다」를 단언했다. 그런데 `docs/ontology/ontology-atlas.md` 가
  // `path: README.md` 를 갖게 되자 탐지기는 **맞게** 걸었고, 낡은 것은 전제
  // 쪽이었다. 볼트에 노드 하나 더하면 뒤집히는 단언은 스크립트를 재는 게 아니라
  // 볼트를 재는 것이다.
  //
  // 그리고 「0 이 나온다」만 재면 **탐지기가 늘 0을 내도 통과한다.** 그래서
  // 같은 픽스처로 양방향을 잰다 — 안 걸리는 파일과 걸리는 파일.
  it("--changed-files dry-run mode reports 0 drift with no vault matches", () => {
    const dir = makeVaultFixture();
    try {
      const result = run(["--changed-files", "README.md", "--repo", dir, "--json"], {
        cwd: ROOT,
      });
      assert.equal(result.status, 0, result.stderr);
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.hasDrift, false);
      assert.equal(payload.commentMarkdown, null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("같은 픽스처에서 걸리는 파일은 실제로 건다 — 탐지기가 늘 0을 내는 게 아니다", () => {
    const dir = makeVaultFixture();
    try {
      const result = run(
        ["--changed-files", "src/features/auth/token.ts", "--repo", dir, "--json"],
        { cwd: ROOT },
      );
      assert.equal(result.status, 0, result.stderr);
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.hasDrift, true);
      assert.deepEqual(
        payload.staleNodes.map((node) => node.slug),
        ["capabilities/auth"],
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("--repo pointing at a missing directory fails before scanning", () => {
    const result = run(["--changed-files", "a.ts", "--repo", "/no/such/repo-dir"], { cwd: ROOT });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Repo path does not exist:/);
  });

  it("a missing vault directory is treated as 'nothing to check', not an error", () => {
    const result = run(
      ["--changed-files", "a.ts", "--vault", "no-such-vault-dir", "--json"],
      { cwd: ROOT },
    );
    assert.equal(result.status, 0);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.hasDrift, false);
    assert.equal(payload.matchedTotal, 0);
  });
});

describe("vault-freshness-drift end-to-end (real git repo + vault fixture)", () => {
  it("flags a capability whose source changed without its .md, then clears after the .md is also staged", () => {
    const dir = mkdtempSync(join(tmpdir(), "ontology-atlas-freshness-e2e-"));
    try {
      const git = (args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
      git(["init", "-q"]);
      git(["config", "user.email", "test@example.com"]);
      git(["config", "user.name", "Test"]);

      mkdirSync(join(dir, "docs/ontology/capabilities"), { recursive: true });
      mkdirSync(join(dir, "src/features/auth"), { recursive: true });
      writeFileSync(
        join(dir, "docs/ontology/capabilities/auth.md"),
        "---\nslug: capabilities/auth\nkind: capability\ntitle: Auth\nelements: [src/features/auth/]\n---\n\n# Auth\n",
      );
      writeFileSync(join(dir, "src/features/auth/token.ts"), "export const token = 1;\n");
      git(["add", "."]);
      git(["commit", "-q", "-m", "base"]);
      const base = git(["rev-parse", "HEAD"]).trim();

      // Change the source file only — the vault .md is untouched.
      writeFileSync(join(dir, "src/features/auth/token.ts"), "export const token = 2;\n");
      git(["add", "."]);
      git(["commit", "-q", "-m", "change token only"]);
      const headDriftOnly = git(["rev-parse", "HEAD"]).trim();

      const drifted = run(["--base", base, "--head", headDriftOnly, "--json"], { cwd: dir });
      assert.equal(drifted.status, 0, drifted.stderr);
      const driftedPayload = JSON.parse(drifted.stdout);
      assert.equal(driftedPayload.hasDrift, true);
      assert.equal(driftedPayload.staleNodes.length, 1);
      assert.equal(driftedPayload.staleNodes[0].slug, "capabilities/auth");
      assert.match(driftedPayload.commentMarkdown, /capabilities\/auth/);

      // Now also update the vault .md in the same diff — no longer stale.
      writeFileSync(
        join(dir, "docs/ontology/capabilities/auth.md"),
        "---\nslug: capabilities/auth\nkind: capability\ntitle: Auth\nelements: [src/features/auth/]\n---\n\n# Auth\n\nUpdated.\n",
      );
      git(["add", "."]);
      git(["commit", "-q", "-m", "update token + vault doc"]);
      const headBothUpdated = git(["rev-parse", "HEAD"]).trim();

      const fresh = run(["--base", base, "--head", headBothUpdated, "--json"], { cwd: dir });
      assert.equal(fresh.status, 0, fresh.stderr);
      const freshPayload = JSON.parse(fresh.stdout);
      assert.equal(freshPayload.hasDrift, false);
      assert.equal(freshPayload.commentMarkdown, null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
