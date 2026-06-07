#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

export const DESKTOP_SMOKE_LOCALES = ["en", "ko"];
export const DESKTOP_SMOKE_ROUTES = [
  "/download",
  "/docs",
  "/ontology",
  "/topology",
  "/ontology/edit",
  "/ontology/insights",
];
export const DESKTOP_SMOKE_ROOT_ENTRY = "index.html";
export const DESKTOP_SMOKE_DOCS = [
  "docs-vault/DESKTOP-MACOS.md",
  "docs-vault/ontology/capabilities/desktop-app-distribution.md",
];
export const DESKTOP_SMOKE_ROUTE_TITLES = {
  "en:/ontology": "Ontology · Ontology Atlas",
  "ko:/ontology": "온톨로지 · Ontology Atlas",
  "en:/ontology/edit": "Edit Relations · Ontology Atlas",
  "ko:/ontology/edit": "관계 편집 · Ontology Atlas",
  "en:/ontology/insights": "Verify Graph · Ontology Atlas",
  "ko:/ontology/insights": "그래프 검증 · Ontology Atlas",
};
export const DESKTOP_SMOKE_ROUTE_TEXT = {
  "en:/download": [
    "macOS app download",
    "Open macOS releases",
    "Obsidian-style direct download",
    "Local completion audit",
    "pnpm desktop:release-status",
    "owner-grouped release blockers",
    "Verify agent access",
    "reads and writes the same vault over MCP",
    "CLI fallback",
  ],
  "ko:/download": [
    "macOS 앱 다운로드",
    "macOS 릴리스 열기",
    "최신 stable GitHub Release",
    "로컬 완료 점검",
    "pnpm desktop:release-status",
    "owner 별 blocker",
    "AI agent 접근 확인",
    "같은 vault 를 MCP 로 읽고 쓰는지 확인",
    "CLI fallback",
  ],
  "en:/docs": ["Source Vault", "documents", "Guides", "Ontology nodes", "Files", "Graph", "Agent", "local markdown", "frontmatter", "MCP", "runtime gate", "relation_name_parity", "pattern_walk/project_map", "Copy graph gate"],
  "ko:/docs": ["문서함", "문서", "가이드 문서", "온톨로지 노드", "문서 파일", "그래프", "에이전트", "마크다운", "frontmatter", "MCP", "런타임 재생", "relation_name_parity", "pattern_walk/project_map", "그래프 점검 복사"],
  "en:/ontology": ["Concept map", "concepts", "relations", "Graph DB proof", "Browse", "Write", "Query", "tree projection", "frontmatter write", "dogfood:graph-db", "focused blast_radius", "relation_name_parity", "pattern_walk/project_map", "canonical slug", "graph handle", "Copy sync gate"],
  "ko:/ontology": ["개념 둘러보기", "개념", "관계", "둘러보기", "작성", "검증", "문서함 저장", "dogfood:graph-db", "focused blast_radius", "relation_name_parity", "pattern_walk/project_map", "선택한 개념", "선택 기준", "동기화 점검 복사"],
  "en:/ontology/edit": ["Save status", "Layout", "Re-arrange", "local markdown", "canvas draft", "not on disk until save", "relation guard", "graph db + health", "Graph DB proof", "Browse", "Write", "Query", "dogfood:graph-db", "runtime replay", "focused blast_radius", "relation_name_parity", "pattern_walk/project_map", "pick focus concept", "active slug", "Focus saved concept", "Copy guard", "Copy sync gate"],
  "ko:/ontology/edit": ["저장 상태", "배치", "자동 정렬", "로컬 문서", "캔버스 임시 변경", "저장 전까지 디스크 아님", "관계 저장 점검", "그래프 DB 점검", "그래프 검증", "둘러보기", "작성", "검증", "dogfood:graph-db", "런타임 재생", "focused blast_radius", "relation_name_parity", "pattern_walk/project_map", "기준 개념 먼저", "활성 slug", "저장된 개념 포커스", "점검 묶음 복사", "동기화 점검 복사"],
  "en:/ontology/insights": ["AI and terminal checks", "Evidence check", "Outcome → domain → capability → implementation evidence", "Map terms and boundaries", "Link capabilities to evidence", "Check summary and status", "Readiness", "Check order", "AI checks", "Terminal checks", "Scan criteria", "Path criteria", "setup gate", "basic status check", "Decision questions", "Accept if outcome", "evidence rows", "Boundary", "Claim", "Evidence", "Graph DB proof", "Browse", "Write", "Query", "dogfood:graph-db", "focused blast_radius", "relation_name_parity", "pattern_walk/project_map", "Copy runtime check", "Copy business brief"],
  "ko:/ontology/insights": ["AI와 터미널 확인", "근거 확인", "결과 → 도메인 → 역량 → 구현 근거", "분포와 경계 보기", "역량과 근거 연결", "요약과 상태 확인", "연결·검증", "확인 순서 보기", "필요할 때 실행 명령 보기", "준비도", "확인 순서", "에이전트 그래프 준비도", "수리 프롬프트 복사", "AI 확인", "터미널 확인", "결정 질문", "통과입니다", "근거 행", "경계", "주장", "근거", "AI에게 넘기기 전 확인", "탐색 판단 기준", "경로 판단 기준", "설정 점검", "기본 상태 점검", "그래프 검증", "둘러보기", "작성", "검증", "dogfood:graph-db", "focused blast_radius", "relation_name_parity", "pattern_walk/project_map", "런타임 점검 복사", "비즈니스 브리프 복사"],
};
export const DESKTOP_SMOKE_ROUTE_CHUNK_TEXT = {
  "/docs": [
    "sourceContract.filesLabel",
    "sourceContract.graphLabel",
    "sourceContract.agentLabel",
    "proofMarkers",
    "relation_name_parity",
    "pattern_walk/project_map",
    "sourceContract.agentCopyGate",
  ],
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
    "copyBriefDescription",
    "Business evidence gate",
  ],
  "/ontology/edit": [
    "Saved concept list",
    "anchorAriaLabel",
    "activeFocusAriaLabel",
    "proofChipSelected",
    "syncCopyText",
    "copySyncGate",
    "activeFocus",
  ],
  "/ontology/insights": [
    "queryCockpitContractsAriaLabel",
    "queryCockpitEvidenceAriaLabel",
    "queryCockpitCopyRuntimeGate",
    "facets + domain_matrix",
    "match_nodes + lineage",
    "blast_radius + impact",
    "node_profile + reachability",
    "agent_brief + health",
    "business_questions",
    "Business ontology decision brief",
    "Implementation evidence: report capability -> element match_edges",
    "Required answer shape",
    "Verdict: <proves / disproves / needs review before business claim>",
    "queryCockpitBusinessLaneAriaLabel",
    "AI check pack",
    "Outcome distribution and domain boundary",
    "Product boundary and links",
    "Capability claim candidates",
    "Implementation evidence links",
    "What business outcome should this ontology explain or improve?",
    "match_nodes + domain_matrix",
    "match_nodes capability",
    "capability -> element",
    "queryCockpitBusinessCopyQuestion",
    "Business ontology question handoff",
    "Acceptance criteria",
    "Reject path-only, API-only, route-only, or command-only answers",
    "focused_blast_radius",
    "relation_name_parity",
    "pattern_walk/project_map",
    "collaboratorBusinessExtractionChecks",
    "Which business/product domain boundary does this code change?",
    "What capability claim can a planner, marketer, or leader discuss?",
    "Which implementation evidence proves or disproves that capability?",
  ],
};

function routeIndexPath({ locale, route }) {
  const cleanRoute = route.replace(/^\/+|\/+$/g, "");
  return path.join(locale, cleanRoute, "index.html");
}

function existsUnder(root, relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function readTextUnder(root, relativePath) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf8");
}

function hasTitle(html, title) {
  return html.includes(`<title>${title}</title>`);
}

function hasAllText(html, fragments) {
  return fragments.every((fragment) => html.includes(fragment));
}

function scriptChunkPathsFromHtml(html) {
  return Array.from(html.matchAll(/\bsrc=["']([^"']*_next\/static\/chunks\/[^"']+\.js)["']/g))
    .map((match) => match[1].replace(/^\//, ""))
    .filter((value, index, array) => array.indexOf(value) === index);
}

function readRouteChunkText(outDir, html) {
  return scriptChunkPathsFromHtml(html)
    .map((chunkPath) => readTextUnder(outDir, chunkPath) ?? "")
    .join("\n");
}

export function evaluateDesktopSmoke({
  outDir = path.join(process.cwd(), "out"),
  locales = DESKTOP_SMOKE_LOCALES,
  routes = DESKTOP_SMOKE_ROUTES,
  docs = DESKTOP_SMOKE_DOCS,
  routeTitles = DESKTOP_SMOKE_ROUTE_TITLES,
  routeText = DESKTOP_SMOKE_ROUTE_TEXT,
  routeChunkText = {},
} = {}) {
  const checks = [];
  const addCheck = (id, label, ok, details = "") => {
    checks.push({ id, label, ok, details });
  };

  addCheck("out-dir", "Next.js static export exists", fs.existsSync(outDir), outDir);
  addCheck("_next", "packaged app assets exist", existsUnder(outDir, "_next"), "_next");
  addCheck(
    "root-entry",
    "Tauri app root entry exists",
    existsUnder(outDir, DESKTOP_SMOKE_ROOT_ENTRY),
    DESKTOP_SMOKE_ROOT_ENTRY,
  );

  for (const locale of locales) {
    for (const route of routes) {
      const relativePath = routeIndexPath({ locale, route });
      const exists = existsUnder(outDir, relativePath);
      addCheck(
        `route:${locale}:${route}`,
        `${locale}${route} static route exists`,
        exists,
        relativePath,
      );
      const expectedTitle = routeTitles[`${locale}:${route}`];
      if (expectedTitle) {
        const html = readTextUnder(outDir, relativePath);
        addCheck(
          `route-title:${locale}:${route}`,
          `${locale}${route} static route title matches`,
          typeof html === "string" && hasTitle(html, expectedTitle),
          expectedTitle,
        );
      }
      const expectedText = routeText[`${locale}:${route}`] ?? routeText[route];
      if (expectedText) {
        const html = readTextUnder(outDir, relativePath);
        addCheck(
          `route-text:${locale}:${route}`,
          `${locale}${route} workbench proof copy is bundled`,
          typeof html === "string" && hasAllText(html, expectedText),
          expectedText.join(", "),
        );
      }
      const expectedChunkText =
        routeChunkText[`${locale}:${route}`] ?? routeChunkText[route];
      if (expectedChunkText) {
        const html = readTextUnder(outDir, relativePath);
        const chunkText = typeof html === "string" ? readRouteChunkText(outDir, html) : "";
        addCheck(
          `route-chunk-text:${locale}:${route}`,
          `${locale}${route} workbench component contract is bundled`,
          typeof html === "string" && hasAllText(chunkText, expectedChunkText),
          expectedChunkText.join(", "),
        );
      }
    }
  }

  for (const doc of docs) {
    addCheck(`doc:${doc}`, `${doc} is bundled for offline docs`, existsUnder(outDir, doc), doc);
  }

  const missing = checks.filter((check) => !check.ok);
  return {
    ok: missing.length === 0,
    checks,
    missing,
    nextAction:
      missing.length === 0
        ? "Run pnpm desktop:dev or pnpm desktop:build, then smoke the same routes inside the .app shell."
        : "Run pnpm build before pnpm desktop:smoke so out/ contains the static desktop payload.",
  };
}

function renderDesktopSmoke(report) {
  const lines = ["[desktop-smoke] packaged static route smoke"];
  for (const check of report.checks) {
    lines.push(`${check.ok ? "✓" : "✗"} ${check.label}${check.details ? ` (${check.details})` : ""}`);
  }
  lines.push(`[desktop-smoke] ${report.ok ? "ready" : "blocked"}: ${report.nextAction}`);
  return lines.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = evaluateDesktopSmoke({
    routeChunkText: DESKTOP_SMOKE_ROUTE_CHUNK_TEXT,
  });
  console.log(renderDesktopSmoke(report));
  if (!report.ok) process.exitCode = 1;
}
