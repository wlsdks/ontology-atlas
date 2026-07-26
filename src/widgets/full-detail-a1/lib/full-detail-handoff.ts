/**
 * Full-detail A1 agent-handoff row — a single suggested MCP/CLI call chain,
 * not the old drawer's rich "collaborator brief" (vocabulary review, quality
 * gates, lens chips …). `docs/prototypes/detail-a1-datasheet.html`'s handoff
 * row shows exactly this chain; the copy button copies the same string.
 */
import type { FullDetailReachDepth } from "./full-detail-reach";

export function formatFullDetailHandoffChain(
  slug: string,
  maxDepth: FullDetailReachDepth,
  /**
   * 문서가 없는 개념(다른 문서의 관계 키에서 이름만 불린 파생 노드)에는
   * `get_concept` 이 성립하지 않는다 — 붙여넣는 즉시 "없음" 이 돌아온다.
   * 그럴 때는 볼트가 아는 유일한 이름(참조 원문)으로 문서를 먼저 만든다.
   */
  options: { documented?: boolean; kind?: string } = {},
): string {
  if (options.documented === false) {
    return `add_concept({slug:"${slug}", kind:"${options.kind ?? "element"}"}) → find_backlinks → reachability --max-depth ${maxDepth}`;
  }
  return `get_concept("${slug}") → find_backlinks → reachability --max-depth ${maxDepth}`;
}
