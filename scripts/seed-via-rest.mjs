#!/usr/bin/env node
/**
 * 시드 데이터를 Firestore REST API로 일괄 주입하는 부트스트랩 스크립트.
 *
 * - Firebase CLI가 저장한 access_token을 재사용 (~/.config/configstore/firebase-tools.json)
 * - 브라우저 로그인·서비스 계정 키 없이 동작
 * - 정식 시드 스크립트는 Phase 6에서 firebase-admin SDK로 교체 예정
 *
 * 사용:
 *   node scripts/seed-via-rest.mjs
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PROJECT_ID = "oh-my-ontology";
const CREDS_PATH = path.join(
  os.homedir(),
  ".config/configstore/firebase-tools.json",
);

const SEED_CATEGORIES = [
  {
    id: "in-progress",
    label: "작업중",
    labelEn: "In Progress",
    order: 0,
    position: { x: 0, y: 0 },
    size: { width: 1600, height: 1300 },
    radius: 520,
    borderStyle: "underline",
  },
  {
    id: "planned",
    label: "예정",
    labelEn: "Planned",
    order: 1,
    position: { x: -1350, y: 0 },
    size: { width: 800, height: 1000 },
    radius: 320,
    borderStyle: "dashed",
  },
];

const SEED_STATUSES = [
  {
    id: "idea",
    label: "아이디어",
    labelEn: "Idea",
    order: 0,
    dotColor: "neutral",
  },
  {
    id: "planning",
    label: "기획",
    labelEn: "Planning",
    order: 1,
    dotColor: "warning",
  },
  {
    id: "developing",
    label: "개발중",
    labelEn: "Developing",
    order: 2,
    dotColor: "warning",
  },
  {
    id: "deploy-ready",
    label: "배포준비",
    labelEn: "Deploy Ready",
    order: 3,
    dotColor: "warning",
  },
  {
    id: "completed",
    label: "개발완료",
    labelEn: "Completed",
    order: 4,
    dotColor: "success",
  },
  {
    id: "live",
    label: "운영중",
    labelEn: "Live",
    order: 5,
    dotColor: "success",
  },
  {
    id: "paused",
    label: "일시중단",
    labelEn: "Paused",
    order: 6,
    dotColor: "paused",
  },
  {
    id: "deprecated",
    label: "중단",
    labelEn: "Deprecated",
    order: 7,
    dotColor: "paused",
  },
];

const SEED_PROJECTS = [
  // 허브
  {
    slug: "iam",
    name: "IAM",
    nameEn: "Integrated Access Management",
    category: "in-progress",
    status: "deploy-ready",
    description:
      "통합 인증 서비스. 모든 아슬란 프로젝트의 인증이 여기를 거친다.",
    tags: ["Auth", "Hub"],
    stack: ["Next.js", "Firebase Auth"],
    isHub: true,
    position: { x: -240, y: 0 },
  },
  {
    slug: "reactor",
    name: "Reactor",
    nameEn: "Reactor",
    category: "in-progress",
    status: "deploy-ready",
    description: "AI Agent. 추후 모든 프로젝트에 내장 예정.",
    tags: ["AI", "Agent", "Hub"],
    stack: ["RAG", "Python"],
    isHub: true,
    position: { x: 240, y: 0 },
  },
  // 작업중
  {
    slug: "sample",
    name: "Sample",
    category: "in-progress",
    status: "developing",
    description: "아슬란의 프로젝트 토폴로지 지도 (이 사이트).",
    tags: ["Portfolio", "Visualization"],
    stack: ["Next.js", "Sigma.js", "Firebase"],
    dependencies: ["iam"],
    position: { x: -480, y: -160 },
  },
  {
    slug: "demo-verse",
    name: "Demo Console",
    category: "in-progress",
    status: "deploy-ready",
    description: "AI끼리 소통하는 플랫폼.",
    tags: ["AI", "Multi-agent"],
    dependencies: ["reactor", "iam"],
    position: { x: 480, y: -160 },
  },
  {
    slug: "sample-news",
    name: "뉴스 클리핑 (Sample News)",
    category: "in-progress",
    status: "deploy-ready",
    description: "사내용 뉴스 수집·요약 서비스.",
    tags: ["Content"],
    dependencies: ["iam", "reactor"],
    position: { x: -320, y: -280 },
  },
  {
    slug: "sample-app",
    name: "커뮤니티 (Sample App)",
    category: "in-progress",
    status: "completed",
    description: "사내 커뮤니티.",
    tags: ["Community", "Internal"],
    dependencies: ["iam"],
    position: { x: 0, y: 280 },
  },
  {
    slug: "pick",
    name: "Sample Live Lecture (Sample)",
    category: "in-progress",
    status: "developing",
    description:
      "실시간 강의 참여 플랫폼 — 20+ 참여 도구와 AI 질문 생성·요약·조교·심사·수업 인사이트까지.",
    tags: ["Education", "Realtime", "AI"],
    dependencies: ["iam"],
    position: { x: 320, y: -280 },
  },
  {
    slug: "atlassian-mcp",
    name: "Sample MCP A",
    category: "in-progress",
    status: "developing",
    description: "Atlassian 제품군 MCP 서버.",
    tags: ["MCP", "Integration"],
    stack: ["MCP"],
    dependencies: ["reactor", "iam"],
    position: { x: 480, y: 160 },
  },
  {
    slug: "reactor-web",
    name: "Demo Reactor Web",
    nameEn: "Demo Demo Reactor Web",
    category: "in-progress",
    status: "developing",
    description: "Demo Reactor를 위한 웹 채팅 UI이자 운영 워크스페이스.",
    tags: ["AI", "Frontend", "Console"],
    stack: ["React", "Vite", "TypeScript", "TanStack Query"],
    links: [
      {
        label: "GitHub",
        url: "https://github.com/wlsdks/oh-my-ontology",
      },
    ],
    dependencies: ["reactor"],
    position: { x: 620, y: -180 },
  },
  {
    slug: "swagger-mcp",
    name: "Sample MCP C",
    category: "in-progress",
    status: "developing",
    description: "OpenAPI/Swagger 문서 MCP 서버.",
    tags: ["MCP", "API"],
    stack: ["MCP"],
    dependencies: ["reactor"],
    position: { x: 560, y: 0 },
  },
  {
    slug: "domain-knowledge-mcp",
    name: "Sample MCP D",
    category: "planned",
    status: "planning",
    description: "도메인 지식 베이스 MCP 서버.",
    tags: ["MCP", "Knowledge"],
    stack: ["MCP"],
    dependencies: [],
    position: { x: -700, y: 0 },
  },
  // 예정
  {
    slug: "sample-mcp-e",
    name: "Sample MCP E",
    category: "planned",
    status: "planning",
    description: "일정·시간 기반 MCP 서버.",
    tags: ["MCP", "Schedule"],
    position: { x: -700, y: -320 },
  },
  {
    slug: "groupware-mcp",
    name: "Sample MCP B",
    category: "planned",
    status: "planning",
    description: "그룹웨어 MCP 서버.",
    tags: ["MCP", "Enterprise"],
    position: { x: -700, y: -160 },
  },
  {
    slug: "demo-scale",
    name: "Demo Scale",
    category: "planned",
    status: "idea",
    description: "대규모 처리·배치·큐 인프라.",
    tags: ["Infra", "Scale"],
    position: { x: -700, y: 160 },
  },
];

function getAccessToken() {
  if (!fs.existsSync(CREDS_PATH)) {
    throw new Error(
      `Firebase CLI credentials not found at ${CREDS_PATH}. Run 'firebase login' first.`,
    );
  }
  const creds = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8"));
  const token = creds.tokens?.access_token;
  const expiresAt = creds.tokens?.expires_at;
  if (!token) throw new Error("No access_token in firebase-tools credentials.");
  if (expiresAt && Date.now() >= expiresAt) {
    throw new Error(
      `Access token expired. Run 'firebase login --reauth' to refresh.`,
    );
  }
  return token;
}

/** JS 값을 Firestore REST API의 Value 형식으로 변환. */
function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number")
    return Number.isInteger(v)
      ? { integerValue: String(v) }
      : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === "object")
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(v).map(([k, val]) => [k, toValue(val)]),
        ),
      },
    };
  throw new Error(`Unsupported value type: ${typeof v}`);
}

function toFirestoreFields(fields) {
  const result = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v && typeof v === "object" && "_ts" in v) {
      result[k] = { timestampValue: v._ts };
    } else {
      result[k] = toValue(v);
    }
  }
  return result;
}

function projectFields(project) {
  const now = new Date().toISOString();
  const fields = {
    name: project.name,
    category: project.category,
    status: project.status,
    description: project.description,
    tags: project.tags ?? [],
    stack: project.stack ?? [],
    links: project.links ?? [],
    dependencies: project.dependencies ?? [],
    screenshots: project.screenshots ?? [],
    isHub: project.isHub ?? false,
    position: project.position,
    timeline: { startedAt: null, launchedAt: null },
    createdAt: { _ts: now },
    updatedAt: { _ts: now },
  };
  if (project.nameEn) fields.nameEn = project.nameEn;
  if (project.detail) fields.detail = project.detail;
  if (project.owner) fields.owner = project.owner;
  if (project.icon) fields.icon = project.icon;
  if (project.progress !== undefined) fields.progress = project.progress;
  return fields;
}

function taxonomyFields(entry) {
  const now = new Date().toISOString();
  return {
    ...entry,
    createdAt: { _ts: now },
    updatedAt: { _ts: now },
  };
}

async function upsertProject(token, project) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/projects/${encodeURIComponent(project.slug)}`;
  const body = { fields: toFirestoreFields(projectFields(project)) };
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

async function upsertDocument(token, collection, id, fields) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}`;
  const body = { fields: toFirestoreFields(fields) };
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

async function seedTaxonomy(token) {
  for (const category of SEED_CATEGORIES) {
    await upsertDocument(
      token,
      "categories",
      category.id,
      taxonomyFields(category),
    );
  }
  for (const status of SEED_STATUSES) {
    await upsertDocument(token, "statuses", status.id, taxonomyFields(status));
  }
}

async function main() {
  const token = getAccessToken();
  console.log(`[seed] Firebase CLI access token 사용. 프로젝트: ${PROJECT_ID}`);
  await seedTaxonomy(token);
  console.log("[seed] taxonomy upsert 완료");

  const total = SEED_PROJECTS.length;
  let success = 0;
  const failed = [];

  for (let i = 0; i < total; i++) {
    const project = SEED_PROJECTS[i];
    const prefix = `[${i + 1}/${total}]`;
    try {
      await upsertProject(token, project);
      success++;
      console.log(`${prefix} ✓ ${project.slug}`);
    } catch (err) {
      failed.push({ slug: project.slug, error: err.message });
      console.log(`${prefix} ✗ ${project.slug}: ${err.message}`);
    }
  }

  console.log(`\n[seed] 완료: 성공 ${success}, 실패 ${failed.length}`);
  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[seed] 전역 에러:", err.message);
  process.exit(1);
});
