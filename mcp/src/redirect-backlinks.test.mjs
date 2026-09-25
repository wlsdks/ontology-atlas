// redirectBacklinks smoke test — the core operation behind rename and merge.
// Run with `node --test` or `npm run test`.

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

test("body link — alias([[x|라벨]])·heading([[x#절]])·tail(md)·경로 접두 형태도 치환", () => {
  // Caught in the 2026-09-01 review: only the bare [[slug]]/[[tail]]/(slug.md)
  // forms were rewritten, so an alias or anchor link dangled after a confirmed
  // rename — and pointed at a deleted file after a merge.
  const root = makeVault();
  writeMd(root, "capabilities/auth", "---\nkind: capability\ntitle: Auth\n---\n");
  writeMd(
    root,
    "ref",
    [
      "---",
      "kind: project",
      "---",
      "# Ref",
      "",
      "the [[capabilities/auth|auth capability]] and [[capabilities/auth#scope]]",
      "tail alias [[auth|the same]] plus (auth.md) and (../capabilities/auth.md)",
      "anchor link (capabilities/auth.md#scope) too.",
      "",
    ].join("\n"),
  );
  redirectBacklinks(root, "capabilities/auth", "capabilities/identity");
  const after = readMd(root, "ref");
  assert.match(after, /\[\[capabilities\/identity\|auth capability\]\]/);
  assert.match(after, /\[\[capabilities\/identity#scope\]\]/);
  assert.match(after, /\[\[identity\|the same\]\]/);
  assert.match(after, /\(identity\.md\)/);
  assert.match(after, /\(\.\.\/capabilities\/identity\.md\)/);
  assert.match(after, /\(capabilities\/identity\.md#scope\)/);
  assert.doesNotMatch(after, /capabilities\/auth/);
  rmSync(root, { recursive: true, force: true });
});

test("findBacklinks — alias·heading 형태의 wikilink 도 backlink 로 센다", () => {
  const root = makeVault();
  writeMd(root, "capabilities/auth", "---\nkind: capability\n---\n");
  writeMd(
    root,
    "alias-ref",
    "---\nkind: project\n---\nsee [[capabilities/auth|the auth capability]].\n",
  );
  writeMd(
    root,
    "heading-ref",
    "---\nkind: project\n---\nsee [[capabilities/auth#scope]].\n",
  );
  const backlinks = findBacklinks(root, "capabilities/auth");
  assert.deepEqual(
    backlinks.map((row) => row.slug).sort(),
    ["alias-ref", "heading-ref"],
  );
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

// Renaming the key of an object map value (as used by relation_notes).
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

test("findBacklinks — includeAmbiguousTailRefs opts candidate referrers in, marked", () => {
  // delete_concept's safety gate uses this: a doc whose ref only *could* mean
  // the target must still block an un-forced delete (bug sweep 2026-09-01).
  const root = makeVault();
  writeMd(root, "capabilities/shared-name", "---\nkind: capability\n---\n");
  writeMd(root, "elements/shared-name", "---\nkind: element\n---\n");
  writeMd(root, "domain", "---\nkind: domain\ncapabilities: [shared-name]\n---\n");
  writeMd(root, "project", "---\nkind: project\nelements: [elements/shared-name]\n---\n");

  const backlinks = findBacklinks(root, "elements/shared-name", {
    includeAmbiguousTailRefs: true,
  });
  assert.deepEqual(backlinks.map((row) => row.slug).sort(), ["domain", "project"]);
  const domainRow = backlinks.find((row) => row.slug === "domain");
  assert.equal(domainRow.ambiguousTail, true);
  const projectRow = backlinks.find((row) => row.slug === "project");
  assert.equal(projectRow.ambiguousTail, undefined);
  rmSync(root, { recursive: true, force: true });
});

test("redirectBacklinks — the surviving doc's refs to the absorbed node are dropped, never turned into self-edges", () => {
  // Reproduced (bug sweep 2026-09-01): merging capabilities/b into
  // capabilities/a where a carried `relates: [capabilities/b]` wrote
  // `relates: [capabilities/a]` — a self-loop on disk.
  const root = makeVault();
  writeMd(
    root,
    "capabilities/a",
    "---\nkind: capability\nrelates: [capabilities/b]\nrelation_notes: { capabilities/b: shares the session store }\n---\n",
  );
  writeMd(root, "capabilities/b", "---\nkind: capability\n---\n");
  writeMd(root, "d1", "---\nkind: document\nrelates: [capabilities/b]\n---\n");

  const result = redirectBacklinks(root, "capabilities/b", "capabilities/a", { dryRun: false });

  assert.equal(result.totalUpdated, 2);
  // A removal is reported with `after` omitted — the update-row contract's
  // removal shape (mcp-verify rejects null / empty-array / empty-map values).
  const survivorUpdate = result.updates.find((row) => row.slug === "capabilities/a");
  for (const keyRow of survivorUpdate.afterKeys) {
    assert.equal("after" in keyRow, false, `${keyRow.key} should be reported as a removal`);
  }
  const survivor = readMd(root, "capabilities/a");
  assert.doesNotMatch(survivor, /relates: \[capabilities\/a\]/);
  assert.doesNotMatch(survivor, /capabilities\/a: shares/);
  assert.match(survivor, /relates: \[\]/);
  assert.match(readMd(root, "d1"), /relates: \[capabilities\/a\]/);
  rmSync(root, { recursive: true, force: true });
});

test("path: 증거 문자열은 참조가 아니다 — tail-suffix 절이 건드리지 않는다", () => {
  // Measured regression (2026-08-01, while flattening the dogfood vault): the
  // rename `elements/src/widgets/docs-vault` → `elements/docs-vault-widget`
  // rewrote **another node's** `path: src/entities/docs-vault` to
  // `…/docs-vault-widget`, pointing it at a file that does not exist. Only
  // reference slots (domain plus the graph arrays) may be rewritten; evidence
  // slots (`path` and other arbitrary string keys) must be preserved.
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

  // References follow.
  assert.match(readMd(root, "capabilities/cap"), /elements\/docs-vault-widget/);
  // Evidence stays.
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

/*
 * A kind change moves an entry between the lists named for kinds (2026-09-26, map-edit review).
 * reclassify_concept rewrote a domain's `capabilities: [capabilities/x]` to
 * `capabilities: [elements/x]` — an element in the capability list, resolving, flagged by
 * nothing, and counted by the dense-parent check as a capability child.
 */
test("targetKind — a typed list entry moves to the list for the new kind", () => {
  const root = makeVault();
  writeMd(root, "capabilities/companion-memories", "---\nkind: capability\ntitle: Companion memories\n---\n");
  writeMd(
    root,
    "domains/human-workbench",
    "---\nkind: domain\ntitle: Human workbench\n" +
      "capabilities: [capabilities/agent-work-visibility, capabilities/companion-memories]\n" +
      "relation_notes: { capabilities/companion-memories: kept beside the chooser }\n" +
      "elements: [elements/map-camera]\n---\n",
  );
  const result = redirectBacklinks(root, "capabilities/companion-memories", "elements/companion-memories", {
    targetKind: "element",
  });
  const after = readMd(root, "domains/human-workbench");
  assert.match(after, /capabilities: \[capabilities\/agent-work-visibility\]\n/);
  assert.match(after, /elements: \[elements\/companion-memories, elements\/map-camera\]\n/);
  assert.match(after, /relation_notes: \{ ?elements\/companion-memories: kept beside the chooser ?\}/);
  assert.deepEqual(result.updates[0].afterKeys.find((row) => row.key === "elements"), {
    key: "elements",
    after: ["elements/companion-memories", "elements/map-camera"],
  });
  assert.deepEqual(result.keptInPlace, []);
  rmSync(root, { recursive: true, force: true });
});

test("targetKind — a referrer that mentions the node only in its body keeps its lists", () => {
  const root = makeVault();
  writeMd(root, "capabilities/companion-memories", "---\nkind: capability\ntitle: Companion memories\n---\n");
  writeMd(
    root,
    "capabilities/memory-recall",
    "---\nkind: capability\nelements: [elements/recall-index]\n---\nSee [[capabilities/companion-memories]].\n",
  );
  const result = redirectBacklinks(root, "capabilities/companion-memories", "elements/companion-memories", {
    targetKind: "element",
  });
  const after = readMd(root, "capabilities/memory-recall");
  assert.match(after, /\[\[elements\/companion-memories\]\]/);
  assert.match(after, /elements: \[elements\/recall-index\]\n/);
  assert.equal(result.updates[0].bodyChanged, true);
  assert.deepEqual(result.updates[0].afterKeys, []);
  rmSync(root, { recursive: true, force: true });
});

test("targetKind — a referrer kind with no list for the new kind keeps the entry and reports it", () => {
  const root = makeVault();
  writeMd(root, "elements/x", "---\nkind: element\ntitle: X\n---\n");
  writeMd(root, "capabilities/recall", "---\nkind: capability\nelements: [elements/recall-index, elements/x]\n---\n");
  const result = redirectBacklinks(root, "elements/x", "capabilities/x", { targetKind: "capability" });
  const after = readMd(root, "capabilities/recall");
  assert.match(after, /elements: \[capabilities\/x, elements\/recall-index\]\n/);
  assert.doesNotMatch(after, /^capabilities:/m);
  assert.deepEqual(result.keptInPlace, [
    { slug: "capabilities/recall", title: "capabilities/recall", key: "elements", ref: "capabilities/x", holderKind: "capability" },
  ]);
  rmSync(root, { recursive: true, force: true });
});

test("targetKind — an in-place kind change moves the entry without touching any address", () => {
  const root = makeVault();
  writeMd(root, "notes/x", "---\nkind: capability\ntitle: X\n---\n");
  writeMd(root, "domains/d", "---\nkind: domain\ncapabilities: [capabilities/y, notes/x]\n---\nSee [[notes/x]].\n");
  writeMd(root, "domains/e", "---\nkind: domain\nrelates: [notes/x]\n---\n");
  const result = redirectBacklinks(root, "notes/x", "notes/x", { targetKind: "element" });
  assert.equal(result.totalUpdated, 1);
  assert.match(readMd(root, "domains/d"), /capabilities: \[capabilities\/y\]\nelements: \[notes\/x\]\n/);
  assert.match(readMd(root, "domains/d"), /See \[\[notes\/x\]\]\./);
  assert.equal(readMd(root, "domains/e"), "---\nkind: domain\nrelates: [notes/x]\n---\n");
  rmSync(root, { recursive: true, force: true });
});

test("without targetKind a same-slug call stays a no-op, and a rename keeps the list", () => {
  const root = makeVault();
  writeMd(root, "capabilities/a", "---\nkind: capability\ntitle: A\n---\n");
  writeMd(root, "domains/d", "---\nkind: domain\ncapabilities: [capabilities/a]\n---\n");
  assert.deepEqual(redirectBacklinks(root, "capabilities/a", "capabilities/a"), { updates: [], totalUpdated: 0, plan: [] });
  redirectBacklinks(root, "capabilities/a", "capabilities/b");
  assert.match(readMd(root, "domains/d"), /capabilities: \[capabilities\/b\]\n/);
  rmSync(root, { recursive: true, force: true });
});

console.log(`\nredirectBacklinks: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
