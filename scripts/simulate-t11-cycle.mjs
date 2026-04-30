#!/usr/bin/env node

/**
 * T-11 측정 사이클 dry-run — 진안이 production 셋업 (Anthropic key /
 * functions deploy / TBox 시드) 전에 측정 인프라 자체를 검증하는 시뮬레이션.
 *
 * 동작:
 *   1. firestore emulator 가정 (FIRESTORE_EMULATOR_HOST 필수). 운영 DB 시드
 *      방지 — emulator 환경 변수 없으면 즉시 abort.
 *   2. dummy 추출 결과 (job + output + evidence) 를 N 개 시드.
 *   3. 후보 일부는 approve_output / 일부는 reject_output 으로 시뮬레이션.
 *   4. aggregate-extraction-metrics.mjs 를 spawn 해 4 임계값 자동 판정.
 *   5. 결과를 stdout 에 출력. fixture 가 있으면 --golden 까지 자동 호출.
 *
 * 사용법:
 *   firebase emulators:start --only firestore   # 별 터미널에서
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 \
 *   NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-aslan-project-map \
 *     node scripts/simulate-t11-cycle.mjs
 *
 * 옵션:
 *   --docs=N      시뮬레이션 문서 수 (기본 5).
 *   --account-id  account 한정 시드 (기본 "simulate-lab").
 *   --reset       기존 시뮬레이션 데이터를 먼저 삭제 후 시드.
 *   --golden      aggregate 에 --golden=scripts/fixtures/knowledge/ontology-golden 동시 호출.
 */

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const PROJECT_ID =
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  process.env.GCLOUD_PROJECT ||
  "demo-aslan-project-map";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    "[simulate-t11-cycle] FIRESTORE_EMULATOR_HOST 미설정 — 운영 DB 시드 방지로 abort.\n" +
      "  사용법: firebase emulators:start --only firestore (다른 터미널)\n" +
      "         그 다음 FIRESTORE_EMULATOR_HOST=localhost:8080 node scripts/simulate-t11-cycle.mjs",
  );
  process.exit(1);
}

const app = getApps()[0] ?? initializeApp({ projectId: PROJECT_ID });
const db = getFirestore(app);

function parseArgs(argv) {
  const args = { reset: false, golden: false };
  for (const raw of argv.slice(2)) {
    if (raw === "--reset") {
      args.reset = true;
      continue;
    }
    if (raw === "--golden") {
      args.golden = true;
      continue;
    }
    const m = raw.match(/^--([^=]+)=(.*)$/);
    if (!m) continue;
    args[m[1]] = m[2];
  }
  return args;
}

const SIM_TAG = "t11-simulation";

async function deleteSimulationData(accountId) {
  const cols = [
    "knowledgeExtractionJobs",
    "knowledgeExtractionOutputs",
    "knowledgeEvidence",
    "knowledgeReviews",
    "knowledgeApprovalEvents",
  ];
  let deleted = 0;
  for (const col of cols) {
    const snap = await db
      .collection(col)
      .where("simulationTag", "==", SIM_TAG)
      .get();
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    if (snap.size > 0) {
      await batch.commit();
      deleted += snap.size;
    }
  }
  console.log(`[simulate-t11-cycle] reset: ${deleted} docs 삭제`);
}

async function seedSimulation(docCount, accountId) {
  const docs = [];
  const writes = db.batch();

  for (let i = 0; i < docCount; i += 1) {
    const documentId = `sim-doc-${i + 1}`;
    const documentVersionId = `${documentId}-v1`;
    const jobId = `sim-job-${i + 1}`;
    const outputId = `sim-out-${i + 1}`;
    const evidenceId = `sim-evi-${i + 1}`;

    // dummy nodes/edges — i 마다 다른 후보 수.
    const nodes = [
      { tempId: "n-1", title: "사용자 로그인", kind: "capability", confidence: 0.92 },
      { tempId: "n-2", title: "JWT 토큰", kind: "element", confidence: 0.86 },
      { tempId: "n-3", title: "세션 관리", kind: "capability", confidence: 0.74 },
    ];
    const edges = [
      {
        tempId: "e-1",
        type: "depends_on",
        fromTempId: "n-1",
        toTempId: "n-2",
        confidence: 0.88,
      },
      {
        tempId: "e-2",
        type: "uses",
        fromTempId: "n-1",
        toTempId: "n-3",
        confidence: 0.71,
      },
    ];

    const inputTokens = 1200 + i * 350;
    const outputTokens = 280 + i * 60;
    const estimatedCostUsd =
      (inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15;

    // job
    writes.set(db.collection("knowledgeExtractionJobs").doc(jobId), {
      id: jobId,
      accountId,
      documentId,
      documentVersionId,
      status: i === docCount - 1 ? "failed" : "succeeded", // 1 개는 실패율 측정
      simulationTag: SIM_TAG,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // output
    writes.set(db.collection("knowledgeExtractionOutputs").doc(outputId), {
      id: outputId,
      accountId,
      jobId,
      documentId,
      documentVersionId,
      provider: "anthropic",
      grade: i % 3 === 0 ? "A" : i % 3 === 1 ? "B" : "C",
      nodes,
      edges,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      usage: { inputTokens, outputTokens, estimatedCostUsd },
      latencyMs: 1500 + i * 200,
      validationErrorCount: 0,
      simulationTag: SIM_TAG,
      createdAt: FieldValue.serverTimestamp(),
    });

    // evidence
    writes.set(db.collection("knowledgeEvidence").doc(evidenceId), {
      id: evidenceId,
      accountId,
      sourceOutputId: outputId,
      documentId,
      documentVersionId,
      simulationTag: SIM_TAG,
      createdAt: FieldValue.serverTimestamp(),
    });

    docs.push({ documentId, documentVersionId, outputId });
  }

  await writes.commit();

  // 검수 시뮬레이션 — 절반은 approve, 1 개는 reject (분모 분리 검증).
  const reviewWrites = db.batch();
  for (let i = 0; i < docs.length - 1; i += 1) {
    const { documentId, documentVersionId, outputId } = docs[i];
    const isReject = i === docs.length - 2; // 마지막 직전 1 개를 reject
    const reviewId = `sim-rev-${i + 1}`;
    const eventId = `sim-evt-${i + 1}`;

    if (isReject) {
      reviewWrites.set(db.collection("knowledgeReviews").doc(reviewId), {
        id: reviewId,
        accountId,
        type: "reject_output",
        status: "rejected",
        documentId,
        documentVersionId,
        outputId,
        rejectedNodeTempIds: ["n-3"],
        rejectedEdgeTempIds: ["e-2"],
        reason: "low confidence (sim)",
        simulationTag: SIM_TAG,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      reviewWrites.set(db.collection("knowledgeApprovalEvents").doc(eventId), {
        id: eventId,
        accountId,
        reviewId,
        type: "reject_output",
        documentId,
        documentVersionId,
        outputId,
        rejectedNodeTempIds: ["n-3"],
        rejectedEdgeTempIds: ["e-2"],
        simulationTag: SIM_TAG,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: "simulator",
      });
    } else {
      reviewWrites.set(db.collection("knowledgeReviews").doc(reviewId), {
        id: reviewId,
        accountId,
        type: "approve_output",
        status: "approved",
        documentId,
        documentVersionId,
        outputId,
        approvedNodeIds: ["n-1", "n-2", "n-3"],
        approvedEdgeIds: ["e-1", "e-2"],
        simulationTag: SIM_TAG,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      reviewWrites.set(db.collection("knowledgeApprovalEvents").doc(eventId), {
        id: eventId,
        accountId,
        reviewId,
        type: "approve_output",
        documentId,
        documentVersionId,
        outputId,
        approvedNodeIds: ["n-1", "n-2", "n-3"],
        approvedEdgeIds: ["e-1", "e-2"],
        simulationTag: SIM_TAG,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: "simulator",
      });
    }
  }
  await reviewWrites.commit();

  return docs.length;
}

async function main() {
  const args = parseArgs(process.argv);
  const accountId = args["account-id"] || "simulate-lab";
  const docCount = Math.max(1, parseInt(args.docs, 10) || 5);

  console.log(`[simulate-t11-cycle] target: ${PROJECT_ID} (emulator)`);
  console.log(`[simulate-t11-cycle] account=${accountId} docs=${docCount}`);

  if (args.reset) await deleteSimulationData(accountId);
  const seeded = await seedSimulation(docCount, accountId);
  console.log(`[simulate-t11-cycle] seeded ${seeded} 문서 + 추출/검수 시뮬레이션`);

  console.log("");
  console.log("[simulate-t11-cycle] aggregate-extraction-metrics 자동 호출 →");
  console.log("");

  const aggArgs = [
    resolve(process.cwd(), "scripts/aggregate-extraction-metrics.mjs"),
    `--account-id=${accountId}`,
    "--since=2020-01-01",
  ];
  if (args.golden) {
    aggArgs.push("--golden=scripts/fixtures/knowledge/ontology-golden");
  }
  const result = spawnSync("node", aggArgs, {
    stdio: "inherit",
    env: { ...process.env },
  });

  if (result.status !== 0) {
    console.error(`[simulate-t11-cycle] aggregate 실패 (exit ${result.status})`);
    process.exit(result.status ?? 1);
  }

  console.log("");
  console.log(
    "[simulate-t11-cycle] dry-run 끝. 시뮬레이션 데이터 정리: --reset 옵션으로 다시 실행.",
  );
}

main().catch((err) => {
  console.error("[simulate-t11-cycle] failed:", err);
  process.exit(1);
});
