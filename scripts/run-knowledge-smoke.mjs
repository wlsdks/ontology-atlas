import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import {
  applyReviewActionCore,
  processExtractionJobCore,
  publishKnowledgeProjectionCore,
} from "../functions/index.js";

const PROJECT_ID = process.env.GCLOUD_PROJECT || "demo-aslan-project-map";
const STORAGE_BUCKET = `${PROJECT_ID}.firebasestorage.app`;
const COLLECTIONS = {
  documents: "knowledgeDocuments",
  versions: "knowledgeDocumentVersions",
  jobs: "knowledgeExtractionJobs",
  chunks: "knowledgeDocumentChunks",
  outputs: "knowledgeExtractionOutputs",
  evidence: "knowledgeEvidence",
  approvedNodes: "knowledgeApprovedNodes",
  approvedEdges: "knowledgeApprovedEdges",
  publishes: "knowledgePublishes",
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

async function uploadMarkdown(storagePath, markdown) {
  const bucket = getStorage().bucket(STORAGE_BUCKET);
  await bucket.file(storagePath).save(markdown, {
    contentType: "text/markdown; charset=utf-8",
  });
}

async function createKnowledgeFixture({ suffix, markdown }) {
  const db = getFirestore();
  const documentId = `smoke-${suffix}`;
  const versionId = `${documentId}-v1`;
  const jobId = `${documentId}-job`;
  const storagePath = `knowledge-documents/${documentId}/${versionId}.md`;
  const now = Timestamp.now();

  await uploadMarkdown(storagePath, markdown);

  await db.collection(COLLECTIONS.documents).doc(documentId).set({
    title: `Smoke ${suffix}`,
    kind: "spec",
    projectIds: ["reactor"],
    sourceType: "manual",
    currentVersionId: versionId,
    status: "draft",
    createdBy: "smoke@local",
    createdAt: now,
    updatedAt: now,
  });

  await db.collection(COLLECTIONS.versions).doc(versionId).set({
    documentId,
    title: `Smoke ${suffix}`,
    kind: "spec",
    projectIds: ["reactor"],
    frontmatter: {},
    storagePath,
    mimeType: "text/markdown",
    sizeBytes: markdown.length,
    hash: `smoke-${suffix}`,
    createdBy: "smoke@local",
    createdAt: now,
  });

  await db.collection(COLLECTIONS.jobs).doc(jobId).set({
    documentId,
    documentVersionId: versionId,
    extractorVersion: "gemini-v1",
    idempotencyKey: `${versionId}:gemini-v1`,
    status: "queued",
    attemptCount: 0,
    maxAttempts: 3,
    retryable: true,
    generation: 0,
    requestedBy: "smoke@local",
    createdAt: now,
    updatedAt: now,
  });

  return {
    documentId,
    versionId,
    jobId,
  };
}

async function verifySuccessFlow() {
  const db = getFirestore();
  const suffix = randomUUID().slice(0, 8);
  const now = Timestamp.now();
  const fixture = await createKnowledgeFixture({
    suffix,
    markdown: "# Smoke Success\n\nThis is a successful placeholder extraction.",
  });
  const jobRef = db.collection(COLLECTIONS.jobs).doc(fixture.jobId);
  const result = await processExtractionJobCore(fixture.jobId);
  const jobSnapshot = await jobRef.get();
  const jobData = jobSnapshot.data();

  assert.equal(result.skipped, false);
  assert.ok(result.outputId, "output id should be returned");
  assert.ok(jobData, "job should exist after processing");
  assert.equal(jobData.status, "succeeded", "success fixture should succeed");

  const [chunks, outputs, evidence, documentSnapshot] = await Promise.all([
    db.collection(COLLECTIONS.chunks).where("documentId", "==", fixture.documentId).get(),
    db.collection(COLLECTIONS.outputs).where("jobId", "==", fixture.jobId).get(),
    db.collection(COLLECTIONS.evidence).where("documentId", "==", fixture.documentId).get(),
    db.collection(COLLECTIONS.documents).doc(fixture.documentId).get(),
  ]);

  assert.ok(!chunks.empty, "chunk should be persisted");
  assert.ok(!outputs.empty, "output should be persisted");
  assert.ok(!evidence.empty, "evidence should be persisted");
  assert.equal(documentSnapshot.get("latestJobStatus"), "succeeded");

  const outputId = outputs.docs[0]?.id;
  assert.ok(outputId, "output id should exist for approval");

  const approvalResult = await applyReviewActionCore({
    accountId: null,
    documentId: fixture.documentId,
    documentVersionId: fixture.versionId,
    outputId,
    requestedBy: "smoke@local",
  });
  assert.ok(approvalResult.approvedNodeCount > 0, "approved node count should be greater than 0");
  assert.ok(approvalResult.approvedEdgeCount > 0, "approved edge count should be greater than 0");

  const approvedNodes = await db
    .collection(COLLECTIONS.approvedNodes)
    .where("sourceDocumentIds", "array-contains", fixture.documentId)
    .get();
  const approvedEdges = await db
    .collection(COLLECTIONS.approvedEdges)
    .where("sourceDocumentIds", "array-contains", fixture.documentId)
    .get();
  assert.ok(!approvedNodes.empty, "approved nodes should be persisted");
  assert.ok(!approvedEdges.empty, "approved edges should be persisted");

  await db.collection(COLLECTIONS.publicNodes).doc(`stale-node-${suffix}`).set({
    id: `stale-node-${suffix}`,
    title: "stale node",
    kind: "concept",
    projectIds: ["reactor"],
    publishId: "stale",
    projectionVersion: "v0",
    publishedAt: now,
  });
  await db.collection(COLLECTIONS.publicEdges).doc(`stale-edge-${suffix}`).set({
    id: `stale-edge-${suffix}`,
    from: `stale-node-${suffix}`,
    to: `stale-node-${suffix}`,
    type: "related_to",
    projectIds: ["reactor"],
    publishId: "stale",
    projectionVersion: "v0",
    publishedAt: now,
  });

  const publishResult = await publishKnowledgeProjectionCore({
    accountId: null,
    initiatedBy: "smoke@local",
  });
  assert.ok(publishResult.nodeCount > 0, "published node count should be greater than 0");
  assert.ok(publishResult.edgeCount > 0, "published edge count should be greater than 0");

  const [publicNodes, publicEdges, publishes] = await Promise.all([
    db.collection(COLLECTIONS.publicNodes).get(),
    db.collection(COLLECTIONS.publicEdges).get(),
    db.collection(COLLECTIONS.publishes).get(),
  ]);
  assert.ok(!publicNodes.empty, "public nodes should be persisted");
  assert.ok(!publicEdges.empty, "public edges should be persisted");
  assert.ok(!publishes.empty, "publish history should be persisted");
  assert.equal(
    (await db.collection(COLLECTIONS.publicNodes).doc(`stale-node-${suffix}`).get()).exists,
    false,
    "stale public node should be removed during publish",
  );
  assert.equal(
    (await db.collection(COLLECTIONS.publicEdges).doc(`stale-edge-${suffix}`).get()).exists,
    false,
    "stale public edge should be removed during publish",
  );
}

async function verifyFailureFlow() {
  const db = getFirestore();
  const suffix = randomUUID().slice(0, 8);
  const fixture = await createKnowledgeFixture({
    suffix,
    markdown: "# Smoke Failure\n\n<!-- fail-extraction -->",
  });
  const jobRef = db.collection(COLLECTIONS.jobs).doc(fixture.jobId);
  await assert.rejects(
    () => processExtractionJobCore(fixture.jobId),
    /forced extraction failure/,
  );
  const jobSnapshot = await jobRef.get();
  const jobData = jobSnapshot.data();
  const documentSnapshot = await db.collection(COLLECTIONS.documents).doc(fixture.documentId).get();

  assert.ok(jobData, "job should exist after failure");
  assert.equal(jobData.status, "failed", "failure fixture should fail");
  assert.equal(jobData.errorCode, "process_failed");
  assert.equal(documentSnapshot.get("latestJobStatus"), "failed");
}

async function main() {
  ensureApp();

  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST is required");
  assert.ok(
    process.env.FIREBASE_STORAGE_EMULATOR_HOST,
    "FIREBASE_STORAGE_EMULATOR_HOST is required",
  );

  await verifySuccessFlow();
  await verifyFailureFlow();

  console.log("knowledge smoke passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
