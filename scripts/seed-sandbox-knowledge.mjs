#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import {
  applyReviewActionCore,
  processExtractionJobCore,
  publishKnowledgeProjectionCore,
} from "../functions/index.js";

const PROJECT_ID =
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  process.env.GCLOUD_PROJECT ||
  "demo-aslan-project-map";
const STORAGE_BUCKET = `${PROJECT_ID}.firebasestorage.app`;
const ACCOUNT_ID = "sandbox-lab";
const FIXTURES_DIR = path.join(
  process.cwd(),
  "scripts",
  "fixtures",
  "knowledge",
  "sandbox",
);

const COLLECTIONS = {
  documents: "knowledgeDocuments",
  versions: "knowledgeDocumentVersions",
  jobs: "knowledgeExtractionJobs",
  chunks: "knowledgeDocumentChunks",
  outputs: "knowledgeExtractionOutputs",
  evidence: "knowledgeEvidence",
  reviews: "knowledgeReviews",
  approvalEvents: "knowledgeApprovalEvents",
  approvedNodes: "knowledgeApprovedNodes",
  approvedEdges: "knowledgeApprovedEdges",
  publishes: "knowledgePublishes",
  publicMeta: "knowledgePublicMeta",
  publicNodes: "knowledgePublicNodes",
  publicEdges: "knowledgePublicEdges",
};

function ensureApp() {
  if (getApps().length === 0) {
    initializeApp({
      projectId: PROJECT_ID,
      storageBucket: STORAGE_BUCKET,
    });
  }
}

function docCollection(name) {
  return getFirestore()
    .collection("accounts")
    .doc(ACCOUNT_ID)
    .collection(name);
}

function globalCollection(name) {
  return getFirestore().collection(name);
}

async function deleteByQuery(query) {
  const snapshot = await query.get();
  if (snapshot.empty) return;
  const batch = getFirestore().batch();
  snapshot.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
}

async function resetSandboxKnowledgeState() {
  const db = getFirestore();
  const accountRef = db.collection("accounts").doc(ACCOUNT_ID);

  const localCollections = [
    COLLECTIONS.documents,
    COLLECTIONS.versions,
    "projects",
  ];

  for (const collectionName of localCollections) {
    const snapshot = await accountRef.collection(collectionName).get();
    if (snapshot.empty) continue;
    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }

  const accountScopedGlobalCollections = [
    COLLECTIONS.jobs,
    COLLECTIONS.chunks,
    COLLECTIONS.outputs,
    COLLECTIONS.evidence,
    COLLECTIONS.reviews,
    COLLECTIONS.approvalEvents,
    COLLECTIONS.approvedNodes,
    COLLECTIONS.approvedEdges,
    COLLECTIONS.publishes,
    COLLECTIONS.publicNodes,
    COLLECTIONS.publicEdges,
  ];

  for (const collectionName of accountScopedGlobalCollections) {
    await deleteByQuery(globalCollection(collectionName).where("accountId", "==", ACCOUNT_ID));
  }

  await globalCollection(COLLECTIONS.publicMeta)
    .doc(`current__${ACCOUNT_ID}`)
    .delete()
    .catch(() => undefined);
}

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { metadata: {}, body: markdown };

  const lines = match[1].split("\n");
  const metadata = {};
  let currentKey = null;

  for (const line of lines) {
    if (/^\s*-\s+/.test(line) && currentKey) {
      metadata[currentKey] ??= [];
      metadata[currentKey].push(line.replace(/^\s*-\s+/, "").trim());
      continue;
    }

    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    if (!rawValue) {
      currentKey = key;
      metadata[key] ??= [];
      continue;
    }
    currentKey = null;
    metadata[key] = rawValue;
  }

  return { metadata, body: markdown.slice(match[0].length) };
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

async function uploadMarkdown(storagePath, markdown) {
  const bucket = getStorage().bucket(STORAGE_BUCKET);
  await bucket.file(storagePath).save(markdown, {
    contentType: "text/markdown; charset=utf-8",
  });
}

async function seedFixture(fileName) {
  const filePath = path.join(FIXTURES_DIR, fileName);
  const markdown = await fs.readFile(filePath, "utf8");
  const { metadata } = parseFrontmatter(markdown);
  const title = String(metadata.title ?? fileName.replace(/\.md$/, ""));
  const kind = String(metadata.kind ?? "spec");
  const projectIds = Array.isArray(metadata.projectIds)
    ? metadata.projectIds
    : [];
  const baseId = slugify(fileName.replace(/\.md$/, ""));
  const documentId = baseId;
  const versionId = `${baseId}-v1`;
  const jobId = `${baseId}-job-v1`;
  const now = Timestamp.now();
  const storagePath = `accounts/${ACCOUNT_ID}/knowledge-documents/${documentId}/${versionId}.md`;

  await uploadMarkdown(storagePath, markdown);

  await docCollection(COLLECTIONS.documents).doc(documentId).set(
    {
      title,
      kind,
      projectIds,
      sourceType: "manual",
      currentVersionId: versionId,
      latestJobId: jobId,
      latestJobStatus: "queued",
      formatScore: metadata.title ? 100 : 60,
      status: kind === "policy" ? "reviewing" : "extracted",
      createdBy: "dev-admin@local",
      accountId: ACCOUNT_ID,
      createdAt: now,
      updatedAt: now,
    },
    { merge: true },
  );

  await docCollection(COLLECTIONS.versions).doc(versionId).set(
    {
      documentId,
      title,
      kind,
      projectIds,
      frontmatter: metadata,
      storagePath,
      mimeType: "text/markdown",
      sizeBytes: markdown.length,
      hash: `${baseId}-${markdown.length}`,
      createdBy: "dev-admin@local",
      accountId: ACCOUNT_ID,
      createdAt: now,
    },
    { merge: true },
  );

  await globalCollection(COLLECTIONS.jobs).doc(jobId).set(
    {
      documentId,
      documentVersionId: versionId,
      extractorVersion: "gemini-v1",
      idempotencyKey: `${ACCOUNT_ID}:${versionId}:gemini-v1`,
      status: "queued",
      attemptCount: 0,
      maxAttempts: 3,
      retryable: true,
      generation: 0,
      requestedBy: "dev-admin@local",
      accountId: ACCOUNT_ID,
      createdAt: now,
      updatedAt: now,
      leaseExpiresAt: null,
      completedAt: null,
      nextAttemptAt: null,
      publishId: null,
      projectionVersion: null,
      errorCode: null,
      errorMessage: null,
    },
    { merge: true },
  );

  return { documentId, jobId, title };
}

async function seedSandboxProjects() {
  const entries = [
    {
      slug: "sandbox-core",
      name: "샌드박스 코어",
      category: "in-progress",
      status: "developing",
      description: "샌드박스 토폴로지의 기준 허브 역할을 하는 중심 노드.",
      tags: ["Sandbox", "Hub"],
      stack: ["Next.js", "Firebase"],
      dependencies: [],
      position: { x: -60, y: -20 },
      isHub: true,
    },
    {
      slug: "sandbox-console",
      name: "샌드박스 콘솔",
      category: "in-progress",
      status: "developing",
      description: "운영자가 문서와 추출 결과를 확인하는 관리 콘솔.",
      tags: ["Sandbox", "Console"],
      stack: ["Next.js", "Firestore"],
      dependencies: ["sandbox-core"],
      position: { x: 150, y: -10 },
    },
    {
      slug: "sandbox-auth-gateway",
      name: "샌드박스 인증 게이트웨이",
      category: "in-progress",
      status: "developing",
      description: "로그인, 세션, 권한 검사를 실험하는 인증 진입점.",
      tags: ["Sandbox", "Auth"],
      stack: ["Next.js", "Firebase Auth"],
      dependencies: ["sandbox-core"],
      position: { x: 160, y: -250 },
    },
    {
      slug: "sandbox-agent-runner",
      name: "샌드박스 에이전트 러너",
      category: "in-progress",
      status: "planning",
      description: "문서 처리와 작업 실행을 검증하는 내부 런타임.",
      tags: ["Sandbox", "Agent"],
      stack: ["Cloud Functions", "Queue"],
      dependencies: ["sandbox-core", "sandbox-auth-gateway"],
      position: { x: 470, y: -30 },
    },
    {
      slug: "sandbox-observer",
      name: "샌드박스 옵저버",
      category: "planned",
      status: "idea",
      description: "로그, 이벤트, 추출 결과를 관찰하는 진단 패널.",
      tags: ["Sandbox", "Observability"],
      dependencies: ["sandbox-core"],
      position: { x: 150, y: 220 },
    },
    {
      slug: "sandbox-docs-lab",
      name: "샌드박스 문서 랩",
      category: "planned",
      status: "idea",
      description: "지식 문서와 구조 추출을 실험하는 작업 공간.",
      tags: ["Sandbox", "Knowledge"],
      dependencies: ["sandbox-core", "sandbox-agent-runner"],
      position: { x: 470, y: 220 },
    },
  ];

  const batch = getFirestore().batch();
  for (const entry of entries) {
    batch.set(
      getFirestore()
        .collection("accounts")
        .doc(ACCOUNT_ID)
        .collection("projects")
        .doc(entry.slug),
      {
        ...entry,
        isHub: entry.isHub ?? false,
        accountId: ACCOUNT_ID,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }
  await batch.commit();
}

async function main() {
  ensureApp();
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("FIRESTORE_EMULATOR_HOST is required");
  }
  if (!process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
    throw new Error("FIREBASE_STORAGE_EMULATOR_HOST is required");
  }

  await resetSandboxKnowledgeState();
  await seedSandboxProjects();

  const files = (await fs.readdir(FIXTURES_DIR))
    .filter((file) => file.endsWith(".md"))
    .sort();

  const seeded = [];
  for (const fileName of files) {
    const fixture = await seedFixture(fileName);
    seeded.push(fixture);
    try {
      await processExtractionJobCore(fixture.jobId, ACCOUNT_ID);
      await applyReviewActionCore({
        accountId: ACCOUNT_ID,
        documentId: fixture.documentId,
        documentVersionId: `${fixture.documentId}-v1`,
        requestedBy: "dev-admin@local",
      });
    } catch (error) {
      console.warn(
        `[seed-sandbox-knowledge] ${fixture.title} 처리 중 경고: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  await publishKnowledgeProjectionCore({
    accountId: ACCOUNT_ID,
    initiatedBy: "dev-admin@local",
  });

  console.log(
    `[seed-sandbox-knowledge] account=${ACCOUNT_ID} documents=${seeded.length}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
