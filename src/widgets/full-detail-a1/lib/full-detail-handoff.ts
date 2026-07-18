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
): string {
  return `get_concept("${slug}") → find_backlinks → reachability --max-depth ${maxDepth}`;
}
