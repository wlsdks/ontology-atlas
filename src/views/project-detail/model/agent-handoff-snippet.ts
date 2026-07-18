/**
 * "에이전트 핸드오프" 레일 카드의 복사 payload — 이 프로젝트를 처음 보는
 * AI agent 가 mcp/README.md 의 진짜 도구 이름(get_concept, query_ontology)
 * 으로 바로 붙일 수 있는 3-스텝 프롬프트. slug 만 이 프로젝트로 바꿔 끼운
 * 템플릿이라 fabrication 이 아니라 실제 MCP 계약 그대로.
 */
export function buildAgentHandoffSnippet(projectSlug: string): string {
  return [
    `get_concept("${projectSlug}")`,
    `→ query_ontology({operation:"project_map", project:"${projectSlug}"})`,
    `→ containment_tree`,
  ].join("\n");
}
