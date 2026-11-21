import { execFileSync, spawnSync } from "node:child_process";
import { accessSync, chmodSync, constants, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Keeps the commit hook present and wired. A missing `core.hooksPath` directory is silent in git, and
 * a hook without the executable bit is skipped, so existence is checked here, not the hook outcome.
 */

const ROOT = join(__dirname, "..", "..", "..");
// Run inside a git hook (pre-push lanes), GIT_DIR and friends are exported; a
// fixture `git init` or `git config` would then write to the real repository.
const FIXTURE_ENV = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
) as NodeJS.ProcessEnv;
const HOOK = join(ROOT, ".githooks", "pre-commit");
const REFRESH_HOOKS = ["post-checkout", "post-merge"] as const;

describe("pre-commit hook wiring", () => {
  it("the hook file exists, is executable and does not touch the stage", () => {
    expect(() => accessSync(HOOK, constants.X_OK)).not.toThrow();
    // A hook that silently changes the stage commits bytes nobody wrote under a
    // person's name, so `git add` inside the hook is forbidden. The index-versus-
    // working-copy behaviour is proven by the two fixture repositories below.
    expect(readFileSync(HOOK, "utf-8")).not.toMatch(/^\s*git add/m);
  });

  it.each(REFRESH_HOOKS)("%s refreshes generated output but does not stage it", (name) => {
    const hook = join(ROOT, ".githooks", name);
    expect(() => accessSync(hook, constants.X_OK)).not.toThrow();
    const source = readFileSync(hook, "utf8");
    expect(source).toContain("node scripts/docs-vault/build-docs-vault.mjs");
    expect(source).not.toMatch(/^\s*git add/m);
  });

  it("uses only staged sources as material and blocks on their generation failure", () => {
    const repo = mkdtempSync(join(tmpdir(), "atlas-precommit-index-"));
    const bin = join(repo, "bin");
    try {
      execFileSync("git", ["init", "-q"], { cwd: repo, env: FIXTURE_ENV });
      mkdirSync(join(repo, "docs"));
      mkdirSync(bin);
      writeFileSync(join(repo, "docs", "GUIDE.md"), "GOOD\n");
      execFileSync("git", ["add", "docs/GUIDE.md"], { cwd: repo, env: FIXTURE_ENV });
      const fakeNode = join(bin, "node");
      writeFileSync(fakeNode, "#!/bin/sh\ngrep -q BROKEN docs/GUIDE.md && exit 9\nexit 0\n");
      chmodSync(fakeNode, 0o755);
      const run = () => spawnSync(HOOK, [], {
        cwd: repo,
        encoding: "utf8",
        env: { ...FIXTURE_ENV, PATH: `${bin}:${process.env.PATH ?? ""}` },
      });

      // Working copy is broken, index is good: the staged snapshot must pass.
      writeFileSync(join(repo, "docs", "GUIDE.md"), "BROKEN\n");
      expect(run().status).toBe(0);

      // Index is broken, working copy is repaired: staged generation must block.
      execFileSync("git", ["add", "docs/GUIDE.md"], { cwd: repo, env: FIXTURE_ENV });
      writeFileSync(join(repo, "docs", "GUIDE.md"), "GOOD\n");
      const blocked = run();
      expect(blocked.status).toBe(1);
      expect(blocked.stdout).toContain("staged Docs Vault sources cannot be generated");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("the real generator blocks staged policy JSON errors and does not read unstaged ones", () => {
    const repo = mkdtempSync(join(tmpdir(), "atlas-precommit-record-json-"));
    try {
      cpSync(join(ROOT, "docs"), join(repo, "docs"), { recursive: true });
      cpSync(join(ROOT, "samples", "storefront"), join(repo, "samples", "storefront"), {
        recursive: true,
      });
      mkdirSync(join(repo, "scripts"), { recursive: true });
      cpSync(join(ROOT, "scripts", "docs-vault", "build-docs-vault.mjs"), join(repo, "scripts", "docs-vault", "build-docs-vault.mjs"));
      cpSync(join(ROOT, "scripts", "docs-vault", "generator"), join(repo, "scripts", "docs-vault", "generator"), { recursive: true });
      cpSync(join(ROOT, "scripts", "lib"), join(repo, "scripts", "lib"), { recursive: true });
      execFileSync("git", ["init", "-q"], { cwd: repo, env: FIXTURE_ENV });
      execFileSync("git", ["config", "maintenance.auto", "false"], { cwd: repo, env: FIXTURE_ENV });
      execFileSync("git", ["config", "user.name", "Atlas Test"], { cwd: repo, env: FIXTURE_ENV });
      execFileSync("git", ["config", "user.email", "atlas@example.invalid"], { cwd: repo, env: FIXTURE_ENV });
      execFileSync("git", ["add", "."], { cwd: repo, env: FIXTURE_ENV });
      execFileSync("git", ["commit", "-qm", "fixture"], { cwd: repo, env: FIXTURE_ENV });
      const policyPath = join(repo, "docs", "records", "legacy.json");
      const validPolicy = readFileSync(policyPath, "utf8");
      const run = () => spawnSync(HOOK, [], { cwd: repo, encoding: "utf8", env: FIXTURE_ENV });

      writeFileSync(policyPath, `${validPolicy.trimEnd()}\n\n`);
      execFileSync("git", ["add", "docs/records/legacy.json"], { cwd: repo, env: FIXTURE_ENV });
      writeFileSync(policyPath, "{ broken working-copy policy\n");
      const stagedGood = run();
      expect(stagedGood.status, `${stagedGood.stdout}\n${stagedGood.stderr}`).toBe(0);

      execFileSync("git", ["add", "docs/records/legacy.json"], { cwd: repo, env: FIXTURE_ENV });
      writeFileSync(policyPath, validPolicy);
      const blocked = run();
      expect(blocked.status).toBe(1);
      expect(`${blocked.stdout}\n${blocked.stderr}`).toMatch(
        /record-ledgers.*legacy\.json|cannot read docs\/records\/legacy\.json/,
      );
      expect(blocked.stdout).toContain("staged Docs Vault sources cannot be generated");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
