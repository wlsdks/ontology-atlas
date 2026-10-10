
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
import { readDoc } from "./documents.mjs";
import { getFileMtime, VaultConflictError } from "./atomic-writes.mjs";
import { writeDoc, patchFrontmatter, updateDoc, deleteDoc } from "./doc-writes.mjs";

let passed = 0;
let failed = 0;
let uidSequence = 0;

function nextTestUid() {
  uidSequence += 1;
  return `00000000-0000-4000-8000-${String(uidSequence).padStart(12, "0")}`;
}

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
  return mkdtempSync(join(tmpdir(), "ontology-atlas-conflict-"));
}

function writeMd(root, slug, content) {
  const full = join(root, `${slug}.md`);
  const identityCompleteContent = content.startsWith("---\n") && !content.includes("\nuid:")
    ? content.replace("---\n", `---\nuid: ${nextTestUid()}\n`)
    : content;
  writeFileSync(full, identityCompleteContent, "utf-8");
  return full;
}

console.log("conflict-detection");

test("readDoc returns the mtime", () => {
  const root = makeVault();
  writeMd(root, "foo", "---\nkind: capability\n---\nbody");
  const doc = readDoc(root, join(root, "foo.md"));
  assert.equal(typeof doc.mtime, "number");
  assert.ok(doc.mtime > 0);
  rmSync(root, { recursive: true, force: true });
});

test("skips the check when expectedMtime is omitted (existing callers stay compatible)", () => {
  const root = makeVault();
  writeMd(root, "foo", "---\nkind: capability\n---\n");
  patchFrontmatter(root, "foo", { title: "Foo" });
  const after = readFileSync(join(root, "foo.md"), "utf-8");
  assert.match(after, /title: Foo/);
  rmSync(root, { recursive: true, force: true });
});

test("patchFrontmatter passes when expectedMtime matches", () => {
  const root = makeVault();
  const file = writeMd(root, "foo", "---\nkind: capability\n---\n");
  const mtime = getFileMtime(file);
  patchFrontmatter(root, "foo", { title: "Foo" }, { expectedMtime: mtime });
  rmSync(root, { recursive: true, force: true });
});

test("throws VaultConflictError when expectedMtime differs", () => {
  const root = makeVault();
  const file = writeMd(root, "foo", "---\nkind: capability\n---\n");
  const stale = getFileMtime(file) - 5000; // 5s ago — simulates an external change
  // Set an explicitly different mtime: some filesystems truncate below a millisecond.
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

test("VaultConflictError exposes the slug and both mtimes", () => {
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

test("updateDoc honours the expectedMtime option", () => {
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

test("updateDoc does not coerce a null body to an empty body", () => {
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

test("writeDoc rejects invalid frontmatter or body before writing", () => {
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

test("patchFrontmatter rejects an invalid patch before a generic TypeError", () => {
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

test("updateDoc rejects an invalid frontmatter patch before writing", () => {
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

test("deleteDoc honours the expectedMtime option", () => {
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

test("a matching read then write round-trip has no conflict", () => {
  const root = makeVault();
  writeMd(root, "foo", "---\nkind: capability\n---\nold body");
  const doc = readDoc(root, join(root, "foo.md"));
  patchFrontmatter(
    root,
    "foo",
    { title: "Updated" },
    { expectedMtime: doc.mtime },
  );
  rmSync(root, { recursive: true, force: true });
});

test("patch keeps a human edit made right before the atomic rename and stops with a conflict", () => {
  const root = makeVault();
  const file = writeMd(root, "foo", "---\nkind: capability\n---\nold body");
  const doc = readDoc(root, file);

  assert.throws(
    () => patchFrontmatter(root, "foo", { title: "Agent" }, {
      expectedMtime: doc.mtime,
      beforeCommit() {
        writeFileSync(file, `${doc.raw}\nhuman note`, "utf-8");
      },
    }),
    /changed on disk/i,
  );
  assert.match(readFileSync(file, "utf-8"), /human note/);
  assert.doesNotMatch(readFileSync(file, "utf-8"), /title: Agent/);
  rmSync(root, { recursive: true, force: true });
});

test("delete keeps a human edit made right before unlink and stops with a conflict", () => {
  const root = makeVault();
  const file = writeMd(root, "foo", "---\nkind: capability\n---\nold body");
  const doc = readDoc(root, file);

  assert.throws(
    () => deleteDoc(root, "foo", {
      expectedMtime: doc.mtime,
      beforeDelete() {
        writeFileSync(file, `${doc.raw}\nhuman note`, "utf-8");
      },
    }),
    /changed on disk/i,
  );
  assert.match(readFileSync(file, "utf-8"), /human note/);
  rmSync(root, { recursive: true, force: true });
});

console.log(`\nconflict-detection: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
