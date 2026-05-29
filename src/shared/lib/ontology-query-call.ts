/**
 * MCP `query_ontology(...)` 호출 문자열 포맷 — payload 를 JSON 직렬화해 agent 가
 * 그대로 복사·실행할 수 있는 호출 표현으로 만든다.
 *
 * 토폴로지 path/analysis, 인사이트 쿼리팩, 빌더 관계 핸드오프 등 여러 surface 가
 * 동일한 표현을 노출해야 해서 단일 source 로 통일 (이전엔 6 개 파일에 동일
 * 1-줄 함수가 중복돼 있었다 — codegraph 로 발견).
 */
export function formatQueryOntologyCall(payload: Record<string, unknown>): string {
  return `query_ontology(${JSON.stringify(payload)})`;
}
