#!/usr/bin/env node

import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
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
const ACCOUNT_ID = "stress-lab";
const DOCUMENT_COUNT = 240;
const HEAVY_PROJECT_ID = "stress-core-01";
const DEMO_LOGIN_EMAIL =
  process.env.NEXT_PUBLIC_DEMO_LOGIN_EMAIL || "demo-viewer@local";
const DEMO_LOGIN_PASSWORD =
  process.env.NEXT_PUBLIC_DEMO_LOGIN_PASSWORD || "demo-viewer-pass-123";

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

const DOMAIN_CONFIGS = [
  {
    id: "identity",
    label: "인증",
    capabilities: ["로그인 세션 발급", "토큰 검증", "권한 갱신", "세션 복구"],
    elements: ["인증 게이트웨이", "세션 저장소", "토큰 검사기", "권한 브리지"],
    concepts: ["사용자 로그인", "세션 복구", "권한 전파", "보안 흐름"],
  },
  {
    id: "docs",
    label: "문서 저장",
    capabilities: ["문서 업로드", "버전 저장", "원문 정리", "첨부 추적"],
    elements: ["문서 저장소", "버전 레지스트리", "메타 정리기", "업로드 큐"],
    concepts: ["문서 저장", "버전 히스토리", "원문 보관", "첨부 추적"],
  },
  {
    id: "extract",
    label: "추출 파이프라인",
    capabilities: ["문서 분해", "후보 추출", "근거 정렬", "신뢰도 계산"],
    elements: ["청크 생성기", "후보 추출기", "근거 매퍼", "추출 작업 큐"],
    concepts: ["후보 추출", "근거 정렬", "신뢰도", "문서 분해"],
  },
  {
    id: "review",
    label: "검토 승인",
    capabilities: ["후보 검토", "승인 기록", "예외 처리", "작업 기준 지정"],
    elements: ["검토 대시보드", "승인 로그", "예외 처리기", "기준 버전 관리자"],
    concepts: ["승인 흐름", "검토 큐", "작업 기준", "예외 처리"],
  },
  {
    id: "publish",
    label: "공개 반영",
    capabilities: ["공개 그래프 생성", "스냅샷 반영", "버전 교체", "공개 기록"],
    elements: ["공개 프로젝터", "스냅샷 저장소", "반영 작업기", "게시 기록"],
    concepts: ["공개 그래프", "스냅샷", "반영 버전", "게시 기록"],
  },
  {
    id: "search",
    label: "탐색 검색",
    capabilities: ["프로젝트 찾기", "연결 탐색", "관련 개념 찾기", "결과 압축"],
    elements: ["검색 허브", "연결 탐색기", "개념 묶음", "요약 레이어"],
    concepts: ["탐색 흐름", "연결 이유", "관련 개념", "요약 결과"],
  },
  {
    id: "console",
    label: "운영 콘솔",
    capabilities: ["상태 확인", "실패 재처리", "작업 전환", "공개 확인"],
    elements: ["운영 패널", "상태 카드", "재처리 버튼", "공개 미리보기"],
    concepts: ["운영 흐름", "실패 복구", "화면 전환", "미리보기"],
  },
  {
    id: "observe",
    label: "관측 진단",
    capabilities: ["로그 수집", "느린 흐름 확인", "연결 이상 탐지", "지표 확인"],
    elements: ["로그 파이프", "진단 패널", "지표 집계기", "이상 탐지기"],
    concepts: ["진단 로그", "병목 구간", "연결 이상", "지표"],
  },
];

const ACTIVE_STRESS_CONFIGS = DOMAIN_CONFIGS.slice(0, 3);

function ensureApp() {
  if (getApps().length === 0) {
    initializeApp({
      projectId: PROJECT_ID,
      storageBucket: STORAGE_BUCKET,
    });
  }
}

function db() {
  return getFirestore();
}

function accountCollection(name) {
  return db().collection("accounts").doc(ACCOUNT_ID).collection(name);
}

function globalCollection(name) {
  return db().collection(name);
}

function chunk(items, size = 400) {
  const groups = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

async function batchDeleteSnapshots(snapshots) {
  for (const group of chunk(snapshots)) {
    const batch = db().batch();
    group.forEach((snapshot) => batch.delete(snapshot.ref));
    await batch.commit();
  }
}

async function deleteByQuery(query) {
  const snapshot = await query.get();
  if (snapshot.empty) return;
  await batchDeleteSnapshots(snapshot.docs);
}

async function resetStressState() {
  const accountRef = db().collection("accounts").doc(ACCOUNT_ID);
  const localCollections = [
    COLLECTIONS.documents,
    COLLECTIONS.versions,
    "projects",
  ];

  for (const collectionName of localCollections) {
    const snapshot = await accountRef.collection(collectionName).get();
    if (!snapshot.empty) {
      await batchDeleteSnapshots(snapshot.docs);
    }
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

  await db()
    .collection("accountMemberships")
    .doc(`dev-admin-bypass__${ACCOUNT_ID}`)
    .delete()
    .catch(() => undefined);

  await getStorage()
    .bucket(STORAGE_BUCKET)
    .deleteFiles({ prefix: `accounts/${ACCOUNT_ID}/knowledge-documents/` })
    .catch(() => undefined);
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function buildProjects() {
  const projects = [
    {
      slug: HEAVY_PROJECT_ID,
      name: "스트레스 코어 01",
      category: "in-progress",
      status: "developing",
      description: "수천 개 공개 항목을 묶어 토폴로지와 문서 흐름을 검증하는 기준 허브.",
      tags: ["Stress", "Hub"],
      stack: ["Next.js", "Firebase"],
      dependencies: [],
      position: { x: 120, y: 260 },
      isHub: true,
    },
  ];

  const domainHubs = ACTIVE_STRESS_CONFIGS.map((config, index) => {
    return {
      slug: `stress-${config.id}-hub`,
      name: `${config.label} 허브`,
      category: "in-progress",
      status: "developing",
      description: `${config.label} 문서를 모아 연결 구조를 만드는 허브 프로젝트.`,
      tags: ["Stress", config.label],
      stack: ["Next.js", "Firestore"],
      dependencies: [HEAVY_PROJECT_ID],
      position: { x: 420 + index * 290, y: 40 + (index % 2 === 0 ? -160 : 160) },
      isHub: true,
      configId: config.id,
    };
  });

  projects.push(...domainHubs);

  ACTIVE_STRESS_CONFIGS.forEach((config, domainIndex) => {
    for (let slot = 1; slot <= 2; slot += 1) {
      const dependencySet = new Set([HEAVY_PROJECT_ID, `stress-${config.id}-hub`]);
      if (domainIndex > 0) {
        dependencySet.add(`stress-${ACTIVE_STRESS_CONFIGS[domainIndex - 1].id}-hub`);
      }
      if (slot === 2) {
        dependencySet.add(`stress-${config.id}-01`);
      }
      projects.push({
        slug: `stress-${config.id}-${String(slot).padStart(2, "0")}`,
        name: config.elements[slot - 1] || `${config.label} ${String(slot).padStart(2, "0")}`,
        category: "in-progress",
        status: slot === 2 ? "completed" : "developing",
        description: `${config.label} 흐름을 실제 프로젝트 단위로 나눈 고밀도 검증용 프로젝트입니다.`,
        tags: ["Stress", config.label],
        stack: ["Next.js", "Firebase"],
        dependencies: [...dependencySet],
        position: {
          x: 280 + domainIndex * 330 + slot * 90,
          y: slot === 1 ? -260 - domainIndex * 20 : 420 + domainIndex * 20,
        },
      });
    }
  });

  return projects;
}

function buildMarkdown({
  index,
  title,
  kind,
  projectIds,
  domain,
  capabilities,
  elements,
  relates,
}) {
  const frontmatter = [
    "---",
    `title: ${title}`,
    `kind: ${kind}`,
    "projectIds:",
    ...projectIds.map((projectId) => `  - ${projectId}`),
    "domain:",
    `  - ${domain}`,
    "capabilities:",
    ...capabilities.map((item) => `  - ${item}`),
    "elements:",
    ...elements.map((item) => `  - ${item}`),
    "relates:",
    ...relates.map((item) => `  - ${item}`),
    "---",
    "",
    "# 요약",
    `${title} 문서는 ${projectIds.slice(0, 2).join(", ")} 흐름을 한 문맥에서 설명하는 대형 검증용 문서입니다.`,
    "",
    "## 도메인",
    `- ${domain}`,
    "",
    "## 기능",
    ...capabilities.map((item) => `- ${item}`),
    "",
    "## 구성 요소",
    ...elements.map((item) => `- ${item}`),
    "",
    "## 연결 대상",
    ...relates.map((item) => `- ${item}`),
    "",
    "## 메모",
    `- 문서 번호: ${String(index + 1).padStart(3, "0")}`,
    `- 기준 프로젝트 수: ${projectIds.length}`,
    "- 이 문서는 대용량 토폴로지/온톨로지 렌더링 검증을 위해 자동 생성되었습니다.",
    "",
  ];

  return frontmatter.join("\n");
}

async function uploadMarkdown(storagePath, markdown) {
  const bucket = getStorage().bucket(STORAGE_BUCKET);
  await bucket.file(storagePath).save(markdown, {
    contentType: "text/markdown; charset=utf-8",
  });
}

async function createDocumentAndJob({ documentId, versionId, title, kind, projectIds, markdown }) {
  const now = Timestamp.now();
  const storagePath = `accounts/${ACCOUNT_ID}/knowledge-documents/${documentId}/${versionId}.md`;
  const metadata = {
    title,
    kind,
    projectIds,
  };

  await uploadMarkdown(storagePath, markdown);

  await accountCollection(COLLECTIONS.documents).doc(documentId).set(
    {
      title,
      kind,
      projectIds,
      sourceType: "manual",
      currentVersionId: versionId,
      latestJobId: `${documentId}-job-v1`,
      latestJobStatus: "queued",
      formatScore: 100,
      status: "extracted",
      createdBy: "stress-admin@local",
      accountId: ACCOUNT_ID,
      createdAt: now,
      updatedAt: now,
    },
    { merge: true },
  );

  await accountCollection(COLLECTIONS.versions).doc(versionId).set(
    {
      documentId,
      title,
      kind,
      projectIds,
      frontmatter: metadata,
      storagePath,
      mimeType: "text/markdown",
      sizeBytes: markdown.length,
      hash: `${documentId}-${markdown.length}`,
      createdBy: "stress-admin@local",
      accountId: ACCOUNT_ID,
      createdAt: now,
    },
    { merge: true },
  );

  await globalCollection(COLLECTIONS.jobs).doc(`${documentId}-job-v1`).set(
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
      requestedBy: "stress-admin@local",
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
}

async function seedStressProjects(projects, demoViewerUid = "stress-demo-viewer") {
  await db()
    .collection("accounts")
    .doc(ACCOUNT_ID)
    .set(
      {
        id: ACCOUNT_ID,
        name: "스트레스 랩",
        description: "10개 프로젝트와 수천 개 공개 항목으로 연결 구조를 검증하는 공개 테스트 공간",
        isPublic: true,
      },
      { merge: true },
    );

  await db()
    .collection("accountMemberships")
    .doc(`dev-admin-bypass__${ACCOUNT_ID}`)
    .set(
      {
        accountId: ACCOUNT_ID,
        uid: "dev-admin-bypass",
        email: "dev-admin@local",
        role: "owner",
      },
      { merge: true },
    );

  await db()
    .collection("accountMemberships")
    .doc(`stress-demo-viewer__${ACCOUNT_ID}`)
    .set(
      {
        accountId: ACCOUNT_ID,
        uid: demoViewerUid,
        email: DEMO_LOGIN_EMAIL,
        role: "viewer",
      },
      { merge: true },
    );

  for (const group of chunk(projects, 350)) {
    const batch = db().batch();
    group.forEach((project) => {
      batch.set(
        db()
          .collection("accounts")
          .doc(ACCOUNT_ID)
          .collection("projects")
          .doc(project.slug),
        {
          ...project,
          accountId: ACCOUNT_ID,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    });
    await batch.commit();
  }
}

async function ensureDemoViewerAuthUser() {
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    return null;
  }

  const auth = getAuth();
  try {
    return await auth.getUserByEmail(DEMO_LOGIN_EMAIL);
  } catch {
    return await auth.createUser({
      email: DEMO_LOGIN_EMAIL,
      password: DEMO_LOGIN_PASSWORD,
      displayName: "데모 사용자",
    });
  }
}

async function main() {
  ensureApp();
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("FIRESTORE_EMULATOR_HOST is required");
  }
  if (!process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
    throw new Error("FIREBASE_STORAGE_EMULATOR_HOST is required");
  }

  await resetStressState();
  const projects = buildProjects();
  const demoViewer = await ensureDemoViewerAuthUser();
  await seedStressProjects(projects, demoViewer?.uid);

  const domainHubById = new Map(
    ACTIVE_STRESS_CONFIGS.map((config) => [config.id, `stress-${config.id}-hub`]),
  );
  const kinds = ["spec", "workflow", "guide", "decision", "policy", "research", "api", "note"];
  const created = [];

  for (let index = 0; index < DOCUMENT_COUNT; index += 1) {
    const config = ACTIVE_STRESS_CONFIGS[index % ACTIVE_STRESS_CONFIGS.length];
    const kind = kinds[index % kinds.length];
    const projectA = `stress-${config.id}-${String((index % 2) + 1).padStart(2, "0")}`;
    const secondaryConfig = ACTIVE_STRESS_CONFIGS[(index + 1) % ACTIVE_STRESS_CONFIGS.length];
    const projectB = `stress-${secondaryConfig.id}-${String(((index + 1) % 2) + 1).padStart(2, "0")}`;
    const docNumber = String(index + 1).padStart(3, "0");
    const projectIds = [
      HEAVY_PROJECT_ID,
      domainHubById.get(config.id),
      projectA,
      index % 2 === 0 ? domainHubById.get(secondaryConfig.id) : null,
      index % 3 === 0 ? projectB : null,
    ].filter(Boolean);
    const capabilities = Array.from({ length: 4 }, (_, itemIndex) => {
      const capability = config.capabilities[(index + itemIndex) % config.capabilities.length];
      return `${capability} ${docNumber}-${itemIndex + 1}`;
    });
    const elements = Array.from({ length: 4 }, (_, itemIndex) => {
      const element = config.elements[(index + itemIndex) % config.elements.length];
      return `${element} ${docNumber}-${itemIndex + 1}`;
    });
    const relates = Array.from({ length: 3 }, (_, itemIndex) => {
      const concept = secondaryConfig.concepts[(index + itemIndex) % secondaryConfig.concepts.length];
      return `${concept} ${docNumber}-${itemIndex + 1}`;
    });
    const title = `${config.label} ${docNumber} ${kind === "workflow" ? "워크플로" : "문서"}`;
    const documentId = slugify(`stress-doc-${String(index + 1).padStart(3, "0")}-${config.id}`);
    const versionId = `${documentId}-v1`;
    const markdown = buildMarkdown({
      index,
      title,
      kind,
      projectIds,
      domain: config.label,
      capabilities,
      elements,
      relates,
    });

    await createDocumentAndJob({
      documentId,
      versionId,
      title,
      kind,
      projectIds,
      markdown,
    });

    try {
      await processExtractionJobCore(`${documentId}-job-v1`, ACCOUNT_ID);
      await applyReviewActionCore({
        accountId: ACCOUNT_ID,
        documentId,
        documentVersionId: versionId,
        requestedBy: "stress-admin@local",
      });
    } catch (error) {
      console.warn(
        `[seed-stress-knowledge] ${documentId} 처리 경고: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    created.push(documentId);
    if ((index + 1) % 40 === 0) {
      console.log(`[seed-stress-knowledge] seeded ${index + 1}/${DOCUMENT_COUNT}`);
    }
  }

  await publishKnowledgeProjectionCore({
    accountId: ACCOUNT_ID,
    initiatedBy: "stress-admin@local",
  });

  console.log(
    `[seed-stress-knowledge] account=${ACCOUNT_ID} projects=${projects.length} documents=${created.length}`,
  );

  const [coreNodeSnapshot, coreEdgeSnapshot] = await Promise.all([
    globalCollection(COLLECTIONS.publicNodes)
      .where("accountId", "==", ACCOUNT_ID)
      .where("projectIds", "array-contains", HEAVY_PROJECT_ID)
      .get(),
    globalCollection(COLLECTIONS.publicEdges)
      .where("accountId", "==", ACCOUNT_ID)
      .where("projectIds", "array-contains", HEAVY_PROJECT_ID)
      .get(),
  ]);

  console.log(
    `[seed-stress-knowledge] heavy-project=${HEAVY_PROJECT_ID} publicNodes=${coreNodeSnapshot.size} publicEdges=${coreEdgeSnapshot.size}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
