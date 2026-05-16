// R11 #8 — vault mtime conflict detection.
// node --test 또는 `npm run test` 로 실행.

import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  utimesSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  readDoc,
  writeDoc,
  patchFrontmatter,
  updateDoc,
  deleteDoc,
  getFileMtime,
  VaultConflictError,
} from "./vault.mjs";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

function makeVault() {
  return mkdtempSync(join(tmpdir(), "omot-conflict-"));
}

function writeMd(root, slug, content) {
  const full = join(root, `${slug}.md`);
  writeFileSync(full, content, "utf-8");
  return full;
}

console.log("conflict-detection");

test("readDoc 응답에 mtime 포함", () => {
  const root = makeVault();
  writeMd(root, "foo", "---\nkind: capability\n---\nbody");
  const doc = readDoc(root, join(root, "foo.md"));
  assert.equal(typeof doc.mtime, "number");
  assert.ok(doc.mtime > 0);
  rmSync(root, { recursive: true, force: true });
});

test("expectedMtime 미지정 시 검증 skip (기존 호출자 호환)", () => {
  const root = makeVault();
  writeMd(root, "foo", "---\nkind: capability\n---\n");
  // expectedMtime 안 줘도 patchFrontmatter 가 정상 진행
  patchFrontmatter(root, "foo", { title: "Foo" });
  const after = readFileSync(join(root, "foo.md"), "utf-8");
  assert.match(after, /title: Foo/);
  rmSync(root, { recursive: true, force: true });
});

test("expectedMtime 일치하면 patchFrontmatter 통과", () => {
  const root = makeVault();
  const file = writeMd(root, "foo", "---\nkind: capability\n---\n");
  const mtime = getFileMtime(file);
  patchFrontmatter(root, "foo", { title: "Foo" }, { expectedMtime: mtime });
  rmSync(root, { recursive: true, force: true });
});

test("expectedMtime 불일치 시 VaultConflictError", () => {
  const root = makeVault();
  const file = writeMd(root, "foo", "---\nkind: capability\n---\n");
  const stale = getFileMtime(file) - 5000; // 5초 전 — 외부 변경 시뮬
  // 파일을 한번 더 touch 해서 mtime 가 stale 보다 분명히 새 시간이 되도록.
  // mkdtemp 직후 mtime 은 현재인데 stale 은 5초 전. 그러나 fs 가 가끔
  // mtime 을 ms 미만 truncate 하므로 명시적으로 다른 시간 설정.
  const now = Date.now();
  utimesSync(file, now / 1000, now / 1000);

  assert.throws(
    () =>
      patchFrontmatter(
        root,
        "foo",
        { title: "Foo" },
        { expectedMtime: stale },
      ),
    (err) => err instanceof VaultConflictError && err.code === "VAULT_CONFLICT",
  );
  rmSync(root, { recursive: true, force: true });
});

test("VaultConflictError 가 slug / mtimes 노출", () => {
  const root = makeVault();
  const file = writeMd(root, "foo", "---\nkind: capability\n---\n");
  const stale = getFileMtime(file) - 5000;
  const now = Date.now();
  utimesSync(file, now / 1000, now / 1000);

  try {
    patchFrontmatter(root, "foo", { title: "Foo" }, { expectedMtime: stale });
    assert.fail("expected throw");
  } catch (err) {
    assert.equal(err.code, "VAULT_CONFLICT");
    assert.equal(err.slug, "foo");
    assert.equal(err.expectedMtime, stale);
    assert.ok(typeof err.currentMtime === "number");
    assert.match(err.message, /modified externally/);
  }
  rmSync(root, { recursive: true, force: true });
});

test("updateDoc 도 expectedMtime 옵션 따른다", () => {
  const root = makeVault();
  const file = writeMd(root, "foo", "---\nkind: capability\n---\n");
  const stale = getFileMtime(file) - 5000;
  utimesSync(file, Date.now() / 1000, Date.now() / 1000);

  assert.throws(
    () =>
      updateDoc(root, "foo", {
        frontmatter: { title: "X" },
        expectedMtime: stale,
      }),
    (err) => err instanceof VaultConflictError,
  );
  rmSync(root, { recursive: true, force: true });
});

test("updateDoc 는 null body 를 빈 본문으로 coerce 하지 않는다", () => {
  const root = makeVault();
  writeMd(root, "foo", "---\nkind: capability\n---\nold body");

  assert.throws(
    () =>
      updateDoc(root, "foo", {
        body: null,
      }),
    /body must be a string/,
  );
  const after = readFileSync(join(root, "foo.md"), "utf-8");
  assert.match(after, /old body/);
  rmSync(root, { recursive: true, force: true });
});

test("writeDoc 는 invalid frontmatter/body 를 쓰기 전에 거부한다", () => {
  const root = makeVault();

  assert.throws(
    () =>
      writeDoc(root, "foo", {
        frontmatter: null,
        body: "body",
      }),
    /frontmatter must be an object/,
  );
  assert.throws(
    () =>
      writeDoc(root, "bar", {
        frontmatter: { kind: "capability" },
        body: null,
      }),
    /body must be a string/,
  );
  assert.throws(() => readFileSync(join(root, "foo.md"), "utf-8"), /ENOENT/);
  assert.throws(() => readFileSync(join(root, "bar.md"), "utf-8"), /ENOENT/);
  rmSync(root, { recursive: true, force: true });
});

test("patchFrontmatter 는 invalid patch 를 generic TypeError 전에 거부한다", () => {
  const root = makeVault();
  writeMd(root, "foo", "---\nkind: capability\n---\nold body");

  assert.throws(
    () => patchFrontmatter(root, "foo", null),
    /frontmatter must be an object/,
  );
  assert.throws(
    () => patchFrontmatter(root, "foo", ["bad"]),
    /frontmatter must be an object/,
  );
  const after = readFileSync(join(root, "foo.md"), "utf-8");
  assert.match(after, /old body/);
  rmSync(root, { recursive: true, force: true });
});

test("updateDoc 는 invalid frontmatter patch 를 쓰기 전에 거부한다", () => {
  const root = makeVault();
  writeMd(root, "foo", "---\nkind: capability\n---\nold body");

  assert.throws(
    () =>
      updateDoc(root, "foo", {
        frontmatter: null,
      }),
    /frontmatter must be an object/,
  );
  assert.throws(
    () =>
      updateDoc(root, "foo", {
        frontmatter: ["bad"],
      }),
    /frontmatter must be an object/,
  );
  const after = readFileSync(join(root, "foo.md"), "utf-8");
  assert.match(after, /old body/);
  rmSync(root, { recursive: true, force: true });
});

test("deleteDoc 도 expectedMtime 옵션 따른다", () => {
  const root = makeVault();
  const file = writeMd(root, "foo", "---\nkind: capability\n---\n");
  const stale = getFileMtime(file) - 5000;
  utimesSync(file, Date.now() / 1000, Date.now() / 1000);

  assert.throws(
    () => deleteDoc(root, "foo", { expectedMtime: stale }),
    (err) => err instanceof VaultConflictError,
  );
  rmSync(root, { recursive: true, force: true });
});

test("read → write 일치 흐름은 conflict 없음 (round-trip)", () => {
  const root = makeVault();
  writeMd(root, "foo", "---\nkind: capability\n---\nold body");
  const doc = readDoc(root, join(root, "foo.md"));
  // doc.mtime 을 그대로 expectedMtime 으로 넘기면 conflict 0
  patchFrontmatter(
    root,
    "foo",
    { title: "Updated" },
    { expectedMtime: doc.mtime },
  );
  rmSync(root, { recursive: true, force: true });
});

console.log(`\nconflict-detection: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
