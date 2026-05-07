// MCP 도구 핸들러 통합 test (R11 #20).
//
// verify.mjs 의 spawn + stdio JSON-RPC 패턴을 test framework 에 옮김. tmp
// vault 만들어 server boot → 도구 호출 → response 검증 → cleanup.
//
// 단위 helper test (parser / vault / redirect-backlinks 등) 가 cover 하지
// 않는 *도구 핸들러 자체* 의 input → routing → output 흐름 회귀 차단.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = resolve(__dirname, "index.js");

let passed = 0;
let failed = 0;

function test(name, fn) {
  return fn()
    .then(() => {
      passed += 1;
      console.log(`  ✓ ${name}`);
    })
    .catch((err) => {
      failed += 1;
      console.error(`  ✗ ${name}`);
      console.error(`    ${err.message ?? err}`);
      if (err.stack) console.error(err.stack);
    });
}

function makeVault(seed = []) {
  const root = mkdtempSync(join(tmpdir(), "omot-int-"));
  for (const { slug, content } of seed) {
    const fullPath = join(root, `${slug}.md`);
    // subdir slug ("capabilities/foo") 도 자동 mkdir — fixture writer 가
    // top-level 외에도 자유롭게 디렉터리 구조 표현 가능.
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content, "utf-8");
  }
  return root;
}

/**
 * tmp vault 에 server spawn → requests JSON-RPC 로 보내고 모든 응답 수집.
 * 1.5s timeout 후 SIGTERM. 응답 = JSON.parse 가능한 stdout line 들.
 */
function rpc(vaultRoot, requests, timeoutMs = 1500) {
  return new Promise((resolveP, rejectP) => {
    const proc = spawn("node", [SERVER_ENTRY], {
      env: { ...process.env, OMOT_VAULT: vaultRoot },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (b) => (stdout += b.toString()));
    proc.stderr.on("data", (b) => (stderr += b.toString()));

    const lines = requests.map((r) => JSON.stringify(r)).join("\n") + "\n";
    proc.stdin.write(lines);

    const timer = setTimeout(() => proc.kill("SIGTERM"), timeoutMs);

    proc.on("close", () => {
      clearTimeout(timer);
      const responses = stdout
        .split("\n")
        .filter(Boolean)
        .map((s) => {
          try {
            return JSON.parse(s);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      resolveP({ responses, stderr });
    });

    proc.on("error", rejectP);
  });
}

const INIT_REQUESTS = [
  {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test", version: "0" },
    },
  },
  { jsonrpc: "2.0", method: "notifications/initialized" },
];

function callTool(id, name, args = {}) {
  return {
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: { name, arguments: args },
  };
}

function getCallText(responses, id) {
  const res = responses.find((r) => r.id === id);
  if (!res) throw new Error(`no response for id ${id}`);
  if (res.error) throw new Error(`error response: ${JSON.stringify(res.error)}`);
  const text = res.result?.content?.[0]?.text;
  if (!text) throw new Error(`no text in response id ${id}`);
  return text;
}

function getCallParsed(responses, id) {
  return JSON.parse(getCallText(responses, id));
}

function isErrorResponse(responses, id) {
  const res = responses.find((r) => r.id === id);
  if (!res) return false;
  return res.result?.isError === true;
}

console.log("integration");

await test("initialize — instructions 필드 (#45) AI agent 안내 노출", async () => {
  // initialize 응답에 instructions 가 있어야 연결된 agent (Claude Code 등) 가
  // kind 계층 / 호출 순서 / write 도구 dry-run 패턴을 즉시 인지. 누락 시
  // agent 는 매 세션 시행착오로 학습 — 명시 가드.
  const root = makeVault([]);
  try {
    const { responses } = await rpc(root, INIT_REQUESTS);
    const init = responses.find((r) => r.id === 1);
    assert.ok(init, "initialize 응답이 와야 함");
    const instructions = init.result?.instructions;
    assert.equal(typeof instructions, "string", "instructions 가 string 이어야");
    assert.ok(
      instructions.length > 200,
      `instructions 가 의미 있는 길이여야 (got ${instructions.length})`,
    );
    // 핵심 키워드 — drift 시 즉시 깨짐
    assert.match(instructions, /kind hierarchy/i);
    assert.match(instructions, /dry-run|confirm/i);
    assert.match(instructions, /expected_mtime/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("list_concepts — tmp vault 의 노드 수 정확히 보고", async () => {
  const root = makeVault([
    { slug: "a", content: "---\nkind: capability\ntitle: A\n---\n" },
    { slug: "b", content: "---\nkind: capability\ntitle: B\n---\n" },
    { slug: "noframe", content: "# Just a doc" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "list_concepts"),
    ]);
    const result = getCallParsed(responses, 2);
    assert.equal(result.total, 2, "kind 있는 노드 2 개만 카운트");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("list_concepts — domain 필터 (R+)", async () => {
  // "all capabilities under auth" 같은 흔한 query 를 query_concepts DSL 없이
  // 한 호출로. capability/element kind 만 의미 있지만 모든 kind 에 일관 적용.
  const root = makeVault([
    {
      slug: "domains/auth",
      content: "---\nkind: domain\ntitle: Auth\n---\n",
    },
    {
      slug: "capabilities/login",
      content: "---\nkind: capability\ntitle: Login\ndomain: auth\n---\n",
    },
    {
      slug: "capabilities/logout",
      content: "---\nkind: capability\ntitle: Logout\ndomain: auth\n---\n",
    },
    {
      slug: "capabilities/billing-charge",
      content: "---\nkind: capability\ntitle: Charge\ndomain: billing\n---\n",
    },
    {
      slug: "elements/auth-token",
      content: "---\nkind: element\ntitle: Token\ndomain: auth\n---\n",
    },
  ]);
  try {
    // domain=auth 만 — capability 2 + element 1 = 3 (domain 자체는 domain: 없음)
    const { responses: r1 } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "list_concepts", { domain: "auth" }),
    ]);
    const out1 = getCallParsed(r1, 2);
    assert.equal(out1.total, 3, "domain=auth → 3");
    assert.ok(out1.nodes.every((n) => n.domain === "auth"));

    // domain=auth + kind=capability → 2 (login, logout)
    const { responses: r2 } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "list_concepts", { domain: "auth", kind: "capability" }),
    ]);
    const out2 = getCallParsed(r2, 2);
    assert.equal(out2.total, 2, "domain=auth + kind=capability → 2");

    // 매칭 없는 domain → 빈 결과 (throw 없이)
    const { responses: r3 } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "list_concepts", { domain: "totally-unknown" }),
    ]);
    const out3 = getCallParsed(r3, 2);
    assert.equal(out3.total, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("find_evidence — 각 match 에 prose excerpt 동봉 (R+)", async () => {
  // agent 가 find_evidence 한 호출로 *어떤 doc 이 reference 하는지* + *그 doc
  // 이 무슨 내용인지* 둘 다 받음. 추가 get_concept 없이.
  const root = makeVault([
    {
      slug: "capabilities/auth",
      content:
        "---\nkind: capability\ntitle: Auth\n---\n\n# Auth\n\n인증 흐름의 핵심 capability — 로그인/로그아웃 일원화.\n",
    },
    {
      slug: "domains/billing",
      content:
        "---\nkind: domain\ntitle: Billing\ncapabilities: [auth]\n---\n\n# Billing\n\n결제 도메인 — auth 와 함께 사용자 세션 검증.\n",
    },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "find_evidence", { title: "auth" }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.ok(Array.isArray(result.matches));
    assert.ok(result.matches.length >= 1);
    for (const m of result.matches) {
      assert.equal(typeof m.excerpt, "string");
      // markdown table syntax / # heading 은 안 들어가야
      assert.doesNotMatch(m.excerpt, /^#/);
      assert.doesNotMatch(m.excerpt, /^\|/);
    }
    // domains/billing 매치는 첫 prose 단락 ("결제 도메인 — auth 와 함께...")
    const billing = result.matches.find((m) => m.slug === "domains/billing");
    if (billing) {
      assert.match(billing.excerpt, /결제 도메인/);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("list_concepts — since 필터 (R+) — incremental sync", async () => {
  // agent 가 이전 list 응답에서 캡처한 max mtime 을 since 로 패스 → vault 의
  // *바뀐 것만* 전송. strict mtime > since 로 같은 max 재전송해도 double-fetch 0.
  const root = makeVault([
    { slug: "old", content: "---\nkind: capability\ntitle: Old\n---\n" },
    { slug: "newer", content: "---\nkind: capability\ntitle: Newer\n---\n" },
  ]);
  try {
    // 1차: 전체 list — 두 노드의 mtime 캡처
    const { responses: r1 } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "list_concepts"),
    ]);
    const out1 = getCallParsed(r1, 2);
    assert.equal(out1.total, 2);
    const maxMtime = Math.max(...out1.nodes.map((n) => n.mtime));

    // 2차: since=maxMtime — strict > 라 0건 (모두 stale)
    const { responses: r2 } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "list_concepts", { since: maxMtime }),
    ]);
    const out2 = getCallParsed(r2, 2);
    assert.equal(out2.total, 0, "since=max → 0건 (재전송 방지)");

    // 3차: since=maxMtime - 1 — 1건 이상 (가장 최근 노드)
    const { responses: r3 } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "list_concepts", { since: maxMtime - 1 }),
    ]);
    const out3 = getCallParsed(r3, 2);
    assert.ok(out3.total >= 1, "since=max-1 → 1+ 건");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("list_concepts — 각 노드에 mtime 포함 (R+)", async () => {
  // get_concept 의 mtime 과 같은 의미. agent 가 list 한 호출로 "어느 노드가
  // 최근에 변경됐나" 파악 가능 — 후속 get_concept 없이 sort/filter.
  const root = makeVault([
    { slug: "a", content: "---\nkind: capability\ntitle: A\n---\n" },
    { slug: "b", content: "---\nkind: capability\ntitle: B\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "list_concepts"),
    ]);
    const result = getCallParsed(responses, 2);
    assert.equal(result.total, 2);
    for (const node of result.nodes) {
      assert.equal(typeof node.mtime, "number", `${node.slug}.mtime 은 number`);
      assert.ok(node.mtime > 0, `${node.slug}.mtime > 0`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("get_concept 응답에 mtime (R11 #8) 포함", async () => {
  const root = makeVault([
    { slug: "foo", content: "---\nkind: capability\ntitle: Foo\n---\nbody" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "get_concept", { slug: "foo" }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.equal(result.slug, "foo");
    assert.equal(typeof result.mtime, "number");
    assert.ok(result.mtime > 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("patch_concept — expected_mtime stale 면 conflict error response", async () => {
  const root = makeVault([
    { slug: "foo", content: "---\nkind: capability\ntitle: Foo\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "patch_concept", {
        slug: "foo",
        frontmatter: { title: "Updated" },
        expected_mtime: 1, // ms=1 — 분명히 안 맞음
      }),
    ]);
    assert.ok(
      isErrorResponse(responses, 2),
      "stale expected_mtime 은 isError:true 여야",
    );
    const text = responses.find((r) => r.id === 2).result.content[0].text;
    assert.match(text, /conflict|VaultConflictError|modified externally/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("rename_concept dry-run — preview 만, 디스크 변경 0", async () => {
  const root = makeVault([
    { slug: "old-target", content: "---\nkind: capability\ntitle: Old\n---\n" },
    {
      slug: "ref",
      content:
        "---\nkind: project\ntitle: Ref\ndependencies: [old-target]\n---\n",
    },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "rename_concept", {
        oldSlug: "old-target",
        newSlug: "new-target",
      }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.equal(result.dryRun, true);
    assert.equal(result.moved, false);
    assert.equal(result.backlinkUpdates.totalUpdated, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("rename_concept confirm:true — 파일 이동 + backlink redirect", async () => {
  const root = makeVault([
    { slug: "old-target", content: "---\nkind: capability\ntitle: Old\n---\n" },
    {
      slug: "ref",
      content:
        "---\nkind: project\ntitle: Ref\ndependencies: [old-target]\n---\n",
    },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "rename_concept", {
        oldSlug: "old-target",
        newSlug: "new-target",
        confirm: true,
      }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.equal(result.ok, true);
    assert.equal(result.moved, true);
    assert.equal(result.backlinkUpdates.totalUpdated, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("merge_concepts confirm:true — fromSlug 삭제 + backlink redirect", async () => {
  const root = makeVault([
    { slug: "from", content: "---\nkind: capability\ntitle: From\n---\n" },
    { slug: "into", content: "---\nkind: capability\ntitle: Into\n---\n" },
    {
      slug: "ref",
      content: "---\nkind: project\ndependencies: [from]\n---\n",
    },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "merge_concepts", {
        fromSlug: "from",
        intoSlug: "into",
        confirm: true,
      }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.equal(result.ok, true);
    assert.equal(result.deleted, true);
    assert.equal(result.backlinkUpdates.totalUpdated, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("list_concepts — corrupt doc 있으면 vaultWarnings 카운트 (R11 #23)", async () => {
  const root = makeVault([
    { slug: "ok", content: "---\nkind: capability\ntitle: OK\n---\n" },
    {
      slug: "corrupt",
      content: "---\nkind: project\n# unclosed frontmatter — no closing ---",
    },
    { slug: "weird", content: "---\nkind: bogus-kind\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "list_concepts"),
    ]);
    const result = getCallParsed(responses, 2);
    assert.ok(result.vaultWarnings, "vaultWarnings 필드 존재");
    assert.ok(
      result.vaultWarnings.errorCount >= 1,
      "unclosed-frontmatter 1+ error",
    );
    assert.ok(
      result.vaultWarnings.warningCount >= 1,
      "unknown-kind 1+ warning",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("get_concept — corrupt doc 응답에 warnings 노출 (R11 #23)", async () => {
  const root = makeVault([
    { slug: "weird", content: "---\nkind: bogus\n---\nbody" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "get_concept", { slug: "weird" }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.ok(Array.isArray(result.warnings), "warnings 필드는 배열");
    assert.ok(
      result.warnings.some((w) => w.code === "unknown-kind"),
      "unknown-kind issue 포함",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("add_relation — 같은 edge 두번 추가 시 alreadyExists:true (idempotent)", async () => {
  const root = makeVault([
    { slug: "a", content: "---\nkind: project\ntitle: A\n---\n" },
    { slug: "b", content: "---\nkind: capability\ntitle: B\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "add_relation", { from: "a", to: "b", type: "depends_on" }),
      callTool(3, "add_relation", { from: "a", to: "b", type: "depends_on" }),
    ]);
    const first = getCallParsed(responses, 2);
    const second = getCallParsed(responses, 3);
    assert.equal(first.ok, true);
    assert.equal(first.alreadyExists, undefined);
    assert.equal(second.ok, true);
    assert.equal(second.alreadyExists, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

console.log(`\nintegration: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
