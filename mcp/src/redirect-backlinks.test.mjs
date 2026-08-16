// redirectBacklinks helper smoke test — rename / merge 의 핵심 동작.
// node --test 또는 `npm run test` 로 실행.

import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { findBacklinks, redirectBacklinks } from "./vault.mjs";

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

// P6 게이트 ① — 객체 맵 값의 키 rename (relation_notes 대비).
test("객체 맵 키 rename — why 노트가 고아가 되지 않는다", () => {
  const root = makeVault();
  writeMd(
    root,
    "user",
    "---\nkind: capability\ntitle: User\ndependencies: [capabilities/mcp-server]\nrelation_notes:\n  capabilities/mcp-server: 쓰기 경로가 이 서버를 지난다\n---\n",
  );
  redirectBacklinks(root, "capabilities/mcp-server", "capabilities/graph-server");
  const after = readMd(root, "user");
  assert.match(after, /capabilities\/graph-server: 쓰기 경로가/);
  assert.doesNotMatch(after, /capabilities\/mcp-server:/);
  rmSync(root, { recursive: true, force: true });
});

test("객체 맵 dry-run은 감사 값을 보존하되 내부 쓰기 plan을 공개하지 않는다", () => {
  const root = makeVault();
  writeMd(
    root,
    "user-preview",
    "---\nkind: capability\ntitle: User Preview\nrelation_notes:\n  capabilities/mcp-server: 쓰기 경로가 이 서버를 지난다\n---\n",
  );
  const preview = redirectBacklinks(
    root,
    "capabilities/mcp-server",
    "capabilities/graph-server",
    { dryRun: true },
  );
  assert.equal(Object.hasOwn(preview, "plan"), false);
  assert.deepEqual(preview.updates[0].beforeKeys, [
    {
      key: "relation_notes",
      before: { "capabilities/mcp-server": "쓰기 경로가 이 서버를 지난다" },
    },
  ]);
  assert.deepEqual(preview.updates[0].afterKeys, [
    {
      key: "relation_notes",
      after: { "capabilities/graph-server": "쓰기 경로가 이 서버를 지난다" },
    },
  ]);
  rmSync(root, { recursive: true, force: true });
});

test("객체 맵 키 충돌 — 기존(new 키) 값이 이긴다 (조용한 덮어쓰기 금지)", () => {
  const root = makeVault();
  writeMd(
    root,
    "user2",
    "---\nkind: capability\ntitle: User2\nrelation_notes:\n  capabilities/old-name: 옛 노트\n  capabilities/new-name: 새 노트\n---\n",
  );
  redirectBacklinks(root, "capabilities/old-name", "capabilities/new-name");
  const after = readMd(root, "user2");
  assert.match(after, /capabilities\/new-name: 새 노트/);
  assert.doesNotMatch(after, /옛 노트/);
  rmSync(root, { recursive: true, force: true });
});

test("동일 tail 이 여러 kind 에 있으면 exact target 만 redirect", () => {
  const root = makeVault();
  writeMd(
    root,
    "capabilities/shared-name",
    "---\nslug: capabilities/shared-name\nkind: capability\ntitle: Capability\n---\n",
  );
  writeMd(
    root,
    "elements/shared-name",
    "---\nslug: elements/shared-name\nkind: element\ntitle: Element\n---\n",
  );
  writeMd(
    root,
    "domain",
    "---\nkind: domain\ncapabilities: [shared-name]\n---\nsee [[shared-name]].\n",
  );
  writeMd(
    root,
    "project",
    "---\nkind: project\nelements: [elements/shared-name]\n---\nsee [[elements/shared-name]].\n",
  );

  const result = redirectBacklinks(
    root,
    "elements/shared-name",
    "elements/renamed-element",
    { dryRun: true },
  );

  assert.equal(result.totalUpdated, 1);
  assert.equal(result.updates[0].slug, "project");
  assert.equal(readMd(root, "capabilities/shared-name").includes("capabilities/renamed-element"), false);
  assert.match(readMd(root, "domain"), /capabilities: \[shared-name\]/);
  assert.match(readMd(root, "domain"), /\[\[shared-name\]\]/);
  rmSync(root, { recursive: true, force: true });
});

test("findBacklinks 는 ambiguous tail 을 exact target backlink 로 오인하지 않는다", () => {
  const root = makeVault();
  writeMd(root, "capabilities/shared-name", "---\nkind: capability\n---\n");
  writeMd(root, "elements/shared-name", "---\nkind: element\n---\n");
  writeMd(root, "domain", "---\nkind: domain\ncapabilities: [shared-name]\n---\n");
  writeMd(root, "project", "---\nkind: project\nelements: [elements/shared-name]\n---\n");

  const backlinks = findBacklinks(root, "elements/shared-name");
  assert.deepEqual(backlinks.map((row) => row.slug), ["project"]);
  rmSync(root, { recursive: true, force: true });
});

test("path: 증거 문자열은 참조가 아니다 — tail-suffix 절이 건드리지 않는다", () => {
  // 실측 회귀 (2026-08-01, 도그푸드 볼트 평탄화): `elements/src/widgets/
  // docs-vault` → `elements/docs-vault-widget` rename 이 **다른 노드의**
  // `path: src/entities/docs-vault` 를 `…/docs-vault-widget` 으로 고쳐
  // 존재하지 않는 파일을 가리키게 했다. 참조 슬롯(domain + graph arrays)만
  // 다시 쓰고 증거 슬롯(path 등 임의 문자열 키)은 보존해야 한다.
  const root = makeVault();
  writeMd(root, "elements/docs-vault", "---\nkind: element\ntitle: DV\n---\n");
  writeMd(
    root,
    "elements/other",
    "---\nkind: element\ntitle: Other\npath: src/entities/docs-vault\n---\n",
  );
  writeMd(
    root,
    "capabilities/cap",
    "---\nkind: capability\nelements: [elements/docs-vault]\n---\n",
  );

  redirectBacklinks(root, "elements/docs-vault", "elements/docs-vault-widget", {
    dryRun: false,
  });

  // 참조는 따라간다.
  assert.match(readMd(root, "capabilities/cap"), /elements\/docs-vault-widget/);
  // 증거는 남는다.
  assert.match(readMd(root, "elements/other"), /path: src\/entities\/docs-vault\n/);
  rmSync(root, { recursive: true, force: true });
});

test("domain: 단일 문자열 참조는 여전히 따라간다", () => {
  const root = makeVault();
  writeMd(root, "domains/auth", "---\nkind: domain\ntitle: Auth\n---\n");
  writeMd(
    root,
    "capabilities/login",
    "---\nkind: capability\ndomain: domains/auth\n---\n",
  );

  redirectBacklinks(root, "domains/auth", "domains/identity", { dryRun: false });
  assert.match(readMd(root, "capabilities/login"), /domain: domains\/identity/);
  rmSync(root, { recursive: true, force: true });
});

test("deferred plan은 다시 쓸 바로 그 snapshot 바이트와 mtime을 함께 싣는다", () => {
  const root = makeVault();
  writeMd(root, "target", "---\nkind: capability\n---\n");
  writeMd(
    root,
    "ref",
    "---\nkind: capability\nrelates: [target]\n---\n사람이 지킬 본문\n",
  );
  const before = readMd(root, "ref");

  const result = redirectBacklinks(root, "target", "renamed", {
    dryRun: false,
    deferWrite: true,
  });

  assert.equal(result.plan.length, 1);
  assert.equal(result.plan[0].expectedRaw, before);
  assert.equal(typeof result.plan[0].expectedMtime, "number");
  rmSync(root, { recursive: true, force: true });
});

console.log(`\nredirectBacklinks: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
