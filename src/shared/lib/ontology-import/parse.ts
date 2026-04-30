/**
 * Ontology import — JSON string → 검증된 payload.
 *
 * 호환 versions: 'ontology-export-v1' 만 (현재). 미래 v2 추가 시 분기.
 *
 * 순수 함수. IO 없음.
 */

import type { OntologyExportPayloadV1 } from '@/shared/lib/ontology-export';
import { ONTOLOGY_EXPORT_VERSION } from '@/shared/lib/ontology-export';

export type ParseResult =
  | { ok: true; payload: OntologyExportPayloadV1 }
  | { ok: false; error: string };

/**
 * JSON string 을 OntologyExportPayloadV1 로 검증·반환.
 *
 * 검증 단계:
 *   1. JSON.parse 실패 → invalid json
 *   2. version 미일치 → unsupported version
 *   3. 필수 필드 (accountId / nodes / edges) 누락 → schema error
 *
 * 더 강한 schema 검증 (Zod 등) 은 후속 phase. 현재는 핵심 필드만.
 */
export function parseOntologyImportV1(rawJson: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    return {
      ok: false,
      error: `JSON 파싱 실패: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'payload 가 객체가 아닙니다.' };
  }

  const obj = parsed as Record<string, unknown>;

  if (obj.version !== ONTOLOGY_EXPORT_VERSION) {
    return {
      ok: false,
      error: `지원하지 않는 version: ${String(obj.version)} (지원: ${ONTOLOGY_EXPORT_VERSION})`,
    };
  }

  if (typeof obj.accountId !== 'string' || obj.accountId.length === 0) {
    return { ok: false, error: 'accountId 가 누락됐어요.' };
  }

  if (!Array.isArray(obj.nodes)) {
    return { ok: false, error: 'nodes 가 배열이 아닙니다.' };
  }

  if (!Array.isArray(obj.edges)) {
    return { ok: false, error: 'edges 가 배열이 아닙니다.' };
  }

  if (
    !obj.tbox ||
    typeof obj.tbox !== 'object' ||
    !Array.isArray((obj.tbox as { classes?: unknown }).classes) ||
    !Array.isArray((obj.tbox as { relations?: unknown }).relations)
  ) {
    return { ok: false, error: 'tbox.classes / tbox.relations 형식이 맞지 않습니다.' };
  }

  // 형식 통과 — 호출자가 신뢰해 사용 가능. 더 깊은 per-item validation 은
  // 후속 phase 에서 (Zod 또는 수동 type guard).
  return { ok: true, payload: obj as unknown as OntologyExportPayloadV1 };
}
