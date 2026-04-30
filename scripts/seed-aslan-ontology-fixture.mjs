#!/usr/bin/env node
/**
 * golden ontology fixture (`tests/fixtures/golden-ontology/<id>.expected.json`)
 * 를 운영 Aslan account 의 `knowledgeApprovedNodes` / `knowledgeApprovedEdges`
 * 로 시드. Track D (외부 프로젝트 ontology 채우기) 의 fixture-driven 변형.
 *
 * Admin SDK 라 firestore.rules 우회. 로컬 자격은 ADC + ASLAN_PASSWORD env
 * (`.local-credentials/aslan.env` 권장).
 *
 * 사용:
 *   set -a; source .local-credentials/aslan.env; set +a
 *   node scripts/seed-aslan-ontology-fixture.mjs 02-aslan-builder
 *
 * 동작:
 *   - fixture 의 nodes → knowledgeApprovedNodes 에 setDoc (merge)
 *   - fixture 의 edges → knowledgeApprovedEdges 에 setDoc (merge)
 *   - ID 는 fixture id 와 노드 인덱스 조합으로 결정적 — 재실행 idempotent.
 *
 * 운영 메타:
 *   - source: "manual" (자율 루프가 박았다는 표시)
 *   - manualAuthor: ASLAN_UID
 *   - confidence: 1.0 (정답 fixture 라 최대치)
 *   - isStub: false
 */

import {
  initializeApp,
  applicationDefault,
  getApps,
  cert,
} from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import fs from "node:fs";
import path from "node:path";

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "aslan-project-map";
const ACCOUNT_ID = process.env.ASLAN_ACCOUNT_ID || "aslan";
const ASLAN_UID = process.env.ASLAN_UID || "aslan";

const fixtureId = process.argv[2];
if (!fixtureId) {
  console.error("usage: node scripts/seed-aslan-ontology-fixture.mjs <fixture-id>");
  process.exit(1);
}

const fixturePath = path.join(
  process.cwd(),
  "tests/fixtures/golden-ontology",
  `${fixtureId}.expected.json`,
);
if (!fs.existsSync(fixturePath)) {
  console.error(`fixture not found: ${fixturePath}`);
  process.exit(1);
}

const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const credential =
  keyPath && fs.existsSync(keyPath)
    ? cert(JSON.parse(fs.readFileSync(keyPath, "utf8")))
    : applicationDefault();

const app =
  getApps()[0] ?? initializeApp({ projectId: PROJECT_ID, credential });
const db = getFirestore(app);

function slugify(t) {
  return t
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function nodeIdFor(title) {
  return `${fixtureId}__${slugify(title)}`.slice(0, 200);
}

function edgeIdFor(from, type, to) {
  return `${fixtureId}__${slugify(from)}__${type}__${slugify(to)}`.slice(0, 250);
}

console.log(
  `[seed-aslan-ontology] project=${PROJECT_ID} account=${ACCOUNT_ID} fixture=${fixtureId}`,
);

const projectSlug = fixture.id;
let nodeCount = 0;
const nodeBatch = db.batch();
for (const n of fixture.nodes) {
  const id = nodeIdFor(n.title);
  const ref = db.collection("knowledgeApprovedNodes").doc(id);
  nodeBatch.set(
    ref,
    {
      accountId: ACCOUNT_ID,
      title: n.title,
      kind: n.kind,
      summary: fixture.description ?? null,
      projectIds: [projectSlug],
      confidence: 1.0,
      isStub: false,
      source: "manual",
      manualAuthor: ASLAN_UID,
      manualNote: `Track D fixture seed: ${fixtureId}`,
      tags: [],
      evidence: [],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  nodeCount += 1;
}
await nodeBatch.commit();
console.log(`  ✓ knowledgeApprovedNodes: ${nodeCount}`);

let edgeCount = 0;
const edgeBatch = db.batch();
for (const e of fixture.edges) {
  const id = edgeIdFor(e.from, e.type, e.to);
  const ref = db.collection("knowledgeApprovedEdges").doc(id);
  edgeBatch.set(
    ref,
    {
      accountId: ACCOUNT_ID,
      from: nodeIdFor(e.from),
      to: nodeIdFor(e.to),
      type: e.type,
      label: null,
      confidence: 1.0,
      source: "manual",
      manualAuthor: ASLAN_UID,
      manualNote: `Track D fixture seed: ${fixtureId}`,
      projectIds: [projectSlug],
      evidence: [],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  edgeCount += 1;
}
await edgeBatch.commit();
console.log(`  ✓ knowledgeApprovedEdges: ${edgeCount}`);

console.log(
  `\n[seed-aslan-ontology] done. nodes=${nodeCount} edges=${edgeCount} (idempotent — 재실행 안전)`,
);
