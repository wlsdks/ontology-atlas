import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNNER = path.join(ROOT, "scripts", "migrate-vault.mjs");

function run(args, cwd = ROOT) {
  return spawnSync(process.execPath, [RUNNER, ...args], {
    cwd,
    encoding: "utf8",
  });
}

test("canonical migration inventory lists the UID v2 migration", () => {
  const result = run(["--list"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /2026-08-02-add-node-uids/);
  assert.doesNotMatch(result.stdout, /2026-08-02-add-node-uids\.test/);
});

test("canonical migration runner exposes help without treating the flag as a path", () => {
  const result = run(["--help"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /pnpm vault:migrate <id>/);
  assert.match(result.stdout, /--write/);
  assert.match(result.stdout, /--force/);
});

test("UID migration validates the complete vault before the first write", () => {
  const vault = mkdtempSync(path.join(tmpdir(), "oat-canonical-uid-migration-"));
  try {
    const first = path.join(vault, "a.md");
    const before = "---\nkind: project\nslug: a\n---\n";
    writeFileSync(first, before);
    writeFileSync(
      path.join(vault, "b.md"),
      "---\nuid: broken\nkind: domain\nslug: b\n---\n",
    );

    const result = run([
      "2026-08-02-add-node-uids",
      "--vault",
      vault,
      "--write",
      "--force",
    ]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /invalid UID.*b\.md/i);
    assert.equal(readFileSync(first, "utf8"), before);
  } finally {
    rmSync(vault, { recursive: true, force: true });
  }
});

test("UID migration is dry-run by default, writes only with opt-in, and is idempotent", () => {
  const vault = mkdtempSync(path.join(tmpdir(), "oat-canonical-uid-migration-"));
  try {
    const file = path.join(vault, "project.md");
    const before = "---\nkind: project\nslug: project\n---\n";
    writeFileSync(file, before);

    const dryRun = run(["2026-08-02-add-node-uids", "--vault", vault]);
    assert.equal(dryRun.status, 0, dryRun.stderr);
    assert.match(dryRun.stdout, /DRY-RUN.*1 변경/);
    assert.equal(readFileSync(file, "utf8"), before);

    const write = run([
      "2026-08-02-add-node-uids",
      "--vault",
      vault,
      "--write",
      "--force",
    ]);
    assert.equal(write.status, 0, write.stderr);
    const after = readFileSync(file, "utf8");
    assert.match(after, /^---\nuid: [0-9a-f-]+\nkind:/);

    const again = run([
      "2026-08-02-add-node-uids",
      "--vault",
      vault,
      "--write",
      "--force",
    ]);
    assert.equal(again.status, 0, again.stderr);
    assert.match(again.stdout, /WRITE.*0 변경/);
    assert.equal(readFileSync(file, "utf8"), after);
  } finally {
    rmSync(vault, { recursive: true, force: true });
  }
});

test("UID migration inherits the canonical dirty Markdown write guard", () => {
  const vault = mkdtempSync(path.join(tmpdir(), "oat-canonical-uid-dirty-"));
  try {
    const file = path.join(vault, "project.md");
    const committed = "---\nkind: project\nslug: project\n---\n";
    writeFileSync(file, committed);
    for (const args of [
      ["init"],
      ["config", "user.email", "audit@example.invalid"],
      ["config", "user.name", "UID migration audit"],
      ["add", "project.md"],
      ["commit", "-m", "fixture"],
    ]) {
      const git = spawnSync("git", args, { cwd: vault, encoding: "utf8" });
      assert.equal(git.status, 0, git.stderr);
    }
    const dirty = `${committed}\nlocal edit\n`;
    writeFileSync(file, dirty);

    const result = run([
      "2026-08-02-add-node-uids",
      "--vault",
      vault,
      "--write",
    ]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /commit 안 된 \.md 변경 1 개/);
    assert.equal(readFileSync(file, "utf8"), dirty);
  } finally {
    rmSync(vault, { recursive: true, force: true });
  }
});
