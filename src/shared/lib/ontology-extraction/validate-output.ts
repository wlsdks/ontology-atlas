/**
 * LLM extraction output validator.
 *
 * 입력: 임의의 unknown (LLM JSON parse 결과)
 * 출력: { ok, value?, errors[] }
 *
 * 정책:
 * - 알 수 없는 필드는 무시 (forward-compat).
 * - 필수 필드 누락 / enum 위반 / confidence 범위 위반은 errors.
 * - 부분 실패 — node 1 개가 잘못돼도 다른 노드는 살림. 단, edge 의 from/to
 *   가 살아남은 노드를 참조하지 않으면 그 edge 는 invalid 로 처리.
 *
 * `clampConfidence` 와 달리 여기서는 **검증** — 잘못된 confidence (음수 / 1
 * 초과 / NaN / 비숫자) 면 0 으로 떨어뜨리지 않고 error 로 보고. mapper read
 * path 에서는 fail-safe (clamp), 워커 출력 경로에서는 strict (validate).
 */

// 7-edge enum 은 entities/knowledge-graph 의 KNOWLEDGE_EDGE_TYPES 와
// 동일해야 한다. shared/lib 은 entities 에 값 의존을 못 하므로 의식적 mirror.
// 값이 바뀔 일이 거의 없는 상수 (TBox 시드와 묶임).
const ONTOLOGY_EDGE_TYPES = [
  'contains',
  'belongs_to',
  'depends_on',
  'implements',
  'uses',
  'describes',
  'related_to',
] as const;

import {
  type ExtractedEdge,
  type ExtractedNode,
  type ExtractionEvidenceRef,
  type ExtractionOutput,
  type ValidationFailure,
  type ValidationResult,
} from './types';

const KIND_VALUES = ['project', 'domain', 'capability', 'element', 'document'] as const;
const ELEMENT_TYPE_VALUES = [
  'service',
  'api',
  'agent',
  'workflow',
  'schema',
  'data-store',
  'ui',
  'prompt',
  'integration',
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function validateConfidence(
  value: unknown,
  path: string,
  errors: ValidationFailure[],
): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.push({ path, message: `confidence 가 유효 숫자 아님 (got ${typeof value})` });
    return null;
  }
  if (value < 0 || value > 1) {
    errors.push({ path, message: `confidence 가 [0, 1] 범위를 벗어남 (got ${value})` });
    return null;
  }
  return value;
}

function validateEvidence(
  value: unknown,
  path: string,
  errors: ValidationFailure[],
): ExtractionEvidenceRef[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    errors.push({ path, message: 'evidence 가 배열이 아님' });
    return undefined;
  }
  const out: ExtractionEvidenceRef[] = [];
  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    if (!isPlainObject(item)) {
      errors.push({ path: `${path}[${i}]`, message: 'evidence item 이 객체가 아님' });
      continue;
    }
    if (typeof item.excerpt !== 'string' || item.excerpt.length === 0) {
      errors.push({ path: `${path}[${i}].excerpt`, message: 'excerpt 누락 / 빈 문자열' });
      continue;
    }
    if (item.excerpt.length > 240) {
      errors.push({ path: `${path}[${i}].excerpt`, message: 'excerpt 가 240자 초과' });
      continue;
    }
    const ref: ExtractionEvidenceRef = { excerpt: item.excerpt };
    if (typeof item.chunkRef === 'string') ref.chunkRef = item.chunkRef;
    if (typeof item.charStart === 'number' && Number.isFinite(item.charStart)) {
      ref.charStart = item.charStart;
    }
    if (typeof item.charEnd === 'number' && Number.isFinite(item.charEnd)) {
      ref.charEnd = item.charEnd;
    }
    out.push(ref);
  }
  return out;
}

function validateNode(
  raw: unknown,
  index: number,
  errors: ValidationFailure[],
): ExtractedNode | null {
  if (!isPlainObject(raw)) {
    errors.push({ path: `nodes[${index}]`, message: '객체 아님' });
    return null;
  }
  if (typeof raw.tempId !== 'string' || !raw.tempId) {
    errors.push({ path: `nodes[${index}].tempId`, message: 'tempId 누락' });
    return null;
  }
  if (typeof raw.title !== 'string' || !raw.title) {
    errors.push({ path: `nodes[${index}].title`, message: 'title 누락' });
    return null;
  }
  if (typeof raw.kind !== 'string' || !(KIND_VALUES as readonly string[]).includes(raw.kind)) {
    errors.push({
      path: `nodes[${index}].kind`,
      message: `kind 가 합법 enum 아님 (got "${String(raw.kind)}")`,
    });
    return null;
  }
  if (!isStringArray(raw.projectIds)) {
    errors.push({ path: `nodes[${index}].projectIds`, message: 'projectIds 가 string[] 아님' });
    return null;
  }
  const summary = typeof raw.summary === 'string' ? raw.summary : '';
  const confidence = validateConfidence(
    raw.confidence,
    `nodes[${index}].confidence`,
    errors,
  );
  if (confidence === null) return null;
  const node: ExtractedNode = {
    tempId: raw.tempId,
    title: raw.title,
    kind: raw.kind as ExtractedNode['kind'],
    projectIds: raw.projectIds,
    summary,
    confidence,
  };
  if (isStringArray(raw.warnings)) node.warnings = raw.warnings;
  if (
    typeof raw.elementType === 'string' &&
    (ELEMENT_TYPE_VALUES as readonly string[]).includes(raw.elementType)
  ) {
    node.elementType = raw.elementType;
  } else if (raw.elementType !== undefined) {
    errors.push({
      path: `nodes[${index}].elementType`,
      message: `elementType 이 9 종 enum 아님 (got "${String(raw.elementType)}")`,
    });
  }
  const evidence = validateEvidence(raw.evidence, `nodes[${index}].evidence`, errors);
  if (evidence) node.evidence = evidence;
  return node;
}

function validateEdge(
  raw: unknown,
  index: number,
  validTempIds: Set<string>,
  errors: ValidationFailure[],
): ExtractedEdge | null {
  if (!isPlainObject(raw)) {
    errors.push({ path: `edges[${index}]`, message: '객체 아님' });
    return null;
  }
  if (typeof raw.tempId !== 'string' || !raw.tempId) {
    errors.push({ path: `edges[${index}].tempId`, message: 'tempId 누락' });
    return null;
  }
  if (typeof raw.fromTempId !== 'string' || !raw.fromTempId) {
    errors.push({ path: `edges[${index}].fromTempId`, message: 'fromTempId 누락' });
    return null;
  }
  if (typeof raw.toTempId !== 'string' || !raw.toTempId) {
    errors.push({ path: `edges[${index}].toTempId`, message: 'toTempId 누락' });
    return null;
  }
  if (raw.fromTempId === raw.toTempId) {
    errors.push({ path: `edges[${index}]`, message: 'self-loop 금지 (from == to)' });
    return null;
  }
  if (
    typeof raw.type !== 'string' ||
    !(ONTOLOGY_EDGE_TYPES as readonly string[]).includes(raw.type)
  ) {
    errors.push({
      path: `edges[${index}].type`,
      message: `type 이 7 종 enum 아님 (got "${String(raw.type)}")`,
    });
    return null;
  }
  if (!validTempIds.has(raw.fromTempId)) {
    errors.push({
      path: `edges[${index}].fromTempId`,
      message: `존재하지 않는 노드 참조 ("${raw.fromTempId}")`,
    });
    return null;
  }
  if (!validTempIds.has(raw.toTempId)) {
    errors.push({
      path: `edges[${index}].toTempId`,
      message: `존재하지 않는 노드 참조 ("${raw.toTempId}")`,
    });
    return null;
  }
  const confidence = validateConfidence(
    raw.confidence,
    `edges[${index}].confidence`,
    errors,
  );
  if (confidence === null) return null;
  const edge: ExtractedEdge = {
    tempId: raw.tempId,
    fromTempId: raw.fromTempId,
    toTempId: raw.toTempId,
    type: raw.type as ExtractedEdge['type'],
    confidence,
  };
  if (typeof raw.label === 'string') edge.label = raw.label;
  if (isStringArray(raw.warnings)) edge.warnings = raw.warnings;
  const evidence = validateEvidence(raw.evidence, `edges[${index}].evidence`, errors);
  if (evidence) edge.evidence = evidence;
  return edge;
}

export function validateExtractionOutput(raw: unknown): ValidationResult {
  const errors: ValidationFailure[] = [];

  if (!isPlainObject(raw)) {
    return {
      ok: false,
      errors: [{ path: '', message: 'output 이 객체가 아님' }],
    };
  }

  const summary = typeof raw.summary === 'string' ? raw.summary : '';
  if (typeof raw.summary !== 'string') {
    errors.push({ path: 'summary', message: 'summary 가 string 아님 (빈 값으로 대체)' });
  }

  const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  if (!Array.isArray(raw.nodes)) {
    errors.push({ path: 'nodes', message: 'nodes 가 배열이 아님' });
  }
  const nodes: ExtractedNode[] = [];
  const seenNodeIds = new Set<string>();
  for (let i = 0; i < rawNodes.length; i++) {
    const n = validateNode(rawNodes[i], i, errors);
    if (!n) continue;
    if (seenNodeIds.has(n.tempId)) {
      errors.push({
        path: `nodes[${i}].tempId`,
        message: `tempId 중복 ("${n.tempId}")`,
      });
      continue;
    }
    seenNodeIds.add(n.tempId);
    nodes.push(n);
  }

  const rawEdges = Array.isArray(raw.edges) ? raw.edges : [];
  if (!Array.isArray(raw.edges)) {
    errors.push({ path: 'edges', message: 'edges 가 배열이 아님' });
  }
  const validNodeIds = new Set(nodes.map((n) => n.tempId));
  const edges: ExtractedEdge[] = [];
  const seenEdgeIds = new Set<string>();
  for (let i = 0; i < rawEdges.length; i++) {
    const e = validateEdge(rawEdges[i], i, validNodeIds, errors);
    if (!e) continue;
    if (seenEdgeIds.has(e.tempId)) {
      errors.push({
        path: `edges[${i}].tempId`,
        message: `edge tempId 중복 ("${e.tempId}")`,
      });
      continue;
    }
    seenEdgeIds.add(e.tempId);
    edges.push(e);
  }

  const warnings = isStringArray(raw.warnings) ? raw.warnings : [];
  if (raw.warnings !== undefined && !isStringArray(raw.warnings)) {
    errors.push({ path: 'warnings', message: 'warnings 가 string[] 아님' });
  }

  // 부분 검증 정책 — 일부 노드/엣지가 invalid 여도 ok=true 로 살아남은 결과
  // 반환. 단 errors 가 비어있지 않으면 운영자에게 surface.
  const value: ExtractionOutput = { summary, nodes, edges, warnings };
  return { ok: true, value, errors };
}
