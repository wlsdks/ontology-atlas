import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SCRIPT = join(__dirname, "audit-vault-paths.mjs");

describe("audit-vault-paths script arguments", () => {
  it("prints help without treating --help as a vault folder", () => {
    const result = spawnSync(process.execPath, [SCRIPT, "--help"], {
      cwd: ROOT,
      encoding: "utf8",
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage: node scripts\/audit-vault-paths\.mjs \[vaultDir\] \[repoDir\]/);
    assert.match(result.stdout, /-h, --help/);
    assert.equal(result.stderr, "");
  });

  it("accepts pnpm separator before explicit vault and repo arguments", () => {
    const result = spawnSync(process.execPath, [SCRIPT, "--", "docs/ontology", "."], {
      cwd: ROOT,
      encoding: "utf8",
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /drift 0/);
    assert.equal(result.stderr, "");
  });

  it("rejects unknown options and missing paths before scanning", () => {
    const unknown = spawnSync(process.execPath, [SCRIPT, "--wat"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    assert.equal(unknown.status, 2);
    assert.match(unknown.stderr, /Unknown option: --wat/);
    assert.doesNotMatch(unknown.stderr, /at async|at Object/);

    const missing = spawnSync(process.execPath, [SCRIPT, "--", "./not-a-vault"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    assert.equal(missing.status, 2);
    assert.equal(missing.stdout, "");
    assert.match(missing.stderr, /Vault path does not exist:/);
    assert.doesNotMatch(missing.stderr, /at async|at Object/);
  });

  it("rejects non-directory vault and repo paths before scanning", () => {
    const dir = mkdtempSync(join(tmpdir(), "ontology-atlas-audit-vault-"));
    const file = join(dir, "not-a-dir.md");

    try {
      writeFileSync(file, "not a directory\n");

      const vaultFile = spawnSync(process.execPath, [SCRIPT, file, "."], {
        cwd: ROOT,
        encoding: "utf8",
      });
      assert.equal(vaultFile.status, 2);
      assert.equal(vaultFile.stdout, "");
      assert.match(vaultFile.stderr, /Vault path is not a directory:/);
      assert.doesNotMatch(vaultFile.stderr, /at async|at Object|drift/);

      const repoFile = spawnSync(process.execPath, [SCRIPT, "docs/ontology", file], {
        cwd: ROOT,
        encoding: "utf8",
      });
      assert.equal(repoFile.status, 2);
      assert.equal(repoFile.stdout, "");
      assert.match(repoFile.stderr, /Repo path is not a directory:/);
      assert.doesNotMatch(repoFile.stderr, /at async|at Object|drift/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
