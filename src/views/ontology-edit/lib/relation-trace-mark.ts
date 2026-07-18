import type { VaultArrayKey } from "../ui/OntologyInspector";

/**
 * 인스펙터 관계 타입 피커의 trace-마크 문법 — 지도(Topology) 범례와 같은
 * 언어를 빌더에서도 반복한다: 실선 = 포함 계층, 파선 = 의존/느슨한 연관,
 * 점선 = 근거(문서가 다른 노드를 설명).
 *
 * `docs/prototypes/builder-final.html` 의 범례 문구 그대로:
 * "contains ─ · depends ╌ · evidence ┄".
 */
export type RelationTraceMarkStyle = "solid" | "dashed" | "dotted";

const TRACE_MARK_BY_KEY: Record<VaultArrayKey, RelationTraceMarkStyle> = {
  domains: "solid",
  capabilities: "solid",
  elements: "solid",
  contains: "solid",
  dependencies: "dashed",
  relates: "dashed",
  describes: "dotted",
};

export function resolveRelationTraceMark(
  key: VaultArrayKey,
): RelationTraceMarkStyle {
  return TRACE_MARK_BY_KEY[key] ?? "dashed";
}
