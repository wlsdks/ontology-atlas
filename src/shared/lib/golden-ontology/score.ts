import type {
  ActualOntology,
  GoldenOntologyEdge,
  GoldenOntologyExpected,
  GoldenOntologyNode,
  GoldenScoreResult,
  ScoreNumbers,
  ScoreSetDiff,
} from './types';

function normalizeTitle(t: string): string {
  return t.trim().toLowerCase();
}

function nodeKey(n: { title: string; kind: string }): string {
  return `${normalizeTitle(n.title)}::${n.kind}`;
}

function edgeKey(from: string, type: string, to: string): string {
  return `${normalizeTitle(from)}::${type}::${normalizeTitle(to)}`;
}

function computeNumbers(diff: ScoreSetDiff<unknown>): ScoreNumbers {
  const tp = diff.matched.length;
  const fp = diff.onlyInActual.length;
  const fn = diff.onlyInExpected.length;
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1 };
}

/**
 * 정답 ontology fixture 와 추출 결과를 비교해 set diff + precision / recall
 * / f1 를 계산.
 *
 * 비교 키:
 * - 노드: `(title 소문자, kind)` 의 페어. 같은 title + 같은 kind 면 매칭.
 *   같은 title 이라도 kind 다르면 별개 (extractor 가 잘못 분류한 경우 두
 *   diff 양쪽에 나타남).
 * - edge: `(from title 소문자, type, to title 소문자)` triple. type 도 문자
 *   비교 — 같은 의미 다른 표기 (e.g. depends_on vs uses) 는 별개.
 *
 * 추출의 edge 는 tempId 페어이므로 score 함수가 actual.nodes 의 tempId →
 * title 매핑을 만들어 정답 형식으로 정규화한 뒤 비교.
 *
 * tempId 가 노드 목록에 없는 edge (dangling) 는 onlyInActual 에 포함 —
 * extractor 가 잘못 만든 것이므로 false positive.
 */
export function scoreOntology(
  expected: GoldenOntologyExpected,
  actual: ActualOntology,
): GoldenScoreResult {
  // ---- 노드 set diff ----
  const expectedNodes = new Map<string, GoldenOntologyNode>();
  for (const n of expected.nodes) {
    expectedNodes.set(nodeKey(n), n);
  }
  const actualNodes = new Map<string, GoldenOntologyNode>();
  for (const n of actual.nodes) {
    actualNodes.set(nodeKey(n), {
      title: n.title,
      kind: n.kind as GoldenOntologyNode['kind'],
    });
  }

  const matchedNodes: GoldenOntologyNode[] = [];
  const onlyInActualNodes: GoldenOntologyNode[] = [];
  const onlyInExpectedNodes: GoldenOntologyNode[] = [];

  for (const [k, n] of expectedNodes) {
    if (actualNodes.has(k)) {
      matchedNodes.push(n);
    } else {
      onlyInExpectedNodes.push(n);
    }
  }
  for (const [k, n] of actualNodes) {
    if (!expectedNodes.has(k)) {
      onlyInActualNodes.push(n);
    }
  }

  const nodeDiff = {
    matched: matchedNodes,
    onlyInActual: onlyInActualNodes,
    onlyInExpected: onlyInExpectedNodes,
  };
  const nodeNumbers = computeNumbers(nodeDiff);

  // ---- edge set diff ----
  // tempId → title 매핑 (actual). 누락된 tempId 는 dangling edge 로 간주.
  const tempIdToTitle = new Map<string, string>();
  for (const n of actual.nodes) {
    tempIdToTitle.set(n.tempId, n.title);
  }

  const expectedEdges = new Map<string, GoldenOntologyEdge>();
  for (const e of expected.edges) {
    expectedEdges.set(edgeKey(e.from, e.type, e.to), e);
  }

  const actualEdges = new Map<string, GoldenOntologyEdge>();
  const danglingActualEdges: GoldenOntologyEdge[] = [];
  for (const e of actual.edges) {
    const fromTitle = tempIdToTitle.get(e.fromTempId);
    const toTitle = tempIdToTitle.get(e.toTempId);
    if (!fromTitle || !toTitle) {
      // dangling — 정답에 매칭 불가, 무조건 false positive
      danglingActualEdges.push({
        from: e.fromTempId,
        to: e.toTempId,
        type: e.type as GoldenOntologyEdge['type'],
      });
      continue;
    }
    actualEdges.set(edgeKey(fromTitle, e.type, toTitle), {
      from: fromTitle,
      to: toTitle,
      type: e.type as GoldenOntologyEdge['type'],
    });
  }

  const matchedEdges: GoldenOntologyEdge[] = [];
  const onlyInActualEdges: GoldenOntologyEdge[] = [...danglingActualEdges];
  const onlyInExpectedEdges: GoldenOntologyEdge[] = [];

  for (const [k, e] of expectedEdges) {
    if (actualEdges.has(k)) {
      matchedEdges.push(e);
    } else {
      onlyInExpectedEdges.push(e);
    }
  }
  for (const [k, e] of actualEdges) {
    if (!expectedEdges.has(k)) {
      onlyInActualEdges.push(e);
    }
  }

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
