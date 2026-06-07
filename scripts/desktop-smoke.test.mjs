import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  DESKTOP_SMOKE_ROUTE_CHUNK_TEXT,
  DESKTOP_SMOKE_ROUTE_TEXT,
  evaluateDesktopSmoke,
} from "./desktop-smoke.mjs";

function makeOutDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "omo-desktop-smoke-"));
}

function touch(root, relativePath) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "<!doctype html>", "utf8");
}

function htmlWithWorkbenchProof(title = "Ontology Atlas") {
  return `<!doctype html><title>${title}</title><main>Source Vault documents Guides Ontology nodes 문서함 문서 가이드 문서 온톨로지 노드 문서 파일 Files Graph 그래프 Agent 에이전트 local markdown 마크다운 frontmatter MCP runtime gate relation_name_parity pattern_walk/project_map Copy graph gate graph gate 복사 그래프 점검 복사 Save status 저장 상태 Layout 배치 Re-arrange 자동 정렬 로컬 문서 canvas draft 캔버스 임시 변경 not on disk until save save 전까지 디스크 아님 저장 전까지 디스크 아님 relation guard 관계 저장 점검 graph db + health 그래프 DB 점검 tree projection frontmatter write Concept map concepts relations business-first data-business-read-order outcome>domain>capability>element docs hidden Hierarchy notes 개념 지도 개념 둘러보기 개념 관계 문서 숨김 계층 메모 검증 근거 문서함 저장 Query cockpit Readiness Pack CLI MATCH Run order 실행 순서 Payloads CLI fallback Scan contract Path contract setup gate self-check + health gate Business decision lane Accept if outcome Accept if proof rows Boundary Claim Evidence Copy Boundary Copy Claim Copy Evidence 비즈니스 결정 레인 통과입니다 proof row 경계 주장 근거 경계 복사 주장 복사 근거 복사 Graph DB proof 그래프 검증 Browse Write Query 둘러보기 작성 검증 dogfood:graph-db focused blast_radius relation_name_parity pattern_walk/project_map runtime replay 런타임 재생 canonical slug 선택한 개념 graph handle 선택 기준 pick focus concept active slug Focus saved concept 기준 개념 먼저 활성 slug 저장된 개념 포커스 Copy guard Guard 복사 점검 묶음 복사 Copy sync gate sync gate 복사 동기화 점검 복사 Copy runtime gate runtime gate 복사 Copy business brief 비즈니스 브리프 복사 연결·검증 그래프를 작게 나눠 검증 검증 흐름 보기 결과 계약과 실행 게이트 보기 준비도 검사 묶음 에이전트 그래프 준비도 수리 프롬프트 복사 CLI 대체 MCP 인자 CLI 명령 탐색 결과 계약 경로 결과 계약 설정 점검 자체 점검 + 상태 게이트 런타임 게이트 복사 Local completion audit 로컬 완료 점검 pnpm desktop:release-status owner-grouped release blockers owner 별 blocker</main>`;
}

function writeRouteWithChunk(root, relativePath, htmlBody, chunkBody) {
  const chunkPath = "_next/static/chunks/app-route.js";
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.mkdirSync(path.join(root, "_next/static/chunks"), { recursive: true });
  fs.writeFileSync(path.join(root, chunkPath), chunkBody, "utf8");
  fs.writeFileSync(
    filePath,
    `${htmlBody}<script src="/${chunkPath}"></script>`,
    "utf8",
  );
}

test("desktop smoke proves packaged locale routes and offline docs exist", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");

  for (const locale of ["en", "ko"]) {
    for (const route of ["/download", "/docs", "/ontology", "/topology", "/ontology/edit", "/ontology/insights"]) {
      touch(outDir, path.join(locale, route.replace(/^\/+/, ""), "index.html"));
    }
  }
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");
  touch(outDir, "docs-vault/ontology/capabilities/desktop-app-distribution.md");

  const report = evaluateDesktopSmoke({ outDir, routeTitles: {}, routeText: {} });

  assert.equal(report.ok, true);
  assert.equal(report.missing.length, 0);
  assert.ok(report.checks.some((check) => check.id === "root-entry"));
  assert.match(report.nextAction, /pnpm desktop:dev/);
});

test("desktop smoke checks ontology workbench route titles", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");

  const routes = {
    "en/ontology/index.html": "Ontology · Ontology Atlas",
    "ko/ontology/index.html": "온톨로지 · Ontology Atlas",
    "en/ontology/edit/index.html": "Edit Relations · Ontology Atlas",
    "ko/ontology/edit/index.html": "관계 편집 · Ontology Atlas",
    "en/ontology/insights/index.html": "Verify Graph · Ontology Atlas",
    "ko/ontology/insights/index.html": "그래프 검증 · Ontology Atlas",
  };
  for (const [relativePath, title] of Object.entries(routes)) {
    const filePath = path.join(outDir, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, htmlWithWorkbenchProof(title), "utf8");
  }

  const report = evaluateDesktopSmoke({
    outDir,
    routes: ["/ontology", "/ontology/edit", "/ontology/insights"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
  });

  assert.equal(report.ok, true);
  assert.equal(report.missing.length, 0);
  assert.ok(report.checks.some((check) => check.id === "route-title:en:/ontology/insights"));
  assert.ok(report.checks.some((check) => check.id === "route-title:ko:/ontology/insights"));
  assert.ok(report.checks.some((check) => check.id === "route-text:en:/ontology/insights"));
  assert.ok(report.checks.some((check) => check.id === "route-text:ko:/ontology/insights"));
});

test("desktop smoke checks route component chunk markers when requested", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");
  writeRouteWithChunk(
    outDir,
    "en/docs/index.html",
    htmlWithWorkbenchProof("Ontology Atlas"),
    [
      "sourceContract.filesLabel",
      "sourceContract.graphLabel",
      "sourceContract.agentLabel",
      "proofMarkers",
      "relation_name_parity",
      "pattern_walk/project_map",
      "sourceContract.agentCopyGate",
    ].join("\n"),
  );

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/docs"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
    routeChunkText: {
      "/docs": [
        "sourceContract.filesLabel",
        "sourceContract.graphLabel",
        "sourceContract.agentLabel",
        "proofMarkers",
        "relation_name_parity",
        "pattern_walk/project_map",
        "sourceContract.agentCopyGate",
      ],
    },
  });

  assert.equal(report.ok, true);
  assert.ok(report.checks.some((check) => check.id === "route-chunk-text:en:/docs"));
});

test("desktop smoke checks ontology browse component chunk markers when requested", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");
  writeRouteWithChunk(
    outDir,
    "en/ontology/index.html",
    htmlWithWorkbenchProof("Ontology · Ontology Atlas"),
    [
      "activeSlugLabel",
      "selectedHandleLabel",
      "selectAriaLabel",
      "business-first",
      "data-business-read-order",
      "outcome>domain>capability>element",
      "treeLoopAction",
      "graphDbLoopAction",
      "copySyncGate",
      "Business evidence gate",
    ].join("\n"),
  );

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/ontology"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
    routeChunkText: {
      "/ontology": [
        "activeSlugLabel",
        "selectedHandleLabel",
        "selectAriaLabel",
        "business-first",
        "data-business-read-order",
        "outcome>domain>capability>element",
        "treeLoopAction",
        "graphDbLoopAction",
        "copySyncGate",
        "Business evidence gate",
      ],
    },
  });

  assert.equal(report.ok, true);
  assert.ok(report.checks.some((check) => check.id === "route-chunk-text:en:/ontology"));
});

test("desktop smoke default ontology chunk contract requires executable business brief markers", () => {
  assert.ok(DESKTOP_SMOKE_ROUTE_CHUNK_TEXT["/ontology"].includes("copyBriefDescription"));
  assert.ok(DESKTOP_SMOKE_ROUTE_CHUNK_TEXT["/ontology"].includes("Business evidence gate"));

  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");
  writeRouteWithChunk(
    outDir,
    "en/ontology/index.html",
    htmlWithWorkbenchProof("Ontology · Ontology Atlas"),
    [
      "activeSlugLabel",
      "selectedHandleLabel",
      "selectAriaLabel",
      "business-first",
      "data-business-read-order",
    "outcome>domain>capability>element",
      "treeLoopAction",
      "graphDbLoopAction",
      "copySyncGate",
    ].join("\n"),
  );

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/ontology"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
    routeChunkText: DESKTOP_SMOKE_ROUTE_CHUNK_TEXT,
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-chunk-text:en:/ontology"],
  );
  assert.match(report.missing[0].details, /copyBriefDescription/);
  assert.match(report.missing[0].details, /Business evidence gate/);
});

test("desktop smoke default insights chunk contract requires reader graph operations", () => {
  assert.ok(DESKTOP_SMOKE_ROUTE_CHUNK_TEXT["/ontology/insights"].includes("facets + domain_matrix"));
  assert.ok(DESKTOP_SMOKE_ROUTE_CHUNK_TEXT["/ontology/insights"].includes("match_nodes + lineage"));
  assert.ok(DESKTOP_SMOKE_ROUTE_CHUNK_TEXT["/ontology/insights"].includes("agent_brief + health"));
  assert.ok(DESKTOP_SMOKE_ROUTE_CHUNK_TEXT["/ontology/insights"].includes("business_questions"));
  assert.ok(DESKTOP_SMOKE_ROUTE_CHUNK_TEXT["/ontology/insights"].includes("Business ontology decision brief"));
  assert.ok(DESKTOP_SMOKE_ROUTE_CHUNK_TEXT["/ontology/insights"].includes("Implementation evidence: report capability -> element match_edges"));
  assert.ok(DESKTOP_SMOKE_ROUTE_CHUNK_TEXT["/ontology/insights"].includes("Required answer shape"));
  assert.ok(DESKTOP_SMOKE_ROUTE_CHUNK_TEXT["/ontology/insights"].includes("Verdict: <proves / disproves / needs review before business claim>"));
  assert.ok(DESKTOP_SMOKE_ROUTE_CHUNK_TEXT["/ontology/insights"].includes("queryCockpitBusinessLaneAriaLabel"));
  assert.ok(DESKTOP_SMOKE_ROUTE_CHUNK_TEXT["/ontology/insights"].includes("business_questions · MCP"));
  assert.ok(DESKTOP_SMOKE_ROUTE_CHUNK_TEXT["/ontology/insights"].includes("facets + domain_matrix"));
  assert.ok(DESKTOP_SMOKE_ROUTE_CHUNK_TEXT["/ontology/insights"].includes("match_nodes + domain_matrix"));
  assert.ok(DESKTOP_SMOKE_ROUTE_CHUNK_TEXT["/ontology/insights"].includes("match_nodes capability"));
  assert.ok(DESKTOP_SMOKE_ROUTE_CHUNK_TEXT["/ontology/insights"].includes("capability -> element"));
  assert.ok(DESKTOP_SMOKE_ROUTE_CHUNK_TEXT["/ontology/insights"].includes("Business ontology question handoff"));
  assert.ok(DESKTOP_SMOKE_ROUTE_CHUNK_TEXT["/ontology/insights"].includes("Acceptance criteria"));
  assert.ok(DESKTOP_SMOKE_ROUTE_CHUNK_TEXT["/ontology/insights"].includes("Reject path-only, API-only, route-only, or command-only answers"));
  assert.ok(DESKTOP_SMOKE_ROUTE_CHUNK_TEXT["/ontology/insights"].includes("Question focus: Business outcome"));
  assert.ok(DESKTOP_SMOKE_ROUTE_CHUNK_TEXT["/ontology/insights"].includes("Question focus: Domain boundary"));
  assert.ok(DESKTOP_SMOKE_ROUTE_CHUNK_TEXT["/ontology/insights"].includes("Question focus: Capability claim"));
  assert.ok(DESKTOP_SMOKE_ROUTE_CHUNK_TEXT["/ontology/insights"].includes("Question focus: Implementation evidence"));
  assert.ok(DESKTOP_SMOKE_ROUTE_CHUNK_TEXT["/ontology/insights"].includes("collaboratorBusinessExtractionChecks"));
  assert.ok(DESKTOP_SMOKE_ROUTE_CHUNK_TEXT["/ontology/insights"].includes("What business outcome should this ontology explain or improve?"));
  assert.ok(DESKTOP_SMOKE_ROUTE_CHUNK_TEXT["/ontology/insights"].includes("Which business/product domain boundary does this code change?"));

  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");
  writeRouteWithChunk(
    outDir,
    "en/ontology/insights/index.html",
    htmlWithWorkbenchProof("Verify Graph · Ontology Atlas"),
    [
      "queryCockpitContractsAriaLabel",
      "queryCockpitEvidenceAriaLabel",
      "queryCockpitCopyRuntimeGate",
      "focused_blast_radius",
      "relation_name_parity",
      "pattern_walk/project_map",
    ].join("\n"),
  );

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/ontology/insights"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
    routeChunkText: DESKTOP_SMOKE_ROUTE_CHUNK_TEXT,
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-chunk-text:en:/ontology/insights"],
  );
  assert.match(report.missing[0].details, /facets \+ domain_matrix/);
  assert.match(report.missing[0].details, /match_nodes \+ lineage/);
  assert.match(report.missing[0].details, /agent_brief \+ health/);
  assert.match(report.missing[0].details, /business_questions/);
  assert.match(report.missing[0].details, /Business ontology decision brief/);
  assert.match(report.missing[0].details, /queryCockpitBusinessLaneAriaLabel/);
  assert.match(report.missing[0].details, /business_questions · MCP/);
  assert.match(report.missing[0].details, /match_nodes \+ domain_matrix/);
  assert.match(report.missing[0].details, /Business ontology question handoff/);
  assert.match(report.missing[0].details, /Question focus: Domain boundary/);
  assert.match(report.missing[0].details, /capability -> element match_edges/);
  assert.match(report.missing[0].details, /collaboratorBusinessExtractionChecks/);
  assert.match(report.missing[0].details, /business\/product domain boundary/);
  assert.match(report.missing[0].details, /capability claim/);
  assert.match(report.missing[0].details, /implementation evidence proves or disproves/);
});

test("desktop smoke fails when ontology browse graph-handle row contract is absent", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");
  writeRouteWithChunk(
    outDir,
    "en/ontology/index.html",
    htmlWithWorkbenchProof("Ontology · Ontology Atlas"),
    [
      "activeSlugLabel",
      "treeLoopAction",
      "graphDbLoopAction",
      "copySyncGate",
    ].join("\n"),
  );

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/ontology"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
    routeChunkText: {
      "/ontology": [
        "activeSlugLabel",
        "selectedHandleLabel",
        "selectAriaLabel",
        "treeLoopAction",
        "graphDbLoopAction",
        "copySyncGate",
      ],
    },
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-chunk-text:en:/ontology"],
  );
  assert.match(report.missing[0].details, /selectedHandleLabel/);
  assert.match(report.missing[0].details, /selectAriaLabel/);
});

test("desktop smoke fails when route component chunk contract is absent", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");
  writeRouteWithChunk(
    outDir,
    "en/docs/index.html",
    htmlWithWorkbenchProof("Ontology Atlas"),
    "sourceContract.filesLabel\nsourceContract.graphLabel",
  );

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/docs"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
    routeChunkText: {
      "/docs": [
        "sourceContract.filesLabel",
        "sourceContract.graphLabel",
        "sourceContract.agentLabel",
        "proofMarkers",
        "relation_name_parity",
        "pattern_walk/project_map",
        "sourceContract.agentCopyGate",
      ],
    },
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-chunk-text:en:/docs"],
  );
  assert.match(report.missing[0].details, /sourceContract.agentLabel/);
  assert.match(report.missing[0].details, /sourceContract.agentCopyGate/);
});

test("desktop smoke fails when source vault graph gate copy action is absent", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");

  const filePath = path.join(outDir, "en/docs/index.html");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    "<!doctype html><main>Source Vault documents Files Graph Agent relation_name_parity pattern_walk/project_map</main>",
    "utf8",
  );

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/docs"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-text:en:/docs"],
  );
  assert.match(report.missing[0].details, /Copy graph gate/);
});

test("desktop smoke fails when source vault record count language is absent", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");

  const filePath = path.join(outDir, "en/docs/index.html");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    "<!doctype html><main>Source Vault Files Graph Agent local markdown frontmatter MCP runtime gate relation_name_parity pattern_walk/project_map Copy graph gate</main>",
    "utf8",
  );

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/docs"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-text:en:/docs"],
  );
  assert.match(report.missing[0].details, /documents/);
});

test("desktop smoke fails when source vault structural replay proof is absent", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");

  const filePath = path.join(outDir, "en/docs/index.html");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    "<!doctype html><main>Source Vault documents Files Graph Agent local markdown frontmatter MCP runtime gate Copy graph gate</main>",
    "utf8",
  );

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/docs"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-text:en:/docs"],
  );
  assert.match(report.missing[0].details, /relation_name_parity/);
  assert.match(report.missing[0].details, /pattern_walk\/project_map/);
});

test("desktop smoke fails when source vault execution contract is absent", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");

  const filePath = path.join(outDir, "en/docs/index.html");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    "<!doctype html><main>Source Vault documents Files Graph Agent relation_name_parity pattern_walk/project_map Copy graph gate</main>",
    "utf8",
  );

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/docs"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-text:en:/docs"],
  );
  assert.match(report.missing[0].details, /local markdown/);
  assert.match(report.missing[0].details, /frontmatter/);
  assert.match(report.missing[0].details, /MCP/);
  assert.match(report.missing[0].details, /runtime gate/);
});

test("desktop smoke default download contract requires the agent access install step", () => {
  assert.ok(DESKTOP_SMOKE_ROUTE_TEXT["en:/download"].includes("Verify agent access"));
  assert.ok(DESKTOP_SMOKE_ROUTE_TEXT["en:/download"].includes("reads and writes the same vault over MCP"));
  assert.ok(DESKTOP_SMOKE_ROUTE_TEXT["ko:/download"].includes("AI agent 접근 확인"));
  assert.ok(DESKTOP_SMOKE_ROUTE_TEXT["ko:/download"].includes("같은 vault 를 MCP 로 읽고 쓰는지 확인"));

  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");

  const filePath = path.join(outDir, "en/download/index.html");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    "<!doctype html><main>macOS app download Open macOS releases Obsidian-style direct download</main>",
    "utf8",
  );

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/download"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-text:en:/download"],
  );
  assert.match(report.missing[0].details, /Verify agent access/);
  assert.match(report.missing[0].details, /reads and writes the same vault over MCP/);
});

test("desktop smoke fails when an ontology route title is stale", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");
  touch(outDir, "en/ontology/insights/index.html");

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/ontology/insights"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
    routeText: {},
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-title:en:/ontology/insights"],
  );
});

test("desktop smoke fails when ontology workbench proof copy is absent", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");

  const filePath = path.join(outDir, "en/ontology/edit/index.html");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "<!doctype html><title>Edit Relations · Ontology Atlas</title>", "utf8");

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/ontology/edit"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-text:en:/ontology/edit"],
  );
});

test("desktop smoke fails when builder active slug proof handle is absent", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");

  const filePath = path.join(outDir, "ko/ontology/edit/index.html");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    "<!doctype html><title>관계 편집 · Ontology Atlas</title><main>Graph DB proof Browse Write Query dogfood:graph-db</main>",
    "utf8",
  );

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["ko"],
    routes: ["/ontology/edit"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-text:ko:/ontology/edit"],
  );
  assert.match(report.missing[0].details, /활성 slug/);
});

test("desktop smoke fails when builder collapsed save proof controls are absent", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");

  const filePath = path.join(outDir, "en/ontology/edit/index.html");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    "<!doctype html><title>Edit Relations · Ontology Atlas</title><main>Graph DB proof Browse Write Query dogfood:graph-db focused blast_radius active slug Copy guard</main>",
    "utf8",
  );

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/ontology/edit"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-text:en:/ontology/edit"],
  );
  assert.match(report.missing[0].details, /Save status/);
  assert.match(report.missing[0].details, /Layout/);
  assert.match(report.missing[0].details, /Re-arrange/);
});

test("desktop smoke fails when builder popover proof chips are absent", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");

  const filePath = path.join(outDir, "en/ontology/edit/index.html");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    "<!doctype html><title>Edit Relations · Ontology Atlas</title><main>Save status Layout Re-arrange Graph DB proof Browse Write Query dogfood:graph-db runtime replay focused blast_radius active slug Copy guard Copy sync gate</main>",
    "utf8",
  );

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/ontology/edit"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-text:en:/ontology/edit"],
  );
  assert.match(report.missing[0].details, /local markdown/);
  assert.match(report.missing[0].details, /canvas draft/);
  assert.match(report.missing[0].details, /relation guard/);
  assert.match(report.missing[0].details, /graph db \+ health/);
});

test("desktop smoke fails when builder saved-anchor focus contract is absent", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");

  const filePath = path.join(outDir, "en/ontology/edit/index.html");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    "<!doctype html><title>Edit Relations · Ontology Atlas</title><main>Save status Layout Re-arrange local markdown canvas draft not on disk until save relation guard graph db + health Graph DB proof Browse Write Query dogfood:graph-db runtime replay focused blast_radius active slug Copy guard Copy sync gate</main>",
    "utf8",
  );

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/ontology/edit"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-text:en:/ontology/edit"],
  );
  assert.match(report.missing[0].details, /pick focus concept/);
  assert.match(report.missing[0].details, /Focus saved concept/);
});

test("desktop smoke fails when builder saved-anchor component contract is absent", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");
  writeRouteWithChunk(
    outDir,
    "en/ontology/edit/index.html",
    htmlWithWorkbenchProof("Edit Relations · Ontology Atlas"),
    [
      "proofChipSelected",
      "syncCopyText",
      "copySyncGate",
      "activeFocus",
    ].join("\n"),
  );

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/ontology/edit"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
    routeChunkText: {
      "/ontology/edit": [
        "Saved concept list",
        "anchorAriaLabel",
        "activeFocusAriaLabel",
        "proofChipSelected",
        "syncCopyText",
        "copySyncGate",
        "activeFocus",
      ],
    },
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-chunk-text:en:/ontology/edit"],
  );
  assert.match(report.missing[0].details, /Saved concept list/);
  assert.match(report.missing[0].details, /anchorAriaLabel/);
  assert.match(report.missing[0].details, /activeFocusAriaLabel/);
});

test("desktop smoke fails when browse canonical slug proof handle is absent", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");

  const filePath = path.join(outDir, "en/ontology/index.html");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    "<!doctype html><title>Ontology · Ontology Atlas</title><main>Graph DB proof Browse Write Query dogfood:graph-db</main>",
    "utf8",
  );

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/ontology"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-text:en:/ontology"],
  );
  assert.match(report.missing[0].details, /canonical slug/);
});

test("desktop smoke fails when browse hierarchy status strip is absent", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");

  const filePath = path.join(outDir, "en/ontology/index.html");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    "<!doctype html><title>Ontology · Ontology Atlas</title><main>Graph DB proof Browse Write Query dogfood:graph-db focused blast_radius canonical slug Copy runtime gate</main>",
    "utf8",
  );

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/ontology"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-text:en:/ontology"],
  );
  assert.match(report.missing[0].details, /Concept map/);
  assert.match(report.missing[0].details, /concepts/);
  assert.match(report.missing[0].details, /relations/);
});

test("desktop smoke fails when browse workbench loop order and proof chips are absent", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");

  const filePath = path.join(outDir, "en/ontology/index.html");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    "<!doctype html><title>Ontology · Ontology Atlas</title><main>Concept map concepts relations docs hidden Hierarchy notes Graph DB proof Browse Write Query dogfood:graph-db focused blast_radius canonical slug Copy runtime gate</main>",
    "utf8",
  );

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/ontology"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-text:en:/ontology"],
  );
  assert.match(report.missing[0].details, /Browse/);
  assert.match(report.missing[0].details, /Write/);
  assert.match(report.missing[0].details, /Query/);
  assert.match(report.missing[0].details, /tree projection/);
  assert.match(report.missing[0].details, /frontmatter write/);
});

test("desktop smoke fails when browse runtime gate copy action is absent", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");

  const filePath = path.join(outDir, "en/ontology/index.html");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    "<!doctype html><title>Ontology · Ontology Atlas</title><main>Graph DB proof Browse Write Query dogfood:graph-db canonical slug</main>",
    "utf8",
  );

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/ontology"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-text:en:/ontology"],
  );
  assert.match(report.missing[0].details, /Copy runtime gate/);
});

test("desktop smoke fails when browse runtime gate does not name focused blast-radius replay", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");

  const filePath = path.join(outDir, "en/ontology/index.html");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    "<!doctype html><title>Ontology · Ontology Atlas</title><main>Graph DB proof Browse Write Query dogfood:graph-db canonical slug Copy runtime gate</main>",
    "utf8",
  );

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/ontology"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-text:en:/ontology"],
  );
  assert.match(report.missing[0].details, /focused blast_radius/);
});

test("desktop smoke fails when browse business ontology lens contract is absent", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");
  writeRouteWithChunk(
    outDir,
    "en/ontology/index.html",
    htmlWithWorkbenchProof("Ontology · Ontology Atlas"),
    [
      "activeSlugLabel",
      "selectedHandleLabel",
      "selectAriaLabel",
      "treeLoopAction",
      "graphDbLoopAction",
      "copySyncGate",
    ].join("\n"),
  );

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/ontology"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
    routeChunkText: {
      "/ontology": [
        "activeSlugLabel",
        "selectedHandleLabel",
        "selectAriaLabel",
        "business-first",
        "data-business-read-order",
        "outcome>domain>capability>element",
        "treeLoopAction",
        "graphDbLoopAction",
        "copySyncGate",
      ],
    },
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-chunk-text:en:/ontology"],
  );
  assert.match(report.missing[0].details, /business-first/);
  assert.match(report.missing[0].details, /data-business-read-order/);
  assert.match(report.missing[0].details, /outcome>domain>capability>element/);
});

test("desktop smoke fails when builder guard copy action is absent", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");

  const filePath = path.join(outDir, "en/ontology/edit/index.html");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    "<!doctype html><title>Edit Relations · Ontology Atlas</title><main>Graph DB proof Browse Write Query dogfood:graph-db active slug</main>",
    "utf8",
  );

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/ontology/edit"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-text:en:/ontology/edit"],
  );
  assert.match(report.missing[0].details, /Copy guard/);
});

test("desktop smoke fails when builder sync gate copy action is absent", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");

  const filePath = path.join(outDir, "en/ontology/edit/index.html");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    "<!doctype html><title>Edit Relations · Ontology Atlas</title><main>Save status Layout Auto layout Graph DB proof Browse Write Query dogfood:graph-db focused blast_radius active slug Copy guard</main>",
    "utf8",
  );

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/ontology/edit"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-text:en:/ontology/edit"],
  );
  assert.match(report.missing[0].details, /Copy sync gate/);
});

test("desktop smoke fails when builder focused blast-radius replay proof is absent", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");

  const filePath = path.join(outDir, "en/ontology/edit/index.html");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    "<!doctype html><title>Edit Relations · Ontology Atlas</title><main>Graph DB proof Browse Write Query dogfood:graph-db active slug Copy guard</main>",
    "utf8",
  );

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/ontology/edit"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-text:en:/ontology/edit"],
  );
  assert.match(report.missing[0].details, /focused blast_radius/);
});

test("desktop smoke fails when builder runtime replay proof is absent", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");

  const filePath = path.join(outDir, "en/ontology/edit/index.html");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    "<!doctype html><title>Edit Relations · Ontology Atlas</title><main>Save status Layout Auto layout Graph DB proof Browse Write Query dogfood:graph-db focused blast_radius active slug Copy guard Copy sync gate</main>",
    "utf8",
  );

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/ontology/edit"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-text:en:/ontology/edit"],
  );
  assert.match(report.missing[0].details, /runtime replay/);
});

test("desktop smoke fails when insights runtime gate copy action is absent", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");

  const filePath = path.join(outDir, "en/ontology/insights/index.html");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    "<!doctype html><title>Verify Graph · Ontology Atlas</title><main>Graph DB proof Browse Write Query dogfood:graph-db</main>",
    "utf8",
  );

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/ontology/insights"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-text:en:/ontology/insights"],
  );
  assert.match(report.missing[0].details, /Copy runtime gate/);
});

test("desktop smoke fails when insights query cockpit contract is absent", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");

  const filePath = path.join(outDir, "en/ontology/insights/index.html");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    "<!doctype html><title>Verify Graph · Ontology Atlas</title><main>Graph DB proof Browse Write Query dogfood:graph-db focused blast_radius Copy runtime gate</main>",
    "utf8",
  );

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/ontology/insights"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-text:en:/ontology/insights"],
  );
  assert.match(report.missing[0].details, /Readiness/);
  assert.match(report.missing[0].details, /self-check \+ health gate/);
});

test("desktop smoke fails when insights executable query proof is absent", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");

  const filePath = path.join(outDir, "en/ontology/insights/index.html");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    "<!doctype html><title>Verify Graph · Ontology Atlas</title><main>Query cockpit Readiness Pack MCP CLI self-check + health gate Graph DB proof Browse Write Query dogfood:graph-db focused blast_radius Copy runtime gate</main>",
    "utf8",
  );

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/ontology/insights"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-text:en:/ontology/insights"],
  );
  assert.match(report.missing[0].details, /Run order/);
  assert.match(report.missing[0].details, /Payloads/);
  assert.match(report.missing[0].details, /CLI fallback/);
  assert.match(report.missing[0].details, /Scan contract/);
  assert.match(report.missing[0].details, /Path contract/);
  assert.match(report.missing[0].details, /setup gate/);
});

test("desktop smoke fails when insights runtime gate does not name focused blast-radius replay", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");

  const filePath = path.join(outDir, "en/ontology/insights/index.html");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    "<!doctype html><title>Verify Graph · Ontology Atlas</title><main>Graph DB proof Browse Write Query dogfood:graph-db Copy runtime gate</main>",
    "utf8",
  );

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/ontology/insights"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route-text:en:/ontology/insights"],
  );
  assert.match(report.missing[0].details, /focused blast_radius/);
});

test("desktop smoke reports the exact missing packaged route", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "index.html");
  touch(outDir, "en/docs/index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/docs", "/topology"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
    routeText: {},
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["route:en:/topology"],
  );
  assert.match(report.nextAction, /pnpm build/);
});

test("desktop smoke reports the exact missing Tauri app root entry", () => {
  const outDir = makeOutDir();
  fs.mkdirSync(path.join(outDir, "_next"), { recursive: true });
  touch(outDir, "en/docs/index.html");
  touch(outDir, "docs-vault/DESKTOP-MACOS.md");

  const report = evaluateDesktopSmoke({
    outDir,
    locales: ["en"],
    routes: ["/docs"],
    docs: ["docs-vault/DESKTOP-MACOS.md"],
    routeText: {},
  });

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.missing.map((check) => check.id),
    ["root-entry"],
  );
});
