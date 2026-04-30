#!/usr/bin/env node

/**
 * C-1 ontology 추출 측정 자동 집계.
 *
 * 출처: docs/superpowers/notes/2026-04-27-ontology-c1-runbook.md §5
 *
 * 4 임계값을 Firestore 직접 read 로 자동 계산한다 — 진안이 시트 수기 입력에
 * 의존하지 않게.
 *   1. 정확도 (≥ 0.80) = 승인된 후보 / (승인된 후보 + 거절된 후보)
 *   2. 단가 평균 ($/output) (≤ 0.05)
 *   3. 검수 cycle 중앙값 (시간) (≤ 24h) — output 생성 → 첫 review 까지
 *   4. 워커 실패율 (< 0.05) = failed jobs / total jobs
 *
 * 사용법 (production):
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *   NEXT_PUBLIC_FIREBASE_PROJECT_ID=<prod-project-id> \
 *     node scripts/aggregate-extraction-metrics.mjs [options]
 *
 * 사용법 (emulator):
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 \
 *   NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-aslan-project-map \
 *     node scripts/aggregate-extraction-metrics.mjs [options]
 *
 * Options:
 *   --since=YYYY-MM-DD     집계 시작일 (이후 createdAt). 기본 7 일 전.
 *   --until=YYYY-MM-DD     집계 끝일 (이전 createdAt). 기본 오늘.
 *   --account-id=<id>      특정 워크스페이스 한정. 미지정시 전체.
 *   --golden=<dir>         golden fixture 디렉토리. 제공 시 정확도를 사람
 *                          채점 대신 fixture vs 실 추출 결과 비교로 자동
 *                          판정 (precision/recall/F1). 비어 있으면 skip.
 *   --golden-mode=exact|fuzzy
 *                          매칭 방식. 기본 exact (정확 (kind,title) /
 *                          (type,fromTitle,toTitle) 비교). fuzzy 는
 *                          token-Jaccard 매칭 — LLM 이 살짝 다른 title 을
 *                          만들 때 (예: "사용자 로그인" vs "로그인 기능")
 *                          유사도 ≥ threshold 면 TP 로 인정.
 *   --golden-threshold=N   fuzzy 모드에서 token-Jaccard 임계값 (0~1, 기본 0.7).
 *   --json                 raw JSON 으로 출력 (CI 적재용).
 */

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const PROJECT_ID =
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  process.env.GCLOUD_PROJECT ||
  'demo-aslan-project-map';

const app = getApps()[0] ?? initializeApp({ projectId: PROJECT_ID });
const db = getFirestore(app);

const THRESHOLDS = {
  accuracy: { min: 0.80, label: '정확도', unit: '' },
  costPerOutputUsd: { max: 0.05, label: '단가', unit: '$' },
  reviewCycleHours: { max: 24, label: '검수 cycle 중앙값', unit: 'h' },
  failureRate: { max: 0.05, label: '워커 실패율', unit: '' },
};

function parseArgs(argv) {
  const args = { json: false };
  for (const raw of argv.slice(2)) {
    if (raw === '--json') {
      args.json = true;
      continue;
    }
    const m = raw.match(/^--([^=]+)=(.*)$/);
    if (!m) continue;
    args[m[1]] = m[2];
  }
  return args;
}

function parseDateOrNull(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function mean(values) {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function tsToDate(ts) {
  if (!ts) return null;
  if (ts instanceof Timestamp) return ts.toDate();
  if (typeof ts === 'object' && typeof ts._seconds === 'number') {
    return new Date(ts._seconds * 1000);
  }
  if (typeof ts === 'string') return new Date(ts);
  return null;
}

function inRange(ts, since, until) {
  const d = tsToDate(ts);
  if (!d) return false;
  if (since && d < since) return false;
  if (until && d > until) return false;
  return true;
}

async function fetchAll(collectionName, accountId) {
  let q = db.collection(collectionName);
  if (accountId) q = q.where('accountId', '==', accountId);
  const snap = await q.get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function main() {
  const args = parseArgs(process.argv);
  const since =
    parseDateOrNull(args.since) ??
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const until = parseDateOrNull(args.until) ?? new Date();
  const accountId = args['account-id'] || null;

  const [outputs, reviews, jobs] = await Promise.all([
    fetchAll('knowledgeExtractionOutputs', accountId),
    fetchAll('knowledgeReviews', accountId),
    fetchAll('knowledgeExtractionJobs', accountId),
  ]);

  const outputsInRange = outputs.filter((o) => inRange(o.createdAt, since, until));
  const reviewsInRange = reviews.filter((r) => inRange(r.createdAt, since, until));
  const jobsInRange = jobs.filter((j) => inRange(j.createdAt, since, until));

  // 1. 정확도
  const approveReviews = reviewsInRange.filter((r) => r.type === 'approve_output');
  const rejectReviews = reviewsInRange.filter((r) => r.type === 'reject_output');

  const approvedCount = approveReviews.reduce((sum, r) => {
    const event = (r.approvedNodeIds || []).length + (r.approvedEdgeIds || []).length;
    return sum + event;
  }, 0);
  // approve_output review 자체에는 approvedNodeIds 가 안 박힐 수 있음 — outputId 로 output 의 nodes/edges 길이를 보조 합산.
  const approvedFromOutputs = approveReviews.reduce((sum, r) => {
    if (!r.outputId) return sum;
    const out = outputs.find((o) => o.id === r.outputId);
    if (!out) return sum;
    const n = Array.isArray(out.nodes) ? out.nodes.length : 0;
    const e = Array.isArray(out.edges) ? out.edges.length : 0;
    return sum + n + e;
  }, 0);
  const approvedTotal = Math.max(approvedCount, approvedFromOutputs);

  const rejectedTotal = rejectReviews.reduce((sum, r) => {
    return (
      sum
      + (r.rejectedNodeTempIds || []).length
      + (r.rejectedEdgeTempIds || []).length
    );
  }, 0);

  const denominator = approvedTotal + rejectedTotal;
  const accuracy = denominator > 0 ? approvedTotal / denominator : null;

  // 2. 단가
  const costs = outputsInRange
    .map((o) => o?.usage?.estimatedCostUsd)
    .filter((v) => typeof v === 'number' && Number.isFinite(v));
  const costMean = mean(costs);
  const costMedian = median(costs);

  // 3. 검수 cycle (output createdAt → 같은 outputId 의 첫 review createdAt 까지)
  const cycleHours = [];
  for (const out of outputsInRange) {
    const outAt = tsToDate(out.createdAt);
    if (!outAt) continue;
    const firstReview = reviewsInRange
      .filter((r) => r.outputId === out.id)
      .map((r) => tsToDate(r.createdAt))
      .filter(Boolean)
      .sort((a, b) => a - b)[0];
    if (!firstReview) continue;
    const hours = (firstReview - outAt) / 3_600_000;
    if (hours >= 0) cycleHours.push(hours);
  }
  const cycleMedian = median(cycleHours);
  const cycleMean = mean(cycleHours);

  // 4. 워커 실패율
  const failedJobs = jobsInRange.filter((j) => j.status === 'failed').length;
  const totalJobs = jobsInRange.length;
  const failureRate = totalJobs > 0 ? failedJobs / totalJobs : null;

  // 5. (옵션) golden fixture 자동 채점.
  const goldenMode = args['golden-mode'] === 'fuzzy' ? 'fuzzy' : 'exact';
  const goldenThreshold = (() => {
    const raw = parseFloat(args['golden-threshold']);
    if (Number.isFinite(raw) && raw > 0 && raw <= 1) return raw;
    return 0.7;
  })();
  const goldenSummary = args.golden
    ? scoreAgainstGolden(args.golden, outputsInRange, approveReviews, outputs, {
        mode: goldenMode,
        threshold: goldenThreshold,
      })
    : null;

  const summary = {
    range: { since: since.toISOString(), until: until.toISOString() },
    accountId,
    counts: {
      outputs: outputsInRange.length,
      reviews: reviewsInRange.length,
      approveReviews: approveReviews.length,
      rejectReviews: rejectReviews.length,
      jobs: totalJobs,
      failedJobs,
    },
    metrics: {
      accuracy,
      approvedTotal,
      rejectedTotal,
      costPerOutputMeanUsd: costMean,
      costPerOutputMedianUsd: costMedian,
      reviewCycleHoursMean: cycleMean,
      reviewCycleHoursMedian: cycleMedian,
      failureRate,
    },
    thresholds: {
      accuracy: passMin(accuracy, THRESHOLDS.accuracy.min),
      costPerOutputUsd: passMax(costMean, THRESHOLDS.costPerOutputUsd.max),
      reviewCycleHours: passMax(cycleMedian, THRESHOLDS.reviewCycleHours.max),
      failureRate: passMax(failureRate, THRESHOLDS.failureRate.max),
    },
    golden: goldenSummary,
  };

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  printHuman(summary);
}

function normalizeText(s) {
  return String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Token-level Jaccard — 한국어/영어 혼합 title 의 부분 일치 매칭.
 * 공백 기준 split 후 set intersection / union. 둘 다 빈 set 이면 1.0.
 */
function tokenJaccard(a, b) {
  const splitTokens = (s) => normalizeText(s).split(' ').filter(Boolean);
  const A = new Set(splitTokens(a));
  const B = new Set(splitTokens(b));
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Greedy 1:1 fuzzy 매칭 — 두 list 사이에서 가장 유사한 pair 부터 차례로 잡는다.
 * 두 entry 의 type / kind 가 다르면 자동 mismatch (kind 보존을 우선).
 *
 * 입력 entry 는 임의 obj. simKey 가 비교 대상 (보통 title), strictKey 는
 * 다르면 무조건 mismatch (보통 kind 또는 type).
 *
 * 반환: { tpCount, fpCount, fnCount } — TP 는 매칭된 actual 수, FP 는 매칭
 * 안 된 actual, FN 는 매칭 안 된 expected.
 */
function greedyFuzzyMatch(actual, expected, threshold, strictKey, simKey) {
  const used = new Set();
  let tp = 0;
  for (const a of actual) {
    let bestIdx = -1;
    let bestScore = threshold;
    for (let i = 0; i < expected.length; i += 1) {
      if (used.has(i)) continue;
      const e = expected[i];
      if (a[strictKey] !== e[strictKey]) continue;
      const score = tokenJaccard(a[simKey], e[simKey]);
      if (score >= bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      used.add(bestIdx);
      tp += 1;
    }
  }
  return { tp, fp: actual.length - tp, fn: expected.length - used.size };
}

/**
 * Edge fuzzy 매칭 — type 정확 일치 + (fromTitle, toTitle) Jaccard 의 평균 ≥
 * threshold. 같은 패턴 (Greedy 1:1).
 */
function greedyFuzzyEdgeMatch(actual, expected, threshold) {
  const used = new Set();
  let tp = 0;
  for (const a of actual) {
    let bestIdx = -1;
    let bestScore = threshold;
    for (let i = 0; i < expected.length; i += 1) {
      if (used.has(i)) continue;
      const e = expected[i];
      if (a.type !== e.type) continue;
      const sim = (tokenJaccard(a.fromTitle, e.fromTitle) + tokenJaccard(a.toTitle, e.toTitle)) / 2;
      if (sim >= bestScore) {
        bestScore = sim;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      used.add(bestIdx);
      tp += 1;
    }
  }
  return { tp, fp: actual.length - tp, fn: expected.length - used.size };
}

/**
 * Golden fixture 디렉토리를 읽어 expected 와 actual_approved 를 비교 → per-doc
 * precision/recall/F1 + 전체 평균. fixture 파일이 0 개거나 매칭되는 output 이
 * 없으면 `{ status: 'no-data' }`. 매칭은 (kind, title) / (type, fromTitle,
 * toTitle) 정확 비교 (정규화: trim + lower + 공백 collapse).
 */
function scoreAgainstGolden(dir, outputsInRange, approveReviews, allOutputs, options = {}) {
  const mode = options.mode === 'fuzzy' ? 'fuzzy' : 'exact';
  const threshold = options.threshold ?? 0.7;
  const root = resolve(process.cwd(), dir);
  let files;
  try {
    files = readdirSync(root)
      .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
      .map((f) => resolve(root, f));
  } catch (err) {
    return { status: 'error', error: `cannot read golden dir: ${err.message}` };
  }
  if (files.length === 0) {
    return { status: 'no-data', message: `no golden fixtures in ${dir}` };
  }

  // approveReview 의 outputId → output (전체에서 lookup, range 와 무관) 매핑.
  const approvedOutputByDocId = new Map();
  for (const review of approveReviews) {
    if (!review.outputId) continue;
    const out = allOutputs.find((o) => o.id === review.outputId);
    if (!out) continue;
    if (!approvedOutputByDocId.has(out.documentId)) {
      approvedOutputByDocId.set(out.documentId, out);
    }
  }

  const perDoc = [];
  let sumTp = 0;
  let sumFp = 0;
  let sumFn = 0;

  for (const file of files) {
    let fixture;
    try {
      fixture = JSON.parse(readFileSync(file, 'utf-8'));
    } catch (err) {
      perDoc.push({
        file: file.split('/').pop(),
        status: 'parse-error',
        error: err.message,
      });
      continue;
    }
    const docId = fixture.documentId;
    const expectedNodes = (fixture.expected?.nodes ?? []).map((n) => ({
      kind: normalizeText(n.kind),
      title: normalizeText(n.title),
    }));
    const expectedEdges = (fixture.expected?.edges ?? []).map((e) => ({
      type: normalizeText(e.type),
      fromTitle: normalizeText(e.fromTitle),
      toTitle: normalizeText(e.toTitle),
    }));

    const out = approvedOutputByDocId.get(docId);
    if (!out) {
      perDoc.push({ documentId: docId, status: 'no-output' });
      continue;
    }

    const actualNodes = (Array.isArray(out.nodes) ? out.nodes : []).map((n) => ({
      kind: normalizeText(n.kind),
      title: normalizeText(n.title),
    }));
    // edges 의 from/to 는 tempId — title 매핑 필요.
    const titleByTempId = new Map();
    for (const n of out.nodes ?? []) {
      titleByTempId.set(n.tempId, normalizeText(n.title));
    }
    const actualEdges = (Array.isArray(out.edges) ? out.edges : []).map((e) => ({
      type: normalizeText(e.type),
      fromTitle: titleByTempId.get(e.fromTempId) ?? '',
      toTitle: titleByTempId.get(e.toTempId) ?? '',
    }));

    let tp = 0;
    let fp = 0;
    let fn = 0;

    if (mode === 'fuzzy') {
      const nodeMatch = greedyFuzzyMatch(actualNodes, expectedNodes, threshold, 'kind', 'title');
      const edgeMatch = greedyFuzzyEdgeMatch(actualEdges, expectedEdges, threshold);
      tp = nodeMatch.tp + edgeMatch.tp;
      fp = nodeMatch.fp + edgeMatch.fp;
      fn = nodeMatch.fn + edgeMatch.fn;
    } else {
      const nodeKey = (x) => `${x.kind}::${x.title}`;
      const edgeKey = (x) => `${x.type}::${x.fromTitle}::${x.toTitle}`;
      const expNodeSet = new Set(expectedNodes.map(nodeKey));
      const expEdgeSet = new Set(expectedEdges.map(edgeKey));
      const actNodeSet = new Set(actualNodes.map(nodeKey));
      const actEdgeSet = new Set(actualEdges.map(edgeKey));
      for (const k of actNodeSet) (expNodeSet.has(k) ? tp++ : fp++);
      for (const k of expNodeSet) if (!actNodeSet.has(k)) fn++;
      for (const k of actEdgeSet) (expEdgeSet.has(k) ? tp++ : fp++);
      for (const k of expEdgeSet) if (!actEdgeSet.has(k)) fn++;
    }

    const precision = tp + fp > 0 ? tp / (tp + fp) : null;
    const recall = tp + fn > 0 ? tp / (tp + fn) : null;
    const f1 =
      precision != null && recall != null && precision + recall > 0
        ? (2 * precision * recall) / (precision + recall)
        : null;

    perDoc.push({
      documentId: docId,
      status: 'ok',
      tp,
      fp,
      fn,
      precision,
      recall,
      f1,
    });
    sumTp += tp;
    sumFp += fp;
    sumFn += fn;
  }

  const overallPrecision = sumTp + sumFp > 0 ? sumTp / (sumTp + sumFp) : null;
  const overallRecall = sumTp + sumFn > 0 ? sumTp / (sumTp + sumFn) : null;
  const overallF1 =
    overallPrecision != null && overallRecall != null && overallPrecision + overallRecall > 0
      ? (2 * overallPrecision * overallRecall) / (overallPrecision + overallRecall)
      : null;

  return {
    status: 'ok',
    fixtureCount: files.length,
    mode,
    fuzzyThreshold: mode === 'fuzzy' ? threshold : undefined,
    perDoc,
    overall: {
      tp: sumTp,
      fp: sumFp,
      fn: sumFn,
      precision: overallPrecision,
      recall: overallRecall,
      f1: overallF1,
    },
    threshold: {
      f1: passMin(overallF1, THRESHOLDS.accuracy.min),
    },
  };
}

function passMin(value, min) {
  if (value === null) return 'no-data';
  return value >= min ? 'pass' : 'fail';
}
function passMax(value, max) {
  if (value === null) return 'no-data';
  return value <= max ? 'pass' : 'fail';
}

function fmt(value, digits = 3) {
  if (value === null || value === undefined) return '—';
  if (Number.isNaN(value)) return '—';
  return Number(value).toFixed(digits);
}

function printHuman(s) {
  console.log('');
  console.log(`# C-1 ontology 추출 측정 — ${s.range.since.slice(0, 10)} ~ ${s.range.until.slice(0, 10)}`);
  console.log(`account: ${s.accountId ?? '(all)'}`);
  console.log('');
  console.log(`outputs=${s.counts.outputs}  reviews=${s.counts.reviews} (approve=${s.counts.approveReviews}, reject=${s.counts.rejectReviews})  jobs=${s.counts.jobs} (failed=${s.counts.failedJobs})`);
  console.log('');
  const rows = [
    [
      THRESHOLDS.accuracy.label,
      `${fmt(s.metrics.accuracy)} (${s.metrics.approvedTotal}/${s.metrics.approvedTotal + s.metrics.rejectedTotal})`,
      `≥ ${THRESHOLDS.accuracy.min}`,
      s.thresholds.accuracy,
    ],
    [
      `${THRESHOLDS.costPerOutputUsd.label} (mean)`,
      `${THRESHOLDS.costPerOutputUsd.unit}${fmt(s.metrics.costPerOutputMeanUsd, 4)}`,
      `≤ $${THRESHOLDS.costPerOutputUsd.max}`,
      s.thresholds.costPerOutputUsd,
    ],
    [
      `${THRESHOLDS.reviewCycleHours.label}`,
      `${fmt(s.metrics.reviewCycleHoursMedian, 2)} ${THRESHOLDS.reviewCycleHours.unit}`,
      `≤ ${THRESHOLDS.reviewCycleHours.max}h`,
      s.thresholds.reviewCycleHours,
    ],
    [
      THRESHOLDS.failureRate.label,
      `${fmt(s.metrics.failureRate)}`,
      `< ${THRESHOLDS.failureRate.max}`,
      s.thresholds.failureRate,
    ],
  ];

  const labelWidth = Math.max(...rows.map((r) => r[0].length));
  const valueWidth = Math.max(...rows.map((r) => r[1].length));
  const thrWidth = Math.max(...rows.map((r) => r[2].length));

  for (const [label, value, thr, status] of rows) {
    const tag =
      status === 'pass' ? '✅ pass' : status === 'fail' ? '❌ fail' : '⏳ no-data';
    console.log(
      `${label.padEnd(labelWidth)}  ${value.padEnd(valueWidth)}  (${thr.padEnd(thrWidth)})  ${tag}`,
    );
  }
  console.log('');
  const allPass = rows.every((r) => r[3] === 'pass');
  const anyFail = rows.some((r) => r[3] === 'fail');
  console.log(
    allPass
      ? '판정: 4 임계값 통과 — C-2 진입 조건 충족.'
      : anyFail
        ? '판정: 1 개 이상 미통과. 미통과 항목 보강 필요 (prompt / frontmatter / 모델 / 추출 흐름).'
        : '판정: 데이터 부족. 추출/검수 사이클을 더 돌리고 재집계.',
  );

  if (s.golden) {
    console.log('');
    console.log('# Golden fixture 자동 채점');
    if (s.golden.status === 'no-data') {
      console.log(s.golden.message);
    } else if (s.golden.status === 'error') {
      console.log(`error: ${s.golden.error}`);
    } else {
      const o = s.golden.overall;
      const modeLabel =
        s.golden.mode === 'fuzzy'
          ? `fuzzy (token-Jaccard ≥ ${fmt(s.golden.fuzzyThreshold, 2)})`
          : 'exact';
      console.log(`mode=${modeLabel}  fixtures=${s.golden.fixtureCount}  TP=${o.tp} FP=${o.fp} FN=${o.fn}`);
      console.log(
        `precision=${fmt(o.precision)}  recall=${fmt(o.recall)}  F1=${fmt(o.f1)}  ` +
          `(F1 ${THRESHOLDS.accuracy.min} 기준 ${
            s.golden.threshold.f1 === 'pass' ? '✅ pass' : s.golden.threshold.f1 === 'fail' ? '❌ fail' : '⏳ no-data'
          })`,
      );
      const skipped = s.golden.perDoc.filter((p) => p.status !== 'ok');
      if (skipped.length > 0) {
        console.log(`(${skipped.length} 개 skip — no-output / parse-error)`);
      }
    }
  }
}

main().catch((err) => {
  console.error('[aggregate-extraction-metrics] failed:', err);
  process.exit(1);
});
