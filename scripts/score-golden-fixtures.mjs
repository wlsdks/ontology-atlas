#!/usr/bin/env node
/**
 * Golden ontology fixture 채점 + 무결성 검증 스크립트 (A3-5).
 *
 * 두 모드:
 *
 * 1. **self-sanity (기본)** — `tests/fixtures/golden-ontology/*.expected.
 *    json` 모두 발견해 자기자신을 actual 로 채점. 모든 fixture 가
 *    overallF1 = 1.0 이어야 통과 (fixture 가 dangling edge / kind 오타
 *    등으로 깨지면 발견).
 *
 * 2. **--from <path>** — 운영 추출 결과 JSON 디렉토리 받아 같은 id 의
 *    fixture 와 채점. 진안의 T-11 측정 사이클 자동 보고 용. 파일명
 *    규칙: `<fixture-id>.actual.json` (같은 ActualOntology 형식).
 *
 * 통과 기준:
 *   - --threshold (default 1.0) 보다 overallF1 작으면 exit 1
 *   - fixture 무결성 (kind enum / edge type enum / dangling 0) 검증
 *
 * 사용:
 *   node scripts/score-golden-fixtures.mjs                  # self-sanity
 *   node scripts/score-golden-fixtures.mjs --threshold 0.8  # 관용도
 *   node scripts/score-golden-fixtures.mjs --from out/extracted/
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const FIXTURES_DIR = path.join(ROOT, "tests/fixtures/golden-ontology");

const KIND_ENUM = ["project", "domain", "capability", "element", "document"];
const TYPE_ENUM = [
  "contains",
  "belongs_to",
  "depends_on",
  "implements",
  "uses",
  "describes",
  "related_to",
];

function parseArgs(argv) {
  const args = { threshold: 1.0, from: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--threshold") {
      args.threshold = Number(argv[++i]);
    } else if (a === "--from") {
      args.from = argv[++i];
    }
  }
  return args;
}

function discoverFixtures() {
  const entries = fs
    .readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith(".expected.json"))
    .sort();
  return entries.map((f) => path.join(FIXTURES_DIR, f));
}

function loadFixture(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function validateFixture(fixture) {
  const errors = [];
  const titles = new Set(
    fixture.nodes.map((n) => n.title.toLowerCase().trim()),
  );
  for (const n of fixture.nodes) {
    if (!KIND_ENUM.includes(n.kind))
      errors.push(`bad kind '${n.kind}' on node '${n.title}'`);
  }
  for (const e of fixture.edges) {
    if (!TYPE_ENUM.includes(e.type))
      errors.push(`bad edge type '${e.type}' (${e.from} → ${e.to})`);
    if (!titles.has(e.from.toLowerCase().trim()))
      errors.push(`dangling edge from '${e.from}'`);
    if (!titles.has(e.to.toLowerCase().trim()))
      errors.push(`dangling edge to '${e.to}'`);
  }
  return errors;
}

// expected fixture 를 actual 로 직변환 — self-sanity 모드.
function fixtureToSelfActual(fixture) {
  const tempIds = new Map();
  const nodes = fixture.nodes.map((n, i) => {
    const tempId = `n${i}`;
    tempIds.set(n.title.toLowerCase().trim(), tempId);
    return { tempId, title: n.title, kind: n.kind };
  });
  const edges = fixture.edges.map((e) => ({
    fromTempId: tempIds.get(e.from.toLowerCase().trim()) ?? "ghost",
    toTempId: tempIds.get(e.to.toLowerCase().trim()) ?? "ghost",
    type: e.type,
  }));
  return { nodes, edges };
}

function loadActualFromDir(dir, fixtureId) {
  const candidate = path.join(dir, `${fixtureId}.actual.json`);
  if (!fs.existsSync(candidate)) return null;
  return JSON.parse(fs.readFileSync(candidate, "utf8"));
}

// scoreOntology 의 .ts 모듈을 직접 import 못하니 (스크립트는 순수 mjs)
// 채점 로직을 인라인 (src/shared/lib/golden-ontology/score.ts 와 동일).
function normalizeTitle(t) {
  return t.trim().toLowerCase();
}
function nodeKey(n) {
  return `${normalizeTitle(n.title)}::${n.kind}`;
}
function edgeKey(from, type, to) {
  return `${normalizeTitle(from)}::${type}::${normalizeTitle(to)}`;
}
function computeNumbers(diff) {
  const tp = diff.matched.length;
  const fp = diff.onlyInActual.length;
  const fn = diff.onlyInExpected.length;
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const f1 =
    precision + recall === 0
      ? 0
      : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1 };
}

function scoreOntology(expected, actual) {
  const expectedNodes = new Map();
  for (const n of expected.nodes) expectedNodes.set(nodeKey(n), n);
  const actualNodes = new Map();
  for (const n of actual.nodes)
    actualNodes.set(nodeKey({ title: n.title, kind: n.kind }), {
      title: n.title,
      kind: n.kind,
    });

  const matchedNodes = [];
  const onlyInActualNodes = [];
  const onlyInExpectedNodes = [];
  for (const [k, n] of expectedNodes)
    actualNodes.has(k) ? matchedNodes.push(n) : onlyInExpectedNodes.push(n);
  for (const [k, n] of actualNodes)
    if (!expectedNodes.has(k)) onlyInActualNodes.push(n);

  const nodeDiff = {
    matched: matchedNodes,
    onlyInActual: onlyInActualNodes,
    onlyInExpected: onlyInExpectedNodes,
  };
  const nodeNumbers = computeNumbers(nodeDiff);

  const tempIdToTitle = new Map();
  for (const n of actual.nodes) tempIdToTitle.set(n.tempId, n.title);

  const expectedEdges = new Map();
  for (const e of expected.edges)
    expectedEdges.set(edgeKey(e.from, e.type, e.to), e);
  const actualEdges = new Map();
  const dangling = [];
  for (const e of actual.edges) {
    const fromTitle = tempIdToTitle.get(e.fromTempId);
    const toTitle = tempIdToTitle.get(e.toTempId);
    if (!fromTitle || !toTitle) {
      dangling.push({ from: e.fromTempId, to: e.toTempId, type: e.type });
      continue;
    }
    actualEdges.set(edgeKey(fromTitle, e.type, toTitle), {
      from: fromTitle,
      to: toTitle,
      type: e.type,
    });
  }

  const matchedEdges = [];
  const onlyInActualEdges = [...dangling];
  const onlyInExpectedEdges = [];
  for (const [k, e] of expectedEdges)
    actualEdges.has(k) ? matchedEdges.push(e) : onlyInExpectedEdges.push(e);
  for (const [k, e] of actualEdges)
    if (!expectedEdges.has(k)) onlyInActualEdges.push(e);

  const edgeDiff = {
    matched: matchedEdges,
    onlyInActual: onlyInActualEdges,
    onlyInExpected: onlyInExpectedEdges,
  };
  const edgeNumbers = computeNumbers(edgeDiff);
  const overallF1 = (nodeNumbers.f1 + edgeNumbers.f1) / 2;

  return {
    fixtureId: expected.id,
    nodes: { ...nodeDiff, ...nodeNumbers },
    edges: { ...edgeDiff, ...edgeNumbers },
    overallF1,
  };
}

function pad(s, n) {
  return s.padEnd(n);
}
function padRight(s, n) {
  return String(s).padStart(n);
}

const args = parseArgs(process.argv.slice(2));
const fixtures = discoverFixtures();

console.log(
  `[score-golden] ${fixtures.length} fixture${fixtures.length > 1 ? "s" : ""} found, threshold=${args.threshold}, mode=${args.from ? "from-dir" : "self-sanity"}`,
);
console.log("");

let totalErrors = 0;
let totalBelowThreshold = 0;
let f1Sum = 0;

console.log(
  "  " + pad("fixture", 24) + pad("nodes", 8) + pad("edges", 8) + "F1     status",
);
console.log("  " + "-".repeat(60));

for (const filePath of fixtures) {
  const fixture = loadFixture(filePath);
  const errors = validateFixture(fixture);
  if (errors.length > 0) {
    totalErrors += errors.length;
    console.log(
      `  ${pad(fixture.id, 24)}${"".padEnd(8)}${"".padEnd(8)}—      ❌ INVALID`,
    );
    for (const e of errors) console.log(`      · ${e}`);
    continue;
  }

  let actual;
  if (args.from) {
    actual = loadActualFromDir(args.from, fixture.id);
    if (!actual) {
      console.log(
        `  ${pad(fixture.id, 24)}${"".padEnd(8)}${"".padEnd(8)}—      ⚠️  no actual file`,
      );
      continue;
    }
  } else {
    actual = fixtureToSelfActual(fixture);
  }

  const result = scoreOntology(fixture, actual);
  f1Sum += result.overallF1;
  const ok = result.overallF1 >= args.threshold;
  if (!ok) totalBelowThreshold += 1;
  console.log(
    `  ${pad(fixture.id, 24)}${padRight(fixture.nodes.length, 6)}  ${padRight(fixture.edges.length, 6)}  ${result.overallF1.toFixed(3)}  ${ok ? "✅" : "❌ < threshold"}`,
  );
}

console.log("");
console.log(
  `[score-golden] avg F1 = ${(f1Sum / fixtures.length).toFixed(3)} | invalid: ${totalErrors} | below threshold: ${totalBelowThreshold}`,
);

if (totalErrors > 0 || totalBelowThreshold > 0) {
  console.error(`[score-golden] FAIL`);
  process.exit(1);
}
console.log(`[score-golden] OK`);
