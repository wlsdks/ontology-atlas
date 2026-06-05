// redirectBacklinks helper smoke test — rename / merge 의 핵심 동작.
// node --test 또는 `npm run test` 로 실행.

import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { redirectBacklinks } from "./vault.mjs";

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
  const root = mkdtempSync(join(tmpdir(), "ontology-atlas-redirect-"));
  return root;
}

function writeMd(root, slug, content) {
  const full = join(root, `${slug}.md`);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content, "utf-8");
}

function readMd(root, slug) {
  return readFileSync(join(root, `${slug}.md`), "utf-8");
}

console.log("redirectBacklinks");

test("absolute slug 매칭 — array 항목 치환", () => {
  const root = makeVault();
  writeMd(
    root,
    "target",
    "---\nkind: capability\ntitle: Target\n---\n# Target\n",
  );
  writeMd(
    root,
    "ref",
    "---\nkind: project\ntitle: Ref\ndependencies: [target]\n---\n# Ref\n",
  );
  const result = redirectBacklinks(root, "target", "renamed");
  assert.equal(result.totalUpdated, 1);
  assert.equal(result.updates[0].slug, "ref");
  assert.equal(result.updates[0].title, "Ref");
  assert.deepEqual(result.updates[0].afterKeys, [{ key: "dependencies", after: ["renamed"] }]);
  const after = readMd(root, "ref");
  assert.match(after, /dependencies: \[renamed\]/);
  rmSync(root, { recursive: true, force: true });
});

test("path-prefixed tail 매칭 — capabilities/foo 도 redirect", () => {
  const root = makeVault();
  writeMd(
    root,
    "capabilities/foo",
    "---\nkind: capability\ntitle: Foo\n---\n# Foo\n",
  );
  writeMd(
    root,
    "ref",
    "---\nkind: project\ndependencies: [capabilities/foo]\n---\n# Ref\n",
  );
  redirectBacklinks(root, "capabilities/foo", "capabilities/bar");
  const after = readMd(root, "ref");
  assert.match(after, /dependencies: \[capabilities\/bar\]/);
  rmSync(root, { recursive: true, force: true });
});

test("dedup — 이미 nextSlug 가 있으면 중복 안 추가", () => {
  const root = makeVault();
  writeMd(root, "old-slug", "---\nkind: capability\n---\n");
  writeMd(root, "new-slug", "---\nkind: capability\n---\n");
  writeMd(
    root,
    "ref",
    "---\nkind: project\ndependencies: [old-slug, new-slug]\n---\n",
  );
  redirectBacklinks(root, "old-slug", "new-slug");
  const after = readMd(root, "ref");
  // both old → new becomes [new-slug, new-slug] → dedup [new-slug]
  assert.match(after, /dependencies: \[new-slug\]/);
  rmSync(root, { recursive: true, force: true });
});

test("relation array canonical sort — redirect 후 정렬", () => {
  const root = makeVault();
  writeMd(root, "old-slug", "---\nkind: capability\n---\n");
  writeMd(root, "b-slug", "---\nkind: capability\n---\n");
  writeMd(root, "a-slug", "---\nkind: capability\n---\n");
  writeMd(root, "z-slug", "---\nkind: capability\n---\n");
  writeMd(
    root,
    "ref",
    "---\nkind: project\ndependencies: [z-slug, old-slug, a-slug]\n---\n",
  );
  redirectBacklinks(root, "old-slug", "b-slug");
  const after = readMd(root, "ref");
  assert.match(after, /dependencies: \[a-slug, b-slug, z-slug\]/);
  rmSync(root, { recursive: true, force: true });
});

test("body link [[slug]] 와 (slug.md) 도 치환", () => {
  const root = makeVault();
  writeMd(root, "target", "---\nkind: capability\n---\n");
  writeMd(
    root,
    "ref",
    "---\nkind: project\n---\n# Ref\n\nsee [[target]] also (target.md).\n",
  );
  redirectBacklinks(root, "target", "renamed");
  const after = readMd(root, "ref");
  assert.match(after, /\[\[renamed\]\]/);
  assert.match(after, /\(renamed\.md\)/);
  rmSync(root, { recursive: true, force: true });
});

test("dryRun:true 면 디스크 변경 없음", () => {
  const root = makeVault();
  writeMd(root, "target", "---\nkind: capability\n---\n");
  writeMd(
    root,
    "ref",
    "---\nkind: project\ndependencies: [target]\n---\n",
  );
  const before = readMd(root, "ref");
  const result = redirectBacklinks(root, "target", "renamed", { dryRun: true });
  assert.equal(result.totalUpdated, 1);
  assert.equal(readMd(root, "ref"), before);
  rmSync(root, { recursive: true, force: true });
});

test("targetSlug === nextSlug 는 no-op", () => {
  const root = makeVault();
  writeMd(root, "target", "---\nkind: capability\n---\n");
  const result = redirectBacklinks(root, "target", "target");
  assert.equal(result.totalUpdated, 0);
  rmSync(root, { recursive: true, force: true });
});

test("inline string key 도 redirect (e.g. domain)", () => {
  const root = makeVault();
  writeMd(root, "auth", "---\nkind: domain\ntitle: Auth\n---\n");
  writeMd(
    root,
    "leaf",
    "---\nkind: capability\ndomain: auth\ntitle: Leaf\n---\n",
  );
  redirectBacklinks(root, "auth", "authentication");
  const after = readMd(root, "leaf");
  assert.match(after, /domain: authentication/);
  rmSync(root, { recursive: true, force: true });
});

console.log(`\nredirectBacklinks: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
