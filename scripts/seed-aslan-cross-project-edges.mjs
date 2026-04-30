#!/usr/bin/env node
/**
 * Cross-project depends_on / uses 엣지 시드 — 각 fixture 가 self-contained
 * 라 cross-project 의존 관계 (reactor-admin → reactor 등) 가 운영
 * 토폴로지에 누락된 문제 (D-cont-1).
 *
 * 입력: 아래 EDGES 배열에 명시된 (fromFixture, fromTitle, type, toFixture,
 * toTitle) 페어. seed-aslan-ontology-fixture.mjs 와 같은 ID 컨벤션
 * (`<fixtureId>__<slug-of-title>`) 으로 노드 ref 결정.
 *
 * 사용:
 *   set -a; source .local-credentials/aslan.env; set +a
 *   node scripts/seed-aslan-cross-project-edges.mjs
 *
 * idempotent — edge ID 가 결정적 (`cross__<from>__<type>__<to>`) 이라
 * 재실행 안전.
 */

import {
  initializeApp,
  applicationDefault,
  getApps,
  cert,
} from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import fs from "node:fs";

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "aslan-project-map";
const ACCOUNT_ID = process.env.ASLAN_ACCOUNT_ID || "aslan";
const ASLAN_UID = process.env.ASLAN_UID || "aslan";

/**
 * Cross-project edge 정의. 진안의 실제 의존 모델 반영:
 *
 * - reactor-admin / reactor-web 은 reactor 의 API/WS 를 소비
 * - mcp-servers (3 종) 는 reactor 의 MCP Registry 동적 등록 대상
 * - paravel-app 은 paravel-backend (REST API) + aslan-iam (JWT) 를 사용
 * - paravel-backend 은 aslan-iam 을 사용 (RS256 JWT 검증)
 * - aslan-verse-web 은 aslan-iam 사용 (JWT)
 * - aslan-builder 의 LLM Provider Abstraction 은 외부 LLM (관계 생략)
 * - pick 은 별도 도메인 (외부 의존 없음)
 *
 * 각 페어 — `from` 프로젝트의 노드가 `to` 프로젝트의 노드를 의존.
 */
const EDGES = [
  // reactor 통합 의존
  {
    from: { fixture: "06-reactor-admin", title: "Reactor Admin" },
    to: { fixture: "05-reactor", title: "Arc Reactor" },
    type: "depends_on",
    note: "reactor-admin 은 reactor 의 admin API 를 소비",
  },
  {
    from: { fixture: "07-reactor-web", title: "Reactor Web" },
    to: { fixture: "05-reactor", title: "Arc Reactor" },
    type: "depends_on",
    note: "reactor-web 은 reactor 의 채팅 / persona / admin API 를 소비",
  },
  {
    from: { fixture: "11-mcp-servers", title: "MCP Servers" },
    to: { fixture: "05-reactor", title: "Arc Reactor" },
    type: "uses",
    note: "mcp-servers 3 종은 reactor MCP Registry 에 동적 등록되어 사용됨",
  },
  // paravel 의존 chain
  {
    from: { fixture: "08-paravel-app", title: "Paravel App" },
    to: { fixture: "09-paravel-backend", title: "Paravel Backend" },
    type: "depends_on",
    note: "paravel-app 은 paravel-backend 의 REST API 를 사용",
  },
  {
    from: { fixture: "08-paravel-app", title: "Paravel App" },
    to: { fixture: "03-aslan-iam", title: "Aslan IAM" },
    type: "depends_on",
    note: "paravel-app 은 aslan-iam 의 RS256 JWT 발급을 사용",
  },
  {
    from: { fixture: "09-paravel-backend", title: "Paravel Backend" },
    to: { fixture: "03-aslan-iam", title: "Aslan IAM" },
    type: "depends_on",
    note: "paravel-backend 은 aslan-iam 의 JWT 공개키로 토큰 검증",
  },
  // aslan-verse-web 의존
  {
    from: { fixture: "04-aslan-verse-web", title: "Aslan Verse Web" },
    to: { fixture: "03-aslan-iam", title: "Aslan IAM" },
    type: "depends_on",
    note: "aslan-verse-web 은 aslan-iam 의 JWT 인증",
  },
];

function slugify(t) {
  return t
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function nodeIdFor(fixtureId, title) {
  return `${fixtureId}__${slugify(title)}`.slice(0, 200);
}

function edgeIdFor(fromFixture, fromTitle, type, toFixture, toTitle) {
  const fromId = nodeIdFor(fromFixture, fromTitle);
  const toId = nodeIdFor(toFixture, toTitle);
  return `cross__${fromId}__${type}__${toId}`.slice(0, 300);
}

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const credential =
  keyPath && fs.existsSync(keyPath)
    ? cert(JSON.parse(fs.readFileSync(keyPath, "utf8")))
    : applicationDefault();

const app =
  getApps()[0] ?? initializeApp({ projectId: PROJECT_ID, credential });
const db = getFirestore(app);

console.log(
  `[seed-aslan-cross-edges] project=${PROJECT_ID} account=${ACCOUNT_ID} edges=${EDGES.length}`,
);

const batch = db.batch();
let count = 0;
for (const edge of EDGES) {
  const id = edgeIdFor(
    edge.from.fixture,
    edge.from.title,
    edge.type,
    edge.to.fixture,
    edge.to.title,
  );
  const ref = db.collection("knowledgeApprovedEdges").doc(id);
  batch.set(
    ref,
    {
      accountId: ACCOUNT_ID,
      from: nodeIdFor(edge.from.fixture, edge.from.title),
      to: nodeIdFor(edge.to.fixture, edge.to.title),
      type: edge.type,
      label: null,
      confidence: 1.0,
      source: "manual",
      manualAuthor: ASLAN_UID,
      manualNote: `Track D-cont cross-project: ${edge.note}`,
      projectIds: [edge.from.fixture, edge.to.fixture],
      evidence: [],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  count += 1;
  console.log(
    `  ✓ ${edge.from.title} —[${edge.type}]→ ${edge.to.title}  (${id})`,
  );
}
await batch.commit();

console.log(
  `\n[seed-aslan-cross-edges] done. cross-project edges seeded: ${count} (idempotent — 재실행 안전)`,
);
