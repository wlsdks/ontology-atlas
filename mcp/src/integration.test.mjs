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
    // R+ — read tool 5종 응답 shape 일관성: domain + mtime 동봉
    for (const m of result.matches) {
      assert.equal(typeof m.mtime, "number", `${m.slug}.mtime number`);
      assert.ok(m.mtime > 0);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("list_concepts — summary opt-in (R+) — 각 노드에 prose 요약", async () => {
  // agent 가 한 호출로 "vault 노드 list + 무슨 내용인지" 모두 받음. 후속
  // get_concept N 회 안 함. summary:false (default) 일 때는 응답에 안 들어감.
  const root = makeVault([
    {
      slug: "capabilities/auth",
      content:
        "---\nkind: capability\ntitle: Auth\n---\n\n# Auth\n\n인증 흐름 일원화 capability — 로그인/로그아웃.\n",
    },
    {
      slug: "capabilities/billing",
      content:
        "---\nkind: capability\ntitle: Billing\n---\n\n결제 처리 — 카드 + 페이팔.\n",
    },
  ]);
  try {
    // default: summary 없음
    const { responses: r1 } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "list_concepts"),
    ]);
    const out1 = getCallParsed(r1, 2);
    assert.equal(out1.total, 2);
    for (const node of out1.nodes) {
      assert.equal(node.summary, undefined, "default 에선 summary 안 들어감");
    }

    // summary:true → 모든 노드에 prose 요약
    const { responses: r2 } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "list_concepts", { summary: true }),
    ]);
    const out2 = getCallParsed(r2, 2);
    for (const node of out2.nodes) {
      assert.equal(typeof node.summary, "string", `${node.slug}.summary 가 string`);
      // markdown heading / table syntax 안 들어가야 (prose 만)
      assert.doesNotMatch(node.summary, /^#/);
      assert.doesNotMatch(node.summary, /^\|/);
    }
    const auth = out2.nodes.find((n) => n.slug === "capabilities/auth");
    assert.match(auth.summary, /인증 흐름/);
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

await test("find_backlinks — 매치 row 에 domain + mtime 포함 (R+)", async () => {
  // agent 가 backlinks 받자마자 "어느 도메인 / 언제 변경" 파악. list_concepts
  // 와 동일 shape — 같은 mental model 의 두 view 가 일관 필드 노출.
  const root = makeVault([
    {
      slug: "capabilities/auth",
      content: "---\nkind: capability\ntitle: Auth\ndomain: identity\n---\n",
    },
    {
      slug: "capabilities/login",
      content:
        "---\nkind: capability\ntitle: Login\ndomain: identity\nrelates: [capabilities/auth]\n---\n",
    },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "find_backlinks", { slug: "capabilities/auth" }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.equal(result.total, 1);
    const m = result.matches[0];
    assert.equal(m.slug, "capabilities/login");
    assert.equal(m.kind, "capability");
    assert.equal(m.domain, "identity");
    assert.equal(typeof m.mtime, "number");
    assert.ok(m.mtime > 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("query_concepts — 매치 row 에 mtime 포함 (R+)", async () => {
  // list_concepts / find_backlinks / find_orphans 와 동일 shape — read tool
  // 응답 일관성. agent 가 DSL query 결과를 sort/filter 추가 호출 없이 처리.
  const root = makeVault([
    { slug: "a", content: "---\nkind: capability\ntitle: A\ndomain: x\n---\n" },
    { slug: "b", content: "---\nkind: capability\ntitle: B\ndomain: x\n---\n" },
    { slug: "c", content: "---\nkind: domain\ntitle: C\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "query_concepts", { filter: "kind=capability" }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.equal(result.total, 2);
    for (const m of result.matches) {
      assert.equal(typeof m.mtime, "number", `${m.slug}.mtime number`);
      assert.ok(m.mtime > 0);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("find_orphans — orphan row 에 domain + mtime 포함 (R+)", async () => {
  // list_concepts / find_backlinks 와 동일 shape. agent 가 orphans 받자마자
  // sort/filter 가능 — 후속 get_concept 없이.
  const root = makeVault([
    {
      slug: "domains/auth",
      content: "---\nkind: domain\ntitle: Auth\n---\n", // referenced by 0 — orphan
    },
    {
      slug: "capabilities/orphan-cap",
      content:
        "---\nkind: capability\ntitle: Orphan\ndomain: identity\n---\n", // 어느 곳도 reference 안 함 → orphan
    },
    {
      slug: "capabilities/used-cap",
      content:
        "---\nkind: capability\ntitle: Used\ndomain: identity\nrelates: [capabilities/orphan-cap]\n---\n",
    },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "find_orphans"),
    ]);
    const result = getCallParsed(responses, 2);
    // domains/auth + used-cap (어느 곳도 used-cap 을 reference 안 함) — 둘 다 orphan
    assert.ok(result.total >= 1);
    for (const o of result.orphans) {
      assert.equal(typeof o.mtime, "number", `${o.slug}.mtime number`);
      assert.ok(o.mtime > 0);
    }
    const usedCap = result.orphans.find((o) => o.slug === "capabilities/used-cap");
    if (usedCap) {
      assert.equal(usedCap.domain, "identity");
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

// R+ — get_concepts 배치 reader. K개 slug → 1 round trip. 입력 순서 보존,
// missing slug 는 batch 를 abort 하지 않고 { ok: false, error } 행으로 surface.
await test("get_concepts — 배치 read, 입력 순서 보존 + partial result", async () => {
  const root = makeVault([
    { slug: "alpha", content: "---\nkind: capability\ntitle: Alpha\n---\nbody A" },
    { slug: "beta", content: "---\nkind: element\ntitle: Beta\n---\nbody B" },
    { slug: "gamma", content: "---\nkind: capability\ntitle: Gamma\n---\nbody G" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "get_concepts", { slugs: ["beta", "missing-slug", "alpha"] }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.equal(result.concepts.length, 3, "concepts row 수 = 입력 slugs 수");
    // 순서 보존: 입력 [beta, missing, alpha] → 출력 같은 순서.
    assert.equal(result.concepts[0].slug, "beta");
    assert.equal(result.concepts[0].ok, true);
    assert.equal(result.concepts[0].frontmatter.title, "Beta");
    assert.equal(typeof result.concepts[0].mtime, "number");
    assert.ok(result.concepts[0].mtime > 0);
    // missing slug → ok:false, error message, batch 살아남음.
    assert.equal(result.concepts[1].slug, "missing-slug");
    assert.equal(result.concepts[1].ok, false);
    assert.match(result.concepts[1].error, /not found/i);
    // 그 다음 valid 한 slug 는 정상 처리.
    assert.equal(result.concepts[2].slug, "alpha");
    assert.equal(result.concepts[2].ok, true);
    assert.equal(result.concepts[2].frontmatter.title, "Alpha");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// R+ — get_concepts 빈 배열 / cap (50) 가드. 정상 빈 응답 vs error.
await test("get_concepts — 빈 slugs[] → 빈 concepts[], 51개 → error", async () => {
  const root = makeVault([
    { slug: "foo", content: "---\nkind: capability\ntitle: Foo\n---\n" },
  ]);
  try {
    const { responses: r1 } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "get_concepts", { slugs: [] }),
    ]);
    const empty = getCallParsed(r1, 2);
    assert.deepEqual(empty.concepts, []);

    // 51개 → error response (batch 호출 자체가 throw, MCP 가 error 직렬화).
    const tooMany = Array.from({ length: 51 }, (_, i) => `s${i}`);
    const { responses: r2 } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "get_concepts", { slugs: tooMany }),
    ]);
    // server 는 throw → MCP 응답에 isError content 또는 error 필드. text 안에
    // 우리 cap 메시지 ("Too many slugs") 가 있는지로만 검증.
    const text = JSON.stringify(r2.find((r) => r.id === 2));
    assert.match(text, /Too many slugs|50/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// R+ — add_concepts 배치 writer. /ontology-bootstrap 흐름이 여러 노드를 한
// 호출에 land. 입력 순서 보존, partial result (한 row 의 실패가 batch 를
// abort 하지 않음).
await test("add_concepts — 배치 write, 순서 보존 + partial result", async () => {
  const root = makeVault([
    { slug: "exist", content: "---\nkind: capability\ntitle: Exist\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "add_concepts", {
        concepts: [
          { slug: "alpha", kind: "capability", title: "Alpha", domain: "auth" },
          // existing slug → ok:false
          { slug: "exist", kind: "capability", title: "Existing" },
          { slug: "beta", kind: "element", title: "Beta", domain: "auth" },
          // missing required → ok:false
          { slug: "gamma", kind: "capability" },
        ],
      }),
      // batch 후 list 로 land 된 row 검증
      callTool(3, "list_concepts"),
    ]);
    const result = getCallParsed(responses, 2);
    assert.equal(result.concepts.length, 4, "concepts row 수 = 입력 길이");
    // 순서 보존: alpha → exist (fail) → beta → gamma (fail)
    assert.equal(result.concepts[0].slug, "alpha");
    assert.equal(result.concepts[0].ok, true);
    assert.equal(result.concepts[1].slug, "exist");
    assert.equal(result.concepts[1].ok, false);
    assert.match(result.concepts[1].error, /already exists|exist/i);
    assert.equal(result.concepts[2].slug, "beta");
    assert.equal(result.concepts[2].ok, true);
    assert.equal(result.concepts[3].slug, "gamma");
    assert.equal(result.concepts[3].ok, false);
    assert.match(result.concepts[3].error, /required|title/i);
    // list 응답에 alpha + beta 가 추가됨, gamma 는 안 됨.
    const list = getCallParsed(responses, 3);
    const slugs = list.nodes.map((n) => n.slug).sort();
    assert.ok(slugs.includes("alpha"), "alpha land");
    assert.ok(slugs.includes("beta"), "beta land");
    assert.ok(slugs.includes("exist"), "exist 그대로");
    assert.ok(!slugs.includes("gamma"), "gamma fail → land 안 됨");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// R+ — add_concepts 입력 내 중복 slug 사전 감지. 두번째 동일 slug row 는
// "이미 존재" 가 아닌 "duplicate slug in input batch" 로 더 명확한 에러.
await test("add_concepts — 입력 내 중복 slug 두번째는 ok:false", async () => {
  const root = makeVault([]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "add_concepts", {
        concepts: [
          { slug: "dup", kind: "capability", title: "First", domain: "x" },
          { slug: "dup", kind: "capability", title: "Second", domain: "y" },
        ],
      }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.equal(result.concepts[0].ok, true, "첫 row land");
    assert.equal(result.concepts[1].ok, false, "두번째 동일 slug 는 fail");
    assert.match(result.concepts[1].error, /duplicate slug in input batch/i);
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
