import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  parseValidateVaultArgs,
  validateVaultUsage,
} from "./validate-vault.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SCRIPT = join(__dirname, "validate-vault.mjs");

describe("validate-vault script arguments", () => {
  it("parses help before resolving a vault path", () => {
    assert.deepEqual(
      parseValidateVaultArgs({
        argv: ["node", "validate-vault.mjs", "--help"],
        cwd: ROOT,
      }),
      { help: true },
    );
    assert.match(validateVaultUsage(), /Usage: node scripts\/validate-vault\.mjs \[vaultDir\]/);
    assert.match(validateVaultUsage(), /Defaults to docs\/ontology/);
  });

  it("rejects unknown options before scanning the filesystem", () => {
    assert.deepEqual(
      parseValidateVaultArgs({
        argv: ["node", "validate-vault.mjs", "--wat"],
        cwd: ROOT,
      }),
      {
        error: "Unknown option: --wat",
        exitCode: 2,
      },
    );
    assert.deepEqual(
      parseValidateVaultArgs({
        argv: ["node", "validate-vault.mjs", "--", "--wat"],
        cwd: ROOT,
      }),
      {
        error: "Unknown option: --wat",
        exitCode: 2,
      },
    );
  });

  it("prints help without treating --help as a vault folder", () => {
    const result = spawnSync(process.execPath, [SCRIPT, "--help"], {
      cwd: ROOT,
      encoding: "utf8",
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage: node scripts\/validate-vault\.mjs \[vaultDir\]/);
    assert.match(result.stdout, /-h, --help/);
    assert.equal(result.stderr, "");
  });

  it("reports missing or non-directory vault paths without a stack trace", () => {
    const missing = spawnSync(process.execPath, [SCRIPT, "./not-a-vault"], {
      cwd: ROOT,
      encoding: "utf8",
    });

    assert.equal(missing.status, 2);
    assert.equal(missing.stdout, "");
    assert.match(missing.stderr, /Vault path does not exist:/);
    assert.doesNotMatch(missing.stderr, /at async/);

    const dir = mkdtempSync(join(tmpdir(), "ontology-atlas-validate-vault-"));
    const file = join(dir, "not-a-dir.md");
    try {
      writeFileSync(file, "---\nkind: project\n---\n");
      const notDirectory = spawnSync(process.execPath, [SCRIPT, file], {
        cwd: ROOT,
        encoding: "utf8",
      });

      assert.equal(notDirectory.status, 2);
      assert.equal(notDirectory.stdout, "");
      assert.match(notDirectory.stderr, /Vault path is not a directory:/);
      assert.doesNotMatch(notDirectory.stderr, /at async/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
