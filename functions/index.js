import { initializeApp, getApps } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import {
  FieldValue,
  Timestamp,
  getFirestore,
} from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger, setGlobalOptions } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";
import { extractWithGemini } from "./extract-gemini.js";
import {
  extractOntology,
  extractOntologyChunked,
  buildOntologyOutputRecord,
  DEFAULT_ONTOLOGY_CLASSES,
  DEFAULT_ONTOLOGY_RELATIONS,
} from "./ontology-extract.js";

// M2 · 외부 HTTP API endpoint (POST /api/v1/docs)
export { receiveDoc } from "./receive-doc.js";
// Developer Activity Ingest — GitHub App webhook endpoint.
export {
  pruneDeveloperActivityDeliveries,
  receiveGitHubActivity,
  redeliverGitHubActivityDelivery,
  reprocessGitHubActivityDelivery,
} from "./receive-github-activity.js";

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

/**
 * extractorVersion 디스크리미네이터 — `ontology-` 접두면 신규 Anthropic 워커
 * (T-4d JS mirror), 그 외 (`gemini-v1` 등) 는 기존 Gemini 경로.
 */
function isOntologyExtractorVersion(version) {
  return typeof version === "string" && version.startsWith("ontology-");
}

async function loadOntologyTBox() {
  // 컬렉션이 비어 있으면 (T-1 시드 미실행) seed 로 fallback. C-1 단계에서는
  // 시드만으로 충분하지만 운영에서는 컬렉션 변화를 따라가야 함.
  try {
    const [classesSnap, relationsSnap] = await Promise.all([
      db().collection("ontologyClasses").get(),
      db().collection("ontologyRelations").get(),
    ]);
    const classes =
      classesSnap.size > 0
        ? classesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
        : DEFAULT_ONTOLOGY_CLASSES;
    const relations =
      relationsSnap.size > 0
        ? relationsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
        : DEFAULT_ONTOLOGY_RELATIONS;
    return { classes, relations };
  } catch (err) {
    logger.warn("[ontology] TBox load failed, using seed", {
      error: err?.message,
    });
    return {
      classes: DEFAULT_ONTOLOGY_CLASSES,
      relations: DEFAULT_ONTOLOGY_RELATIONS,
    };
  }
}

const REGION = "asia-northeast3";
const LEASE_WINDOW_MS = 5 * 60 * 1000;
const OUTPUT_PROVIDER = "stub";
const OUTPUT_EXTRACTOR_VERSION = "gemini-v1";
const PROJECTION_VERSION = "v1";
const COLLECTIONS = {
  admins: "admins",
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
const ACTIVE_OR_TERMINAL_REUSABLE_STATUSES = new Set([
  "queued",
  "leased",
  "processing",
  "succeeded",
]);

setGlobalOptions({
  region: REGION,
  maxInstances: 10,
});

function ensureApp() {
  if (getApps().length === 0) {
    const firebaseConfig = process.env.FIREBASE_CONFIG
      ? JSON.parse(process.env.FIREBASE_CONFIG)
      : null;
    const projectId = process.env.GCLOUD_PROJECT || firebaseConfig?.projectId;
    initializeApp({
      storageBucket: projectId ? `${projectId}.firebasestorage.app` : undefined,
    });
  }
}

function db() {
  ensureApp();
  return getFirestore();
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeAccountId(value) {
  const normalized = normalizeString(value);
  return normalized || null;
}

function buildIdempotencyKey(accountId, documentVersionId, extractorVersion) {
  return `${accountId || "public"}:${documentVersionId}:${extractorVersion}`;
}

function buildPublicMetaId(accountId) {
  return accountId ? `current__${accountId}` : "current";
}

function knowledgeDocumentRef(documentId, accountId) {
  const normalizedAccountId = normalizeAccountId(accountId);
  return normalizedAccountId
    ? db().collection("accounts").doc(normalizedAccountId).collection(COLLECTIONS.documents).doc(documentId)
    : db().collection(COLLECTIONS.documents).doc(documentId);
}

function knowledgeVersionRef(versionId, accountId) {
  const normalizedAccountId = normalizeAccountId(accountId);
  return normalizedAccountId
    ? db().collection("accounts").doc(normalizedAccountId).collection(COLLECTIONS.versions).doc(versionId)
    : db().collection(COLLECTIONS.versions).doc(versionId);
}

function isAllowedExistingStatus(status) {
  return ACTIVE_OR_TERMINAL_REUSABLE_STATUSES.has(status);
}

function getNowLeaseExpiry() {
  return Timestamp.fromMillis(Date.now() + LEASE_WINDOW_MS);
}

function createJobPayload({
  accountId,
  documentId,
  documentVersionId,
  extractorVersion,
  idempotencyKey,
  requestedBy,
}) {
  return {
    ...(accountId ? { accountId } : {}),
    documentId,
    documentVersionId,
    extractorVersion,
    idempotencyKey,
    status: "queued",
    attemptCount: 0,
    maxAttempts: 3,
    retryable: true,
    generation: 0,
    requestedBy,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

function getHeadingPath(markdown) {
  const firstHeading = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("#"));

  if (!firstHeading) return [];
  return [firstHeading.replace(/^#+\s*/, "").trim()];
}

function computeStableHash(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `stub-${(hash >>> 0).toString(16)}`;
}

async function readMarkdownFromStorage(storagePath) {
  ensureApp();
  const bucket = getStorage().bucket();
  const [contents] = await bucket.file(storagePath).download();
  return contents.toString("utf8");
}

function buildChunkRecord({ documentId, documentVersionId, markdown }) {
  return {
    documentId,
    documentVersionId,
    headingPath: getHeadingPath(markdown),
    markdown,
    charStart: 0,
    charEnd: markdown.length,
    chunkHash: computeStableHash(markdown),
    createdAt: FieldValue.serverTimestamp(),
  };
}

function buildOutputRecord({
  accountId,
  documentId,
  documentVersionId,
  extractorVersion,
  jobId,
  markdown,
  title,
  kind,
  projectIds,
}) {
  const kindLabelMap = {
    spec: "명세서",
    note: "메모",
    guide: "가이드",
    policy: "정책",
    decision: "결정 기록",
    research: "리서치",
    workflow: "워크플로",
    api: "API 문서",
  };
  const kindLabel = kindLabelMap[kind] || kind;
  const parsedFrontmatter = parseSimpleFrontmatter(markdown);
  const body = stripFrontmatter(markdown);
  const headingMatches = markdownHeadings(body);
  const domainCandidates = mergeUniqueStrings(
    parsedFrontmatter.domain,
    pickPrimaryHeadingByKeyword(headingMatches, ["도메인", "domain"]),
  );
  const capabilityCandidates = mergeUniqueStrings(
    parsedFrontmatter.capabilities,
    extractMarkdownListItems(body, ["기능", "capability", "capabilities", "단계", "흐름"]),
  );
  const elementCandidates = mergeUniqueStrings(
    parsedFrontmatter.elements,
    extractMarkdownListItems(body, ["구성 요소", "요소", "element", "elements", "연결 시스템"]),
  );
  const relatedCandidates = mergeUniqueStrings(
    parsedFrontmatter.relates,
    extractMarkdownListItems(body, ["연결 대상", "관련 문서", "관련 개념", "relates"]),
  );
  const projectNodes = projectIds.map((projectId) => ({
    tempId: `${documentVersionId}-project-${projectId}`,
    title: projectId,
    kind: "project",
    projectIds: [projectId],
    summary: `${projectId} 프로젝트와 연결된 후보 노드`,
    confidence: 0.86,
    warnings: ["임시 추출기 사용"],
  }));
  const domainNodes = domainCandidates.map((domain, index) => ({
    tempId: `${documentVersionId}-domain-${index + 1}`,
    title: domain,
    kind: "domain",
    projectIds,
    summary: `${domain} 도메인 후보`,
    confidence: 0.84,
    warnings: ["임시 추출기 사용"],
  }));
  const capabilityNodes = capabilityCandidates.map((capability, index) => ({
    tempId: `${documentVersionId}-capability-${index + 1}`,
    title: capability,
    kind: "capability",
    projectIds,
    summary: `${capability} 기능 후보`,
    confidence: 0.8,
    warnings: ["임시 추출기 사용"],
  }));
  const elementNodes = elementCandidates.map((element, index) => ({
    tempId: `${documentVersionId}-element-${index + 1}`,
    title: element,
    kind: "element",
    projectIds,
    summary: `${element} 구성 요소 후보`,
    confidence: 0.78,
    warnings: ["임시 추출기 사용"],
  }));
  const relatedNodes = relatedCandidates.map((related, index) => ({
    tempId: `${documentVersionId}-related-${index + 1}`,
    title: related,
    kind: "concept",
    projectIds,
    summary: `${related} 관련 개념 후보`,
    confidence: 0.7,
    warnings: ["임시 추출기 사용"],
  }));
  const documentNodeId = `${documentVersionId}-document`;
  const documentProjectEdges = projectNodes.map((node, index) => ({
    tempId: `${documentVersionId}-edge-project-${index + 1}`,
    fromTempId: documentNodeId,
    toTempId: node.tempId,
    type: "references_project",
    label: "연결 프로젝트",
    confidence: 0.86,
  }));
  const documentDomainEdges = domainNodes.map((node, index) => ({
    tempId: `${documentVersionId}-edge-domain-${index + 1}`,
    fromTempId: documentNodeId,
    toTempId: node.tempId,
    type: "describes_domain",
    label: "문서 도메인",
    confidence: 0.84,
  }));
  const domainCapabilityEdges = capabilityNodes.map((node, index) => ({
    tempId: `${documentVersionId}-edge-capability-${index + 1}`,
    fromTempId: domainNodes[0]?.tempId || documentNodeId,
    toTempId: node.tempId,
    type: "has_capability",
    label: "도메인 기능",
    confidence: 0.8,
  }));
  const capabilityElementEdges = elementNodes.map((node, index) => ({
    tempId: `${documentVersionId}-edge-element-${index + 1}`,
    fromTempId: capabilityNodes[0]?.tempId || domainNodes[0]?.tempId || documentNodeId,
    toTempId: node.tempId,
    type: "has_element",
    label: "기능 구성 요소",
    confidence: 0.78,
  }));
  const relatedEdges = relatedNodes.map((node, index) => ({
    tempId: `${documentVersionId}-edge-related-${index + 1}`,
    fromTempId: documentNodeId,
    toTempId: node.tempId,
    type: "relates_concept",
    label: "관련 개념",
    confidence: 0.7,
  }));
  return {
    ...(accountId ? { accountId } : {}),
    jobId,
    documentId,
    documentVersionId,
    extractorVersion,
    provider: OUTPUT_PROVIDER,
    summary: `${title} ${kindLabel}를 바탕으로 만든 임시 추출 결과입니다.`,
    nodes: [
      {
        tempId: documentNodeId,
        title,
        kind: "document",
        projectIds,
        summary: `${projectIds.length}개 프로젝트와 ${domainNodes.length + capabilityNodes.length + elementNodes.length}개 ontology 후보를 포함한 문서 노드`,
        confidence: 1,
        evidence: [],
        warnings: ["임시 추출기 사용"],
      },
      ...projectNodes,
      ...domainNodes,
      ...capabilityNodes,
      ...elementNodes,
      ...relatedNodes,
    ],
    edges: [
      ...documentProjectEdges,
      ...documentDomainEdges,
      ...domainCapabilityEdges,
      ...capabilityElementEdges,
      ...relatedEdges,
    ],
    warnings: ["임시 추출기 사용"],
    createdAt: FieldValue.serverTimestamp(),
  };
}

/**
 * Gemini 가 반환한 { summary, nodes, edges } 를 downstream 파이프라인이 기대하는
 * output record 형태로 감싼다. stub 버전 (buildOutputRecord) 과 동일 shape.
 */
function buildGeminiOutputRecord({
  accountId,
  jobId,
  documentId,
  documentVersionId,
  extractorVersion,
  extraction,
}) {
  const normalizedNodes = extraction.nodes.map((node) => ({
    tempId: node.tempId,
    title: node.title,
    kind: node.kind,
    projectIds: Array.isArray(node.projectIds) ? node.projectIds : [],
    summary: node.summary,
    confidence: typeof node.confidence === "number" ? node.confidence : 0.7,
    evidence: [],
    warnings: Array.isArray(node.warnings) ? node.warnings : [],
  }));
  const normalizedEdges = extraction.edges.map((edge) => ({
    tempId: edge.tempId,
    fromTempId: edge.fromTempId,
    toTempId: edge.toTempId,
    type: edge.type,
    label: edge.label,
    confidence: typeof edge.confidence === "number" ? edge.confidence : 0.7,
  }));
  return {
    ...(accountId ? { accountId } : {}),
    jobId,
    documentId,
    documentVersionId,
    extractorVersion,
    provider: "gemini",
    summary: extraction.summary,
    nodes: normalizedNodes,
    edges: normalizedEdges,
    warnings: [],
    createdAt: FieldValue.serverTimestamp(),
  };
}

function markdownHeadings(markdown) {
  return markdown
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^#{1,3}\s+/.test(line))
    .map((line) => line.replace(/^#{1,3}\s+/, ""))
    .slice(0, 4);
}

function stripFrontmatter(markdown) {
  if (!markdown.startsWith("---")) return markdown;
  const lines = markdown.split(/\r?\n/);
  const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (endIndex === -1) return markdown;
  return lines.slice(endIndex + 1).join("\n");
}

function parseSimpleFrontmatter(markdown) {
  if (!markdown.startsWith("---")) return {};
  const lines = markdown.split(/\r?\n/);
  const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (endIndex === -1) return {};

  const frontmatter = {};
  let currentListKey = null;
  for (const rawLine of lines.slice(1, endIndex)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("- ") && currentListKey) {
      frontmatter[currentListKey] ??= [];
      frontmatter[currentListKey].push(line.slice(2).trim());
      continue;
    }

    currentListKey = null;
    const separatorIndex = rawLine.indexOf(":");
    if (separatorIndex === -1) continue;
    const key = rawLine.slice(0, separatorIndex).trim();
    const rawValue = rawLine.slice(separatorIndex + 1).trim();
    if (!rawValue) {
      currentListKey = key;
      frontmatter[key] = [];
      continue;
    }
    if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
      frontmatter[key] = rawValue
        .slice(1, -1)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      continue;
    }
    frontmatter[key] = rawValue;
  }
  return frontmatter;
}

function extractMarkdownListItems(markdown, headingKeywords) {
  const lines = markdown.split(/\r?\n/);
  const results = [];
  let active = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (/^#{1,3}\s+/.test(line)) {
      const title = line.replace(/^#{1,3}\s+/, "").toLowerCase();
      active = headingKeywords.some((keyword) => title.includes(keyword.toLowerCase()));
      continue;
    }
    if (!active) continue;
    if (line.startsWith("- ")) {
      results.push(line.slice(2).trim());
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      results.push(line.replace(/^\d+\.\s+/, "").trim());
      continue;
    }
    if (!line) {
      active = false;
    }
  }

  return [...new Set(results.filter(Boolean))];
}

function pickPrimaryHeadingByKeyword(headings, keywords) {
  const match = headings.find((heading) =>
    keywords.some((keyword) => heading.toLowerCase().includes(keyword.toLowerCase())),
  );
  return match ? [match] : [];
}

function normalizeStringArray(value) {
  return Array.isArray(value)
    ? [...new Set(value.map((item) => normalizeString(item)).filter(Boolean))]
    : [];
}

function normalizeKey(value) {
  return normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

async function commitWriteOperations(operations, chunkSize = 400) {
  if (!Array.isArray(operations) || operations.length === 0) {
    return;
  }

  for (let index = 0; index < operations.length; index += chunkSize) {
    const batch = db().batch();
    const currentChunk = operations.slice(index, index + chunkSize);
    currentChunk.forEach((operation) => {
      if (operation.type === "delete") {
        batch.delete(operation.ref);
        return;
      }

      batch.set(operation.ref, operation.data, operation.options || {});
    });
    await batch.commit();
  }
}

function buildCanonicalNodeId(node, documentId) {
  if (node.kind === "document") {
    return `document:${documentId}`;
  }

  if (node.kind === "project") {
    const projectKey = normalizeKey(node.projectIds?.[0] || node.title);
    return `project:${projectKey}`;
  }

  const scopeKey = normalizeKey(
    normalizeStringArray(node.projectIds).join("-") || "global",
  );
  return `${normalizeKey(node.kind)}:${scopeKey}:${normalizeKey(node.title)}`;
}

function resolveCanonicalParentId(node, documentId) {
  if (node.kind === "document") {
    const primaryProjectId = normalizeStringArray(node.projectIds)[0];
    return primaryProjectId ? `project:${normalizeKey(primaryProjectId)}` : null;
  }

  if (node.kind === "domain") {
    return `document:${documentId}`;
  }

  if (node.kind === "capability") {
    return `document:${documentId}`;
  }

  if (node.kind === "element") {
    return `document:${documentId}`;
  }

  return null;
}

function mapOutputEdgeType(type) {
  switch (type) {
    case "references_project":
      return "describes";
    case "describes_domain":
      return "belongs_to";
    case "has_capability":
    case "has_element":
      return "implements";
    case "relates_concept":
      return "related_to";
    default:
      return "related_to";
  }
}

function mergeUniqueStrings(...values) {
  return [
    ...new Set(
      values.flatMap((value) => {
        if (typeof value === "string") {
          const normalized = normalizeString(value);
          return normalized ? [normalized] : [];
        }
        return normalizeStringArray(value);
      }),
    ),
  ];
}

async function getLatestOutputRecord({
  accountId,
  documentId,
  documentVersionId,
  outputId,
}) {
  if (outputId) {
    const snapshot = await db().collection(COLLECTIONS.outputs).doc(outputId).get();
    if (!snapshot.exists) {
      throw new HttpsError("not-found", "추출 결과를 찾을 수 없습니다.");
    }
    return { id: snapshot.id, ...snapshot.data() };
  }

  const snapshot = await db()
    .collection(COLLECTIONS.outputs)
    .where("documentVersionId", "==", documentVersionId)
    .orderBy("createdAt", "desc")
    .limit(10)
    .get();
  const output = snapshot.docs
    .map((entry) => ({ id: entry.id, ...entry.data() }))
    .find((entry) => {
      const scopedOutputAccountId = normalizeAccountId(entry.accountId);
      return (
        normalizeString(entry.documentId) === documentId &&
        scopedOutputAccountId === normalizeAccountId(accountId)
      );
    });

  if (!output) {
    throw new HttpsError("failed-precondition", "승인할 추출 결과가 아직 없습니다.");
  }

  return output;
}

function buildEvidenceRecord({
  accountId,
  chunkId,
  chunkHash,
  documentId,
  documentVersionId,
  extractorVersion,
  markdown,
  outputId,
  versionHash,
}) {
  return {
    ...(accountId ? { accountId } : {}),
    documentId,
    documentVersionId,
    versionHash,
    chunkId,
    chunkHash,
    charStart: 0,
    charEnd: Math.min(markdown.length, 200),
    excerpt: markdown.slice(0, 200),
    locatorVersion: "v1",
    extractorVersion,
    sourceOutputId: outputId,
    createdAt: FieldValue.serverTimestamp(),
  };
}

async function transitionJobToProcessing(jobId) {
  const jobRef = db().collection(COLLECTIONS.jobs).doc(jobId);
  return db().runTransaction(async (transaction) => {
    const jobSnapshot = await transaction.get(jobRef);
    if (!jobSnapshot.exists) {
      throw new Error("Job not found");
    }

    const job = jobSnapshot.data();
    const currentStatus = normalizeString(job.status);
    if (currentStatus !== "queued") {
      return null;
    }

    const nextGeneration = Number(job.generation ?? 0) + 1;
    const nextAttemptCount = Number(job.attemptCount ?? 0) + 1;
    transaction.update(jobRef, {
      status: "processing",
      leaseOwner: "processExtractionJob",
      leaseExpiresAt: getNowLeaseExpiry(),
      generation: nextGeneration,
      attemptCount: nextAttemptCount,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      ...job,
      id: jobId,
      generation: nextGeneration,
      attemptCount: nextAttemptCount,
    };
  });
}

async function markJobSucceeded(jobRef, documentRef) {
  const batch = db().batch();
  batch.update(jobRef, {
    status: "succeeded",
    leaseOwner: FieldValue.delete(),
    leaseExpiresAt: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.update(documentRef, {
    latestJobStatus: "succeeded",
    status: "ready",
    updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
}

async function markJobFailed(jobRef, documentRef, error) {
  const message = error instanceof Error ? error.message : "unknown error";
  // cost_cap 은 pre-flight 가드에서 던진 명시적 실패 — 별도 errorCode 로 표시해
  // 검수자가 "비용 한도 초과 → 문서 chunk 분해" 처방 (runbook §6) 으로 즉시
  // 인지할 수 있게.
  let code = error instanceof HttpsError ? error.code : "process_failed";
  if (typeof message === "string" && message.startsWith("[cost_cap]")) {
    code = "cost_cap";
  }

  const batch = db().batch();
  batch.update(jobRef, {
    status: "failed",
    retryable: true,
    errorCode: code,
    errorMessage: message,
    nextAttemptAt: Timestamp.fromMillis(Date.now() + 30 * 1000),
    leaseOwner: FieldValue.delete(),
    leaseExpiresAt: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.update(documentRef, {
    latestJobStatus: "failed",
    status: "error",
    updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
}

export async function processExtractionJobCore(jobId, explicitAccountId) {
  const claimedJob = await transitionJobToProcessing(jobId);
  if (!claimedJob) {
    return { jobId, skipped: true };
  }

  const accountId = normalizeAccountId(explicitAccountId ?? claimedJob.accountId);
  const jobRef = db().collection(COLLECTIONS.jobs).doc(jobId);
  const documentRef = knowledgeDocumentRef(claimedJob.documentId, accountId);
  const versionRef = knowledgeVersionRef(claimedJob.documentVersionId, accountId);

  try {
    const [documentSnapshot, versionSnapshot] = await Promise.all([
      documentRef.get(),
      versionRef.get(),
    ]);

    if (!documentSnapshot.exists || !versionSnapshot.exists) {
      throw new Error("document or version not found");
    }

    const documentData = documentSnapshot.data();
    const versionData = versionSnapshot.data();
    const storagePath = normalizeString(versionData.storagePath);
    if (!storagePath) {
      throw new Error("version storagePath missing");
    }

    const markdown = await readMarkdownFromStorage(storagePath);
    if (markdown.includes("<!-- fail-extraction -->")) {
      throw new Error("forced extraction failure");
    }

    const chunkRef = db().collection(COLLECTIONS.chunks).doc();
    const outputRef = db().collection(COLLECTIONS.outputs).doc();
    const chunkRecord = buildChunkRecord({
      documentId: claimedJob.documentId,
      documentVersionId: claimedJob.documentVersionId,
      markdown,
    });
    const extractorVersion =
      normalizeString(claimedJob.extractorVersion) || OUTPUT_EXTRACTOR_VERSION;
    const title =
      normalizeString(versionData.title || documentData.title) || claimedJob.documentId;
    const kind = normalizeString(versionData.kind || documentData.kind) || "spec";
    const projectIds = Array.isArray(versionData.projectIds)
      ? versionData.projectIds
      : Array.isArray(documentData.projectIds)
        ? documentData.projectIds
        : [];

    // 라우팅: extractorVersion 이 "ontology-" 로 시작하면 신규 Anthropic
    // 워커 (T-4d). 그 외 ("gemini-v1" 등) 는 기존 Gemini 경로.
    let outputRecord;
    if (isOntologyExtractorVersion(extractorVersion)) {
      try {
        // T-11 cost cap + A0-3 chunk 분해.
        // 한 chunk 의 hard limit: 60_000 chars (~ sonnet input 18K tokens
        // ~ $0.054 — cap 근처). 한 markdown 이 커도 자동 분할 후 chunk 별
        // 추출 → merge. 절대 한도 = chunk 5 개 (5 × 60k = 300k chars,
        // ~$0.27). 그 이상은 cost_cap 으로 명시 실패 — 진안이 사전 분해.
        const MAX_CHUNK_SIZE = 60_000;
        const MAX_CHUNKS = 5;
        const apiKey = process.env.ANTHROPIC_API_KEY || "";
        if (!apiKey) {
          throw new Error("ANTHROPIC_API_KEY secret 미설정 — ontology 추출 불가");
        }
        const tbox = await loadOntologyTBox();
        const extraction = await extractOntologyChunked({
          markdown,
          classes: tbox.classes,
          relations: tbox.relations,
          apiKey,
          extractorVersion,
          documentId: claimedJob.documentId,
          maxChunkSize: MAX_CHUNK_SIZE,
          maxChunks: MAX_CHUNKS,
        });
        outputRecord = buildOntologyOutputRecord({
          accountId,
          jobId,
          documentId: claimedJob.documentId,
          documentVersionId: claimedJob.documentVersionId,
          extractorVersion,
          extraction,
          serverTimestamp: FieldValue.serverTimestamp(),
        });
        logger.info("[ontology] extraction succeeded", {
          jobId,
          grade: extraction.grade,
          nodes: extraction.output.nodes.length,
          edges: extraction.output.edges.length,
          inputTokens: extraction.usage?.inputTokens,
          outputTokens: extraction.usage?.outputTokens,
          estimatedCostUsd: extraction.usage?.estimatedCostUsd,
          latencyMs: extraction.latencyMs,
          chunkCount: extraction.chunkCount ?? 1,
        });
        // post-flight: 실제 비용이 cap 을 넘었으면 (pre-flight 만 char 추정이라
        // 실 토큰 분포에 따라 통과해도 가능) warning 로그 — 이미 비용 발생이라
        // throw 안 하고 검수자가 OutputBadges 의 "비용" chip 으로 인지.
        const COST_HARD_CAP_USD = 0.05;
        if (
          typeof extraction.usage?.estimatedCostUsd === "number"
          && extraction.usage.estimatedCostUsd > COST_HARD_CAP_USD
        ) {
          logger.warn("[ontology] cost cap exceeded post-flight", {
            jobId,
            estimatedCostUsd: extraction.usage.estimatedCostUsd,
            cap: COST_HARD_CAP_USD,
          });
        }
      } catch (err) {
        const reason = err?.message || String(err);
        logger.error("[ontology] extraction failed", { jobId, reason });
        // ontology 경로는 fallback 없음 — 명시적 실패로 검수자에게 알림.
        // (Gemini 경로의 stub-fallback 과 다른 정책: 정확도 검증 단계라 noise
        //  를 만들지 않는다.)
        throw err;
      }
    } else {
      // 기존 Gemini 경로 — 변경 없음. 실패 시 stub fallback.
      try {
        const extraction = await extractWithGemini({
          markdown,
          title,
          kind,
          projectIds,
          documentVersionId: claimedJob.documentVersionId,
        });
        outputRecord = buildGeminiOutputRecord({
          accountId,
          jobId,
          documentId: claimedJob.documentId,
          documentVersionId: claimedJob.documentVersionId,
          extractorVersion,
          extraction,
        });
        logger.info("[gemini] extraction succeeded", {
          jobId,
          nodes: extraction.nodes.length,
          edges: extraction.edges.length,
        });
      } catch (err) {
        const reason = err?.message || String(err);
        logger.warn("[gemini] fallback to stub", { jobId, reason });
        outputRecord = buildOutputRecord({
          accountId,
          jobId,
          documentId: claimedJob.documentId,
          documentVersionId: claimedJob.documentVersionId,
          markdown,
          extractorVersion,
          title,
          kind,
          projectIds,
        });
        outputRecord.provider = "stub-fallback";
        outputRecord.warnings = [
          ...(outputRecord.warnings || []),
          `gemini-failed: ${reason}`.slice(0, 200),
        ];
      }
    }
    const evidenceRef = db().collection(COLLECTIONS.evidence).doc();
    const evidenceRecord = buildEvidenceRecord({
      accountId,
      chunkId: chunkRef.id,
      chunkHash: chunkRecord.chunkHash,
      documentId: claimedJob.documentId,
      documentVersionId: claimedJob.documentVersionId,
      extractorVersion:
        normalizeString(claimedJob.extractorVersion) || OUTPUT_EXTRACTOR_VERSION,
      markdown,
      outputId: outputRef.id,
      versionHash: normalizeString(versionData.hash),
    });

    const batch = db().batch();
    batch.set(chunkRef, chunkRecord);
    batch.set(outputRef, outputRecord);
    batch.set(evidenceRef, evidenceRecord);
    await batch.commit();

    await markJobSucceeded(jobRef, documentRef);

    logger.info("processExtractionJob succeeded", {
      documentId: claimedJob.documentId,
      documentVersionId: claimedJob.documentVersionId,
      jobId,
      chunkId: chunkRef.id,
      outputId: outputRef.id,
      evidenceId: evidenceRef.id,
    });

    return {
      jobId,
      skipped: false,
      outputId: outputRef.id,
    };
  } catch (error) {
    await markJobFailed(jobRef, documentRef, error);
    logger.error("processExtractionJob failed", {
      documentId: claimedJob.documentId,
      documentVersionId: claimedJob.documentVersionId,
      jobId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function reclaimStaleExtractionJobsCore() {
  const now = Timestamp.now();
  const snapshot = await db()
    .collection(COLLECTIONS.jobs)
    .where("status", "in", ["leased", "processing"])
    .where("leaseExpiresAt", "<=", now)
    .get();

  if (snapshot.empty) {
    return { reclaimed: 0 };
  }

  const batch = db().batch();
  for (const doc of snapshot.docs) {
    batch.update(doc.ref, {
      status: "failed",
      retryable: true,
      errorCode: "stale_lease",
      errorMessage: "lease expired before completion",
      leaseOwner: FieldValue.delete(),
      leaseExpiresAt: FieldValue.delete(),
      nextAttemptAt: Timestamp.fromMillis(Date.now() + 30 * 1000),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();

  logger.info("reclaimStaleExtractionJobs", { reclaimed: snapshot.size });
  return { reclaimed: snapshot.size };
}

export async function applyReviewActionCore({
  accountId,
  documentId,
  documentVersionId,
  outputId,
  acceptedNodeTempIds,
  acceptedEdgeTempIds,
  requestedBy,
}) {
  const scopedAccountId = normalizeAccountId(accountId);
  const latestOutput = await getLatestOutputRecord({
    accountId: scopedAccountId,
    documentId,
    documentVersionId,
    outputId,
  });
  const evidenceSnapshot = await db()
    .collection(COLLECTIONS.evidence)
    .where("sourceOutputId", "==", latestOutput.id)
    .get();
  const evidenceIds = evidenceSnapshot.docs
    .map((entry) => entry.id)
    .filter(Boolean);
  const allNodes = Array.isArray(latestOutput.nodes) ? latestOutput.nodes : [];
  const allEdges = Array.isArray(latestOutput.edges) ? latestOutput.edges : [];

  // Partial approve — acceptedNodeTempIds / acceptedEdgeTempIds 가 제공되면
  // 그 tempId 만 승인. 미제공 (undefined) 이면 기존 동작 (전체 승인). 빈
  // 배열은 "아무것도 승인 안 함" 으로 해석돼 evidenceIds 만 기록되는 셈인데
  // 그럴 거면 reject_output 을 쓰는 게 자연스러움 — 명시 거절.
  const acceptNodeIds =
    acceptedNodeTempIds === undefined ? null : normalizeStringArray(acceptedNodeTempIds);
  const acceptEdgeIds =
    acceptedEdgeTempIds === undefined ? null : normalizeStringArray(acceptedEdgeTempIds);
  const outputNodes =
    acceptNodeIds === null
      ? allNodes
      : allNodes.filter((n) => acceptNodeIds.includes(normalizeString(n?.tempId)));
  const outputEdges =
    acceptEdgeIds === null
      ? allEdges
      : allEdges.filter((e) => acceptEdgeIds.includes(normalizeString(e?.tempId)));

  if (acceptNodeIds !== null && outputNodes.length === 0 && acceptEdgeIds === null) {
    throw new HttpsError(
      "invalid-argument",
      "acceptedNodeTempIds 가 output 의 후보 tempId 와 일치하지 않습니다.",
    );
  }
  const reviewRef = db().collection(COLLECTIONS.reviews).doc();
  const approvalEventRef = db().collection(COLLECTIONS.approvalEvents).doc();
  const approvedAt = FieldValue.serverTimestamp();
  const canonicalNodeIdByTempId = new Map();
  const parentIdByCanonicalId = new Map();

  for (const node of outputNodes) {
    const canonicalId = buildCanonicalNodeId(node, documentId);
    canonicalNodeIdByTempId.set(node.tempId, canonicalId);
  }

  for (const edge of outputEdges) {
    const from = canonicalNodeIdByTempId.get(edge.fromTempId);
    const to = canonicalNodeIdByTempId.get(edge.toTempId);
    if (!from || !to) continue;
    if (["describes_domain", "has_capability", "has_element"].includes(edge.type)) {
      parentIdByCanonicalId.set(to, from);
    }
  }

  const nodeRefs = [...new Set([...canonicalNodeIdByTempId.values()])].map((id) =>
    db().collection(COLLECTIONS.approvedNodes).doc(id),
  );
  const edgePayloads = outputEdges
    .map((edge) => {
      const from = canonicalNodeIdByTempId.get(edge.fromTempId);
      const to = canonicalNodeIdByTempId.get(edge.toTempId);
      if (!from || !to) return null;
      const type = mapOutputEdgeType(edge.type);
      return {
        id: `${type}:${from}->${to}`,
        from,
        to,
        type,
        label: normalizeString(edge.label) || undefined,
      };
    })
    .filter(Boolean);
  const edgeRefs = edgePayloads.map((edge) =>
    db().collection(COLLECTIONS.approvedEdges).doc(edge.id),
  );

  const existingSnapshots = await db().getAll(...nodeRefs, ...edgeRefs);
  const existingNodeMap = new Map();
  const existingEdgeMap = new Map();

  for (const snapshot of existingSnapshots) {
    if (!snapshot.exists) continue;
    if (snapshot.ref.parent.id === COLLECTIONS.approvedNodes) {
      existingNodeMap.set(snapshot.id, snapshot.data());
      continue;
    }
    if (snapshot.ref.parent.id === COLLECTIONS.approvedEdges) {
      existingEdgeMap.set(snapshot.id, snapshot.data());
    }
  }

  const batch = db().batch();
  const approvedNodeIds = [];
  const approvedEdgeIds = [];

  batch.set(reviewRef, {
    ...(scopedAccountId ? { accountId: scopedAccountId } : {}),
    type: "approve_output",
    status: "approved",
    documentId,
    documentVersionId,
    outputId: latestOutput.id,
    assignedTo: requestedBy,
    createdAt: approvedAt,
    updatedAt: approvedAt,
  });

  for (const node of outputNodes) {
    const canonicalId = canonicalNodeIdByTempId.get(node.tempId);
    if (!canonicalId) continue;
    const existingNode = existingNodeMap.get(canonicalId) || {};
    const projectIds = mergeUniqueStrings(existingNode.projectIds, node.projectIds);
    const parentId =
      existingNode.parentId ||
      parentIdByCanonicalId.get(canonicalId) ||
      resolveCanonicalParentId(node, documentId) ||
      null;
    batch.set(
      db().collection(COLLECTIONS.approvedNodes).doc(canonicalId),
      {
        ...(scopedAccountId ? { accountId: scopedAccountId } : {}),
        id: canonicalId,
        title: normalizeString(node.title) || canonicalId,
        kind: normalizeString(node.kind) || "unknown",
        projectIds,
        ...(parentId ? { parentId } : {}),
        summary:
          normalizeString(node.summary) || normalizeString(existingNode.summary),
        evidenceIds: mergeUniqueStrings(existingNode.evidenceIds, evidenceIds),
        currentRevisionId: approvalEventRef.id,
        lastApprovedAt: approvedAt,
        lastApprovedBy: requestedBy,
        sourceDocumentIds: mergeUniqueStrings(
          existingNode.sourceDocumentIds,
          documentId,
        ),
        sourceOutputIds: mergeUniqueStrings(
          existingNode.sourceOutputIds,
          latestOutput.id,
        ),
      },
      { merge: true },
    );
    approvedNodeIds.push(canonicalId);
  }

  for (const edge of edgePayloads) {
    const existingEdge = existingEdgeMap.get(edge.id) || {};
    batch.set(
      db().collection(COLLECTIONS.approvedEdges).doc(edge.id),
      {
        ...(scopedAccountId ? { accountId: scopedAccountId } : {}),
        id: edge.id,
        from: edge.from,
        to: edge.to,
        type: edge.type,
        ...(edge.label ? { label: edge.label } : {}),
        projectIds: mergeUniqueStrings(
          existingEdge.projectIds,
          [
            ...(existingNodeMap.get(edge.from)?.projectIds || []),
            ...(existingNodeMap.get(edge.to)?.projectIds || []),
          ],
          outputNodes
            .filter(
              (node) =>
                canonicalNodeIdByTempId.get(node.tempId) === edge.from ||
                canonicalNodeIdByTempId.get(node.tempId) === edge.to,
            )
            .flatMap((node) => normalizeStringArray(node.projectIds)),
        ),
        evidenceIds: mergeUniqueStrings(existingEdge.evidenceIds, evidenceIds),
        currentRevisionId: approvalEventRef.id,
        lastApprovedAt: approvedAt,
        lastApprovedBy: requestedBy,
        sourceDocumentIds: mergeUniqueStrings(
          existingEdge.sourceDocumentIds,
          documentId,
        ),
        sourceOutputIds: mergeUniqueStrings(
          existingEdge.sourceOutputIds,
          latestOutput.id,
        ),
      },
      { merge: true },
    );
    approvedEdgeIds.push(edge.id);
  }

  batch.set(approvalEventRef, {
    ...(scopedAccountId ? { accountId: scopedAccountId } : {}),
    reviewId: reviewRef.id,
    documentId,
    documentVersionId,
    outputId: latestOutput.id,
    approvedNodeIds,
    approvedEdgeIds,
    createdAt: approvedAt,
    createdBy: requestedBy,
  });

  await batch.commit();

  logger.info("applyReviewAction approved output", {
    accountId: scopedAccountId,
    documentId,
    documentVersionId,
    outputId: latestOutput.id,
    approvedNodeCount: approvedNodeIds.length,
    approvedEdgeCount: approvedEdgeIds.length,
  });

  return {
    reviewId: reviewRef.id,
    approvalEventId: approvalEventRef.id,
    outputId: latestOutput.id,
    approvedNodeCount: approvedNodeIds.length,
    approvedEdgeCount: approvedEdgeIds.length,
  };
}

/**
 * rejectOutputCore — output 의 일부 또는 전체 후보를 거절로 기록.
 *
 * T-11 정확도 측정의 분모(전체 후보 = approve + reject) 보존을 목적으로 한다.
 * `knowledgeApprovedNodes/Edges` 는 건드리지 않고, `knowledgeReviews` +
 * `knowledgeApprovalEvents` 에만 거절 사실을 남긴다.
 *
 * 입력:
 *   - rejectedNodeTempIds[] / rejectedEdgeTempIds[] — 미제공 또는 빈 배열이면
 *     "전체 거절" 로 간주 (output 의 모든 nodes/edges).
 *   - reason — 거절 사유 (선택). 같은 doc 재추출 시 같은 잘못된 후보를 다시
 *     보면 검수자가 즉시 인지하도록 텍스트로 보존.
 *
 * 동작:
 *   1. latestOutput read.
 *   2. reviewRef: type="reject_output", status="rejected".
 *   3. approvalEvent: rejectedNodeTempIds, rejectedEdgeTempIds, reason 기록.
 *   4. approvedNodes/Edges 무변경.
 *
 * partial approve (한 output 에서 일부만 승인) 는 P1 — 별도 fire.
 */
export async function rejectOutputCore({
  accountId,
  documentId,
  documentVersionId,
  outputId,
  rejectedNodeTempIds,
  rejectedEdgeTempIds,
  reason,
  requestedBy,
}) {
  const scopedAccountId = normalizeAccountId(accountId);
  const latestOutput = await getLatestOutputRecord({
    accountId: scopedAccountId,
    documentId,
    documentVersionId,
    outputId,
  });

  const outputNodes = Array.isArray(latestOutput.nodes) ? latestOutput.nodes : [];
  const outputEdges = Array.isArray(latestOutput.edges) ? latestOutput.edges : [];

  const allNodeTempIds = outputNodes
    .map((n) => normalizeString(n?.tempId))
    .filter(Boolean);
  const allEdgeTempIds = outputEdges
    .map((e) => normalizeString(e?.tempId))
    .filter(Boolean);

  const requestedNodeIds = normalizeStringArray(rejectedNodeTempIds);
  const requestedEdgeIds = normalizeStringArray(rejectedEdgeTempIds);

  const isFullReject =
    requestedNodeIds.length === 0 && requestedEdgeIds.length === 0;

  const finalNodeIds = isFullReject
    ? allNodeTempIds
    : requestedNodeIds.filter((id) => allNodeTempIds.includes(id));
  const finalEdgeIds = isFullReject
    ? allEdgeTempIds
    : requestedEdgeIds.filter((id) => allEdgeTempIds.includes(id));

  if (
    !isFullReject &&
    finalNodeIds.length === 0 &&
    finalEdgeIds.length === 0
  ) {
    throw new HttpsError(
      "invalid-argument",
      "rejectedNodeTempIds 또는 rejectedEdgeTempIds 가 output 의 후보와 일치하지 않습니다.",
    );
  }

  const reviewRef = db().collection(COLLECTIONS.reviews).doc();
  const approvalEventRef = db().collection(COLLECTIONS.approvalEvents).doc();
  const rejectedAt = FieldValue.serverTimestamp();
  const trimmedReason = normalizeString(reason);

  const batch = db().batch();

  batch.set(reviewRef, {
    ...(scopedAccountId ? { accountId: scopedAccountId } : {}),
    type: "reject_output",
    status: "rejected",
    documentId,
    documentVersionId,
    outputId: latestOutput.id,
    rejectedNodeTempIds: finalNodeIds,
    rejectedEdgeTempIds: finalEdgeIds,
    ...(trimmedReason ? { reason: trimmedReason } : {}),
    assignedTo: requestedBy,
    createdAt: rejectedAt,
    updatedAt: rejectedAt,
  });

  batch.set(approvalEventRef, {
    ...(scopedAccountId ? { accountId: scopedAccountId } : {}),
    reviewId: reviewRef.id,
    type: "reject_output",
    documentId,
    documentVersionId,
    outputId: latestOutput.id,
    rejectedNodeTempIds: finalNodeIds,
    rejectedEdgeTempIds: finalEdgeIds,
    ...(trimmedReason ? { reason: trimmedReason } : {}),
    createdAt: rejectedAt,
    createdBy: requestedBy,
  });

  await batch.commit();

  logger.info("applyReviewAction rejected output", {
    accountId: scopedAccountId,
    documentId,
    documentVersionId,
    outputId: latestOutput.id,
    rejectedNodeCount: finalNodeIds.length,
    rejectedEdgeCount: finalEdgeIds.length,
  });

  return {
    reviewId: reviewRef.id,
    approvalEventId: approvalEventRef.id,
    outputId: latestOutput.id,
    rejectedNodeCount: finalNodeIds.length,
    rejectedEdgeCount: finalEdgeIds.length,
  };
}

export async function publishKnowledgeProjectionCore({
  accountId,
  initiatedBy,
}) {
  const scopedAccountId = normalizeAccountId(accountId);
  let approvedNodesQuery = db().collection(COLLECTIONS.approvedNodes);
  let approvedEdgesQuery = db().collection(COLLECTIONS.approvedEdges);
  if (scopedAccountId) {
    approvedNodesQuery = approvedNodesQuery.where("accountId", "==", scopedAccountId);
    approvedEdgesQuery = approvedEdgesQuery.where("accountId", "==", scopedAccountId);
  }

  const [approvedNodesSnapshot, approvedEdgesSnapshot] = await Promise.all([
    approvedNodesQuery.get(),
    approvedEdgesQuery.get(),
  ]);
  let publicNodesQuery = db().collection(COLLECTIONS.publicNodes);
  let publicEdgesQuery = db().collection(COLLECTIONS.publicEdges);
  if (scopedAccountId) {
    publicNodesQuery = publicNodesQuery.where("accountId", "==", scopedAccountId);
    publicEdgesQuery = publicEdgesQuery.where("accountId", "==", scopedAccountId);
  }
  const [existingPublicNodesSnapshot, existingPublicEdgesSnapshot] = await Promise.all([
    publicNodesQuery.get(),
    publicEdgesQuery.get(),
  ]);
  const publishRef = db().collection(COLLECTIONS.publishes).doc();
  const publicMetaRef = db()
    .collection(COLLECTIONS.publicMeta)
    .doc(buildPublicMetaId(scopedAccountId));
  const startedAt = FieldValue.serverTimestamp();
  // soft-deleted (deletedAt 박힌) approved 노드/엣지는 publish 에서 제외 —
  // 공개 projection 에 폐기된 stub 이 새는 것을 막음.
  const approvedNodeDocs = approvedNodesSnapshot.docs.filter((s) => !s.data().deletedAt);
  const approvedEdgeDocs = approvedEdgesSnapshot.docs.filter((s) => !s.data().deletedAt);
  const approvedNodeIds = new Set(approvedNodeDocs.map((s) => s.id));
  const approvedEdgeIds = new Set(approvedEdgeDocs.map((s) => s.id));

  await publishRef.set({
    ...(scopedAccountId ? { accountId: scopedAccountId } : {}),
    id: publishRef.id,
    status: "running",
    initiatedBy,
    startedAt,
    sourceApprovedRevision: "mixed",
    nodeCount: approvedNodeDocs.length,
    edgeCount: approvedEdgeDocs.length,
    projectionVersion: PROJECTION_VERSION,
  });

  const writeOperations = [];

  for (const snapshot of approvedNodeDocs) {
    const data = snapshot.data();
    writeOperations.push({
      type: "set",
      ref: db().collection(COLLECTIONS.publicNodes).doc(snapshot.id),
      data: {
        ...(scopedAccountId ? { accountId: scopedAccountId } : {}),
        id: snapshot.id,
        title: normalizeString(data.title) || snapshot.id,
        kind: normalizeString(data.kind) || "unknown",
        projectIds: normalizeStringArray(data.projectIds),
        ...(normalizeString(data.parentId) ? { parentId: normalizeString(data.parentId) } : {}),
        ...(normalizeString(data.summary) ? { summary: normalizeString(data.summary) } : {}),
        evidenceCount: normalizeStringArray(data.evidenceIds).length,
        publishId: publishRef.id,
        projectionVersion: PROJECTION_VERSION,
        publishedAt: startedAt,
        lastApprovedAt: data.lastApprovedAt || startedAt,
      },
      options: { merge: true },
    });
  }

  for (const snapshot of approvedEdgeDocs) {
    const data = snapshot.data();
    writeOperations.push({
      type: "set",
      ref: db().collection(COLLECTIONS.publicEdges).doc(snapshot.id),
      data: {
        ...(scopedAccountId ? { accountId: scopedAccountId } : {}),
        id: snapshot.id,
        from: normalizeString(data.from),
        to: normalizeString(data.to),
        type: normalizeString(data.type) || "related_to",
        ...(normalizeString(data.label) ? { label: normalizeString(data.label) } : {}),
        projectIds: normalizeStringArray(data.projectIds),
        // 증거 갯수 — 클라이언트에서 edge 두께 가중 (evidence 많을수록 굵게)
        // 에 쓴다. nodes 와 동일한 명명규칙.
        evidenceCount: normalizeStringArray(data.evidenceIds).length,
        publishId: publishRef.id,
        projectionVersion: PROJECTION_VERSION,
        publishedAt: startedAt,
        lastApprovedAt: data.lastApprovedAt || startedAt,
      },
      options: { merge: true },
    });
  }

  for (const snapshot of existingPublicNodesSnapshot.docs) {
    if (!approvedNodeIds.has(snapshot.id)) {
      writeOperations.push({
        type: "delete",
        ref: snapshot.ref,
      });
    }
  }

  for (const snapshot of existingPublicEdgesSnapshot.docs) {
    if (!approvedEdgeIds.has(snapshot.id)) {
      writeOperations.push({
        type: "delete",
        ref: snapshot.ref,
      });
    }
  }

  writeOperations.push({
    type: "set",
    ref: publicMetaRef,
    data: {
      ...(scopedAccountId ? { accountId: scopedAccountId } : {}),
      currentPublishId: publishRef.id,
      projectionVersion: PROJECTION_VERSION,
      publishedAt: startedAt,
    },
    options: { merge: true },
  });

  writeOperations.push({
    type: "set",
    ref: publishRef,
    data: {
      status: "succeeded",
      completedAt: startedAt,
    },
    options: { merge: true },
  });

  await commitWriteOperations(writeOperations);

  // 공개 반영 성공 시, 이번 publish 에 포함된 approvedNodes/Edges 의
  // sourceDocumentIds 를 모아 해당 knowledgeDocuments 의 status 를
  // 'published' 로 전환. 공개 detail 페이지의 rule (isAccountPublic &&
  // status == 'published') 조건을 만족시키는 유일한 곳.
  const publishedDocumentIds = new Set();
  for (const snapshot of approvedNodesSnapshot.docs) {
    const data = snapshot.data();
    for (const docId of normalizeStringArray(data.sourceDocumentIds)) {
      publishedDocumentIds.add(docId);
    }
  }
  for (const snapshot of approvedEdgesSnapshot.docs) {
    const data = snapshot.data();
    for (const docId of normalizeStringArray(data.sourceDocumentIds)) {
      publishedDocumentIds.add(docId);
    }
  }

  if (publishedDocumentIds.size > 0) {
    const documentsRoot = scopedAccountId
      ? db()
          .collection("accounts")
          .doc(scopedAccountId)
          .collection(COLLECTIONS.documents)
      : db().collection(COLLECTIONS.documents);
    const docBatch = db().batch();
    for (const docId of publishedDocumentIds) {
      docBatch.set(
        documentsRoot.doc(docId),
        {
          status: "published",
          lastPublishedAt: startedAt,
          lastPublishId: publishRef.id,
        },
        { merge: true },
      );
    }
    await docBatch.commit();
  }

  logger.info("publishKnowledgeProjection succeeded", {
    accountId: scopedAccountId,
    publishId: publishRef.id,
    nodeCount: approvedNodesSnapshot.size,
    edgeCount: approvedEdgesSnapshot.size,
    publishedDocumentCount: publishedDocumentIds.size,
  });

  return {
    publishId: publishRef.id,
    nodeCount: approvedNodesSnapshot.size,
    edgeCount: approvedEdgesSnapshot.size,
    projectionVersion: PROJECTION_VERSION,
  };
}

export const enqueueExtractionJob = onCall(async (request) => {
  ensureApp();

  const email = normalizeString(request.auth?.token?.email);
  if (!email) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }

  const documentId = normalizeString(request.data?.documentId);
  const documentVersionId = normalizeString(request.data?.documentVersionId);
  const accountId = normalizeAccountId(request.data?.accountId);
  const extractorVersion =
    normalizeString(request.data?.extractorVersion) || OUTPUT_EXTRACTOR_VERSION;

  if (!documentId || !documentVersionId) {
    throw new HttpsError(
      "invalid-argument",
      "documentId와 documentVersionId는 필수입니다.",
    );
  }

  const adminRef = db().collection(COLLECTIONS.admins).doc(email);
  const adminSnapshot = await adminRef.get();
  if (!adminSnapshot.exists) {
    throw new HttpsError("permission-denied", "화이트리스트 관리자만 실행할 수 있습니다.");
  }

  const documentRef = knowledgeDocumentRef(documentId, accountId);
  const versionRef = knowledgeVersionRef(documentVersionId, accountId);
  const idempotencyKey = buildIdempotencyKey(accountId, documentVersionId, extractorVersion);
  let existingJobQuery = db()
    .collection(COLLECTIONS.jobs)
    .where("idempotencyKey", "==", idempotencyKey)
    .orderBy("createdAt", "desc")
    .limit(1);
  if (accountId) {
    existingJobQuery = db()
      .collection(COLLECTIONS.jobs)
      .where("accountId", "==", accountId)
      .where("idempotencyKey", "==", idempotencyKey)
      .orderBy("createdAt", "desc")
      .limit(1);
  }

  const result = await db().runTransaction(async (transaction) => {
    const [documentSnapshot, versionSnapshot, existingSnapshot] = await Promise.all([
      transaction.get(documentRef),
      transaction.get(versionRef),
      transaction.get(existingJobQuery),
    ]);

    if (!documentSnapshot.exists) {
      throw new HttpsError("not-found", "문서를 찾을 수 없습니다.");
    }

    if (!versionSnapshot.exists) {
      throw new HttpsError("not-found", "문서 버전을 찾을 수 없습니다.");
    }

    if (versionSnapshot.get("documentId") !== documentId) {
      throw new HttpsError(
        "failed-precondition",
        "선택한 버전이 문서와 일치하지 않습니다.",
      );
    }

    const existingJobDoc = existingSnapshot.docs[0];
    if (existingJobDoc) {
      const existingJob = existingJobDoc.data();
      const existingStatus = normalizeString(existingJob.status);

      if (isAllowedExistingStatus(existingStatus)) {
        return {
          jobId: existingJobDoc.id,
          created: false,
          status: existingStatus,
          idempotencyKey,
        };
      }
    }

    const jobRef = db().collection(COLLECTIONS.jobs).doc();
    transaction.set(
      jobRef,
      createJobPayload({
        accountId,
        documentId,
        documentVersionId,
        extractorVersion,
        idempotencyKey,
        requestedBy: email,
      }),
    );
    transaction.update(documentRef, {
      latestJobStatus: "queued",
      status: "processing",
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      jobId: jobRef.id,
      created: true,
      status: "queued",
      idempotencyKey,
    };
  });

  logger.info("enqueueExtractionJob", {
    documentId,
    documentVersionId,
    extractorVersion,
    idempotencyKey,
    created: result.created,
    jobId: result.jobId,
  });

  return result;
});

export const processExtractionJob = onDocumentCreated(
  {
    document: `${COLLECTIONS.jobs}/{jobId}`,
    secrets: [GEMINI_API_KEY, ANTHROPIC_API_KEY],
  },
  async (event) => {
    ensureApp();
    const jobId = event.params.jobId;
    if (!jobId) return;

    try {
      await processExtractionJobCore(jobId);
    } catch (error) {
      console.error("processExtractionJob trigger failed", jobId, error);
    }
  },
);

export const reclaimStaleExtractionJobs = onSchedule(
  {
    schedule: "every 5 minutes",
    region: REGION,
  },
  async () => {
    ensureApp();
    await reclaimStaleExtractionJobsCore();
  },
);

export const applyReviewAction = onCall(async (request) => {
  ensureApp();

  const email = normalizeString(request.auth?.token?.email);
  if (!email) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }

  const adminSnapshot = await db().collection(COLLECTIONS.admins).doc(email).get();
  if (!adminSnapshot.exists) {
    throw new HttpsError("permission-denied", "화이트리스트 관리자만 실행할 수 있습니다.");
  }

  const action = normalizeString(request.data?.action);
  if (action !== "approve_output" && action !== "reject_output") {
    throw new HttpsError("invalid-argument", "지원하지 않는 review action입니다.");
  }

  const documentId = normalizeString(request.data?.documentId);
  const documentVersionId = normalizeString(request.data?.documentVersionId);
  const outputId = normalizeString(request.data?.outputId) || undefined;
  const accountId = normalizeAccountId(request.data?.accountId);

  if (!documentId || !documentVersionId) {
    throw new HttpsError(
      "invalid-argument",
      "documentId와 documentVersionId는 필수입니다.",
    );
  }

  if (action === "reject_output") {
    return rejectOutputCore({
      accountId,
      documentId,
      documentVersionId,
      outputId,
      rejectedNodeTempIds: request.data?.rejectedNodeTempIds,
      rejectedEdgeTempIds: request.data?.rejectedEdgeTempIds,
      reason: request.data?.reason,
      requestedBy: email,
    });
  }

  return applyReviewActionCore({
    accountId,
    documentId,
    documentVersionId,
    outputId,
    acceptedNodeTempIds: request.data?.acceptedNodeTempIds,
    acceptedEdgeTempIds: request.data?.acceptedEdgeTempIds,
    requestedBy: email,
  });
});

/**
 * promoteStubNode — stub placeholder 를 진짜 노드로 승격.
 *
 * 결정 문서: 2026-04-27-ontology-id-resolution.md §2.1
 *
 * 입력: { nodeId, newKind, accountId? }
 *   - nodeId: 현재 stub canonical (예: "unknown:iam")
 *   - newKind: 5 종 enum (project / domain / capability / element / document)
 *
 * 동작:
 *   1. stub 노드 read + isStub=true 확인
 *   2. 새 canonical = `<newKind>:<idFromStub>` (예: "project:iam")
 *   3. 새 노드 write — kind=newKind, isStub/pendingType/pendingFromId 제거
 *   4. 기존 stub 삭제
 *   5. stub 을 가리키던 edges 의 from/to id 를 새 id 로 rewrite.
 *      특히 (from=pendingFromId, to=oldStubId, type='related_to') edge 는
 *      pendingType (원본 type) 으로 복원.
 *   6. approvalEvents 에 promote 이벤트 기록.
 */
export async function promoteStubNodeCore({ nodeId, newKind, accountId, requestedBy }) {
  const allowedKinds = ['project', 'domain', 'capability', 'element', 'document'];
  if (!allowedKinds.includes(newKind)) {
    throw new HttpsError('invalid-argument', `newKind 는 ${allowedKinds.join('/')} 중 하나여야 합니다.`);
  }
  const scopedAccountId = normalizeAccountId(accountId);
  const oldRef = db().collection(COLLECTIONS.approvedNodes).doc(nodeId);
  const oldSnap = await oldRef.get();
  if (!oldSnap.exists) {
    throw new HttpsError('not-found', `node ${nodeId} 가 없습니다.`);
  }
  const oldData = oldSnap.data();
  if (!oldData.isStub) {
    throw new HttpsError('failed-precondition', `node ${nodeId} 는 stub 이 아닙니다.`);
  }

  // canonical 변환 — "unknown:iam" → "<newKind>:iam"
  const idPart = nodeId.startsWith('unknown:') ? nodeId.slice('unknown:'.length) : nodeId;
  const newId = `${newKind}:${idPart}`;
  if (newId === nodeId) {
    throw new HttpsError('failed-precondition', 'newKind 가 stub 와 같음');
  }
  const newRef = db().collection(COLLECTIONS.approvedNodes).doc(newId);
  const existingNew = await newRef.get();
  if (existingNew.exists) {
    throw new HttpsError(
      'already-exists',
      `${newId} 가 이미 존재 — 같은 id 의 다른 kind 노드와 충돌. 검수 필요.`,
    );
  }

  const pendingType = normalizeString(oldData.pendingType) || null;
  const pendingFromId = normalizeString(oldData.pendingFromId) || null;
  const approvedAt = FieldValue.serverTimestamp();
  const approvalEventRef = db().collection(COLLECTIONS.approvalEvents).doc();

  // 영향받는 edges 모음 — from 또는 to 가 oldId.
  const [edgesByFrom, edgesByTo] = await Promise.all([
    db().collection(COLLECTIONS.approvedEdges).where('from', '==', nodeId).get(),
    db().collection(COLLECTIONS.approvedEdges).where('to', '==', nodeId).get(),
  ]);
  const edgeUpdates = new Map(); // doc id → patch
  for (const snap of [...edgesByFrom.docs, ...edgesByTo.docs]) {
    const data = snap.data();
    const isFromOld = data.from === nodeId;
    const isToOld = data.to === nodeId;
    const patch = {};
    if (isFromOld) patch.from = newId;
    if (isToOld) patch.to = newId;
    // 원본 frontmatter edge 복원: from === pendingFromId, to === oldId, type === 'related_to'
    if (
      pendingFromId
      && pendingType
      && data.from === pendingFromId
      && isToOld
      && data.type === 'related_to'
    ) {
      patch.type = pendingType;
    }
    edgeUpdates.set(snap.ref, patch);
  }

  // 새 edge canonical id 도 type 변경 시 업데이트 — 기존 id 가 'related_to:from->oldId'
  // 형태라 type/to 변경 후 충돌하지 않게 그냥 새 id 로 옮긴다.
  // 실용성 목적상 edge id 자체는 안 건드림 (legacy). 검수자가 별도로 정리.

  const batch = db().batch();
  batch.set(newRef, {
    ...(scopedAccountId ? { accountId: scopedAccountId } : {}),
    id: newId,
    title: oldData.title,
    kind: newKind,
    projectIds: Array.isArray(oldData.projectIds) ? oldData.projectIds : [],
    summary: oldData.summary || '',
    evidenceIds: Array.isArray(oldData.evidenceIds) ? oldData.evidenceIds : [],
    currentRevisionId: approvalEventRef.id,
    lastApprovedAt: approvedAt,
    lastApprovedBy: requestedBy,
    promotedFromStub: nodeId,
  });
  batch.delete(oldRef);
  for (const [ref, patch] of edgeUpdates) {
    batch.update(ref, {
      ...patch,
      lastApprovedAt: approvedAt,
      lastApprovedBy: requestedBy,
      currentRevisionId: approvalEventRef.id,
    });
  }
  batch.set(approvalEventRef, {
    ...(scopedAccountId ? { accountId: scopedAccountId } : {}),
    type: 'promote_stub',
    fromNodeId: nodeId,
    toNodeId: newId,
    pendingTypeRestored: pendingType,
    edgesAffected: edgeUpdates.size,
    createdAt: approvedAt,
    createdBy: requestedBy,
  });
  await batch.commit();

  logger.info('promoteStubNode', {
    fromNodeId: nodeId,
    toNodeId: newId,
    edgesAffected: edgeUpdates.size,
  });

  return { fromNodeId: nodeId, toNodeId: newId, edgesAffected: edgeUpdates.size };
}

/**
 * dismissStubNode — stub 을 잘못된 reference 로 판단해 폐기 (soft-delete).
 *
 * 추적성 유지를 위해 hard delete 대신 `deletedAt`/`deletedBy`/`deletedReason`
 * 필드를 박는다. 잘못 dismiss 한 경우 진안이 Firestore 콘솔에서 필드를
 * 비우면 복구 가능. stub 의 원래 title/evidenceIds/pendingType 도 보존.
 *
 * UI 측 (`subscribeStubNodes`, `OntologyTree*`) 은 `deletedAt != null` 인
 * 노드를 자동 필터해 노출 안 함.
 */
export async function dismissStubNodeCore({ nodeId, accountId, requestedBy, reason }) {
  const scopedAccountId = normalizeAccountId(accountId);
  const ref = db().collection(COLLECTIONS.approvedNodes).doc(nodeId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', `node ${nodeId} 가 없습니다.`);
  }
  const data = snap.data();
  if (!data.isStub) {
    throw new HttpsError('failed-precondition', `node ${nodeId} 는 stub 이 아닙니다.`);
  }
  if (data.deletedAt) {
    throw new HttpsError('failed-precondition', `node ${nodeId} 는 이미 폐기됐습니다.`);
  }

  const [edgesByFrom, edgesByTo] = await Promise.all([
    db().collection(COLLECTIONS.approvedEdges).where('from', '==', nodeId).get(),
    db().collection(COLLECTIONS.approvedEdges).where('to', '==', nodeId).get(),
  ]);
  const allEdgeRefs = new Set();
  for (const s of [...edgesByFrom.docs, ...edgesByTo.docs]) allEdgeRefs.add(s.ref);

  const approvalEventRef = db().collection(COLLECTIONS.approvalEvents).doc();
  const deletedAt = FieldValue.serverTimestamp();
  const trimmedReason = normalizeString(reason);

  const batch = db().batch();
  // soft-delete: 노드 자체는 두고 deletedAt 등을 박는다.
  batch.update(ref, {
    deletedAt,
    deletedBy: requestedBy,
    ...(trimmedReason ? { deletedReason: trimmedReason } : {}),
    updatedAt: deletedAt,
  });
  // edges 도 동일 패턴 — hard delete 대신 deletedAt 박음. publish projection /
  // subscribeKnowledgeApprovedEdges 가 deletedAt 필터.
  for (const eref of allEdgeRefs) {
    batch.update(eref, {
      deletedAt,
      deletedBy: requestedBy,
      ...(trimmedReason ? { deletedReason: trimmedReason } : {}),
      updatedAt: deletedAt,
    });
  }
  batch.set(approvalEventRef, {
    ...(scopedAccountId ? { accountId: scopedAccountId } : {}),
    type: 'dismiss_stub',
    nodeId,
    edgesDeleted: allEdgeRefs.size,
    ...(trimmedReason ? { reason: trimmedReason } : {}),
    createdAt: deletedAt,
    createdBy: requestedBy,
  });
  await batch.commit();

  logger.info('dismissStubNode (soft)', { nodeId, edgesDeleted: allEdgeRefs.size });
  return { nodeId, edgesDeleted: allEdgeRefs.size };
}

export const promoteStubNode = onCall(async (request) => {
  ensureApp();
  const email = normalizeString(request.auth?.token?.email);
  if (!email) throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
  const adminSnap = await db().collection(COLLECTIONS.admins).doc(email).get();
  if (!adminSnap.exists) {
    throw new HttpsError('permission-denied', '화이트리스트 관리자만 실행할 수 있습니다.');
  }
  const nodeId = normalizeString(request.data?.nodeId);
  const newKind = normalizeString(request.data?.newKind);
  const accountId = normalizeAccountId(request.data?.accountId);
  if (!nodeId || !newKind) {
    throw new HttpsError('invalid-argument', 'nodeId 와 newKind 가 필요합니다.');
  }
  return promoteStubNodeCore({ nodeId, newKind, accountId, requestedBy: email });
});

export const dismissStubNode = onCall(async (request) => {
  ensureApp();
  const email = normalizeString(request.auth?.token?.email);
  if (!email) throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
  const adminSnap = await db().collection(COLLECTIONS.admins).doc(email).get();
  if (!adminSnap.exists) {
    throw new HttpsError('permission-denied', '화이트리스트 관리자만 실행할 수 있습니다.');
  }
  const nodeId = normalizeString(request.data?.nodeId);
  const accountId = normalizeAccountId(request.data?.accountId);
  if (!nodeId) throw new HttpsError('invalid-argument', 'nodeId 가 필요합니다.');
  return dismissStubNodeCore({
    nodeId,
    accountId,
    requestedBy: email,
    reason: request.data?.reason,
  });
});

export const publishKnowledgeProjection = onCall(async (request) => {
  ensureApp();

  const email = normalizeString(request.auth?.token?.email);
  if (!email) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }

  const adminSnapshot = await db().collection(COLLECTIONS.admins).doc(email).get();
  if (!adminSnapshot.exists) {
    throw new HttpsError("permission-denied", "화이트리스트 관리자만 실행할 수 있습니다.");
  }

  const accountId = normalizeAccountId(request.data?.accountId);
  return publishKnowledgeProjectionCore({
    accountId,
    initiatedBy: email,
  });
});

/**
 * 멤버 초대 — owner 가 자기 공간 (accountId) 에 editor/viewer 역할로
 * 다른 사용자를 추가한다. 초대된 사용자는 해당 이메일로 로그인하면
 * `listAccountMembershipsByEmail` 로 자동 attach 된다.
 *
 * Invariants:
 * - caller 는 accountId 공간의 owner 여야 함 (자기 공간은 owner=본인 uid)
 * - role 은 "editor" | "viewer" 만 허용 (추가 owner 초대는 별도 UI)
 * - email 은 정규화 (trim + lowercase) 필수
 * - membership doc id 규약: `invited:{email}__{accountId}` — 아직 uid 가
 *   없는 invited 상태라 이메일 기준 ID. 로그인 시 client 가 uid 동기화.
 */
export const inviteAccountMember = onCall(async (request) => {
  ensureApp();

  const callerEmail = normalizeString(request.auth?.token?.email);
  const callerUid = normalizeString(request.auth?.uid);
  if (!callerEmail || !callerUid) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }

  const accountId = normalizeAccountId(request.data?.accountId);
  const inviteeEmailRaw = normalizeString(request.data?.email);
  const role = normalizeString(request.data?.role);

  if (!accountId) {
    throw new HttpsError("invalid-argument", "accountId 가 필요합니다.");
  }
  if (!inviteeEmailRaw) {
    throw new HttpsError("invalid-argument", "초대할 이메일이 필요합니다.");
  }
  if (!["editor", "viewer"].includes(role)) {
    throw new HttpsError(
      "invalid-argument",
      "역할은 editor 또는 viewer 중 하나여야 합니다.",
    );
  }

  const inviteeEmail = inviteeEmailRaw.toLowerCase();
  if (inviteeEmail === callerEmail.toLowerCase()) {
    throw new HttpsError("invalid-argument", "자기 자신은 초대할 수 없습니다.");
  }

  // owner membership 확인. 자기 공간이면 {uid}__{uid}, 타 공간은 accountId 가
  // 다르고 owner 여야 함 (아직 owner 는 자기 자신만 가능하므로 accountId ==
  // callerUid 체크로 충분).
  const callerMembershipId = `${callerUid}__${accountId}`;
  const callerMembershipSnapshot = await db()
    .collection("accountMemberships")
    .doc(callerMembershipId)
    .get();

  if (
    !callerMembershipSnapshot.exists ||
    normalizeString(callerMembershipSnapshot.data()?.role) !== "owner"
  ) {
    throw new HttpsError(
      "permission-denied",
      "이 공간의 owner 만 다른 멤버를 초대할 수 있습니다.",
    );
  }

  // 같은 이메일의 기존 membership 있으면 role 만 upsert.
  const existingSnapshot = await db()
    .collection("accountMemberships")
    .where("accountId", "==", accountId)
    .where("email", "==", inviteeEmail)
    .limit(1)
    .get();

  const now = FieldValue.serverTimestamp();

  if (!existingSnapshot.empty) {
    const existingDoc = existingSnapshot.docs[0];
    await existingDoc.ref.set(
      {
        role,
        updatedAt: now,
        invitedBy: callerEmail,
      },
      { merge: true },
    );
    return {
      membershipId: existingDoc.id,
      accountId,
      email: inviteeEmail,
      role,
      status: "updated",
    };
  }

  // 새 invitation. uid 는 아직 없음 — invited email 기반 doc id.
  const membershipId = `invited:${inviteeEmail}__${accountId}`;
  await db()
    .collection("accountMemberships")
    .doc(membershipId)
    .set({
      accountId,
      email: inviteeEmail,
      role,
      invitedBy: callerEmail,
      createdAt: now,
      updatedAt: now,
    });

  logger.info("inviteAccountMember", {
    accountId,
    invitee: inviteeEmail,
    role,
    invitedBy: callerEmail,
  });

  return {
    membershipId,
    accountId,
    email: inviteeEmail,
    role,
    status: "created",
  };
});

/**
 * 멤버 제거 — owner 가 기존 멤버를 공간에서 내보낸다. 자기 자신 (owner) 은
 * 삭제 불가 (워크스페이스 소유권 이전은 별도 플로우).
 */
export const removeAccountMember = onCall(async (request) => {
  ensureApp();

  const callerEmail = normalizeString(request.auth?.token?.email);
  const callerUid = normalizeString(request.auth?.uid);
  if (!callerEmail || !callerUid) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }

  const accountId = normalizeAccountId(request.data?.accountId);
  const membershipId = normalizeString(request.data?.membershipId);
  if (!accountId || !membershipId) {
    throw new HttpsError(
      "invalid-argument",
      "accountId 와 membershipId 가 필요합니다.",
    );
  }

  const callerMembershipSnapshot = await db()
    .collection("accountMemberships")
    .doc(`${callerUid}__${accountId}`)
    .get();
  if (
    !callerMembershipSnapshot.exists ||
    normalizeString(callerMembershipSnapshot.data()?.role) !== "owner"
  ) {
    throw new HttpsError(
      "permission-denied",
      "이 공간의 owner 만 멤버를 내보낼 수 있습니다.",
    );
  }

  const targetRef = db().collection("accountMemberships").doc(membershipId);
  const targetSnapshot = await targetRef.get();
  if (!targetSnapshot.exists) {
    throw new HttpsError("not-found", "해당 멤버를 찾을 수 없습니다.");
  }

  const targetData = targetSnapshot.data();
  if (normalizeString(targetData?.role) === "owner") {
    throw new HttpsError(
      "failed-precondition",
      "owner 는 제거할 수 없습니다. 소유권 이전이 먼저 필요합니다.",
    );
  }
  if (normalizeString(targetData?.accountId) !== accountId) {
    throw new HttpsError(
      "failed-precondition",
      "accountId 가 일치하지 않습니다.",
    );
  }

  await targetRef.delete();

  logger.info("removeAccountMember", {
    accountId,
    membershipId,
    removedBy: callerEmail,
  });

  return { membershipId, status: "removed" };
});

/**
 * 워크스페이스 멤버 목록 — owner 가 자기 공간의 모든 멤버 (owner 포함) 를
 * 조회. client 가 직접 query 하면 rules 에 막히므로 Cloud Function 경유.
 */
export const listAccountMembers = onCall(async (request) => {
  ensureApp();

  const callerEmail = normalizeString(request.auth?.token?.email);
  const callerUid = normalizeString(request.auth?.uid);
  if (!callerEmail || !callerUid) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }

  const accountId = normalizeAccountId(request.data?.accountId);
  if (!accountId) {
    throw new HttpsError("invalid-argument", "accountId 가 필요합니다.");
  }

  // owner 확인
  const callerMembershipSnapshot = await db()
    .collection("accountMemberships")
    .doc(`${callerUid}__${accountId}`)
    .get();
  if (
    !callerMembershipSnapshot.exists ||
    normalizeString(callerMembershipSnapshot.data()?.role) !== "owner"
  ) {
    throw new HttpsError(
      "permission-denied",
      "이 공간의 owner 만 멤버 목록을 볼 수 있습니다.",
    );
  }

  const snapshot = await db()
    .collection("accountMemberships")
    .where("accountId", "==", accountId)
    .get();

  const members = snapshot.docs.map((doc) => {
    const data = doc.data();
    const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : null;
    const updatedAt = data.updatedAt instanceof Timestamp ? data.updatedAt.toMillis() : null;
    return {
      id: doc.id,
      accountId: normalizeString(data.accountId),
      email: normalizeString(data.email) || null,
      uid: normalizeString(data.uid) || null,
      role: normalizeString(data.role),
      invitedBy: normalizeString(data.invitedBy) || null,
      createdAt,
      updatedAt,
      pending: !data.uid, // uid 없으면 invited 상태
    };
  });

  return { members };
});
