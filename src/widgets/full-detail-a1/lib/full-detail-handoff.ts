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
   * `get_concept` does not hold for a concept with no document (a derived node named
   * only in another document's relation key) — pasted, it returns "not found"
   * immediately. In that case the document is created first, under the only name the
   * vault knows (the raw reference text).
   */
  options: { documented?: boolean; kind?: string } = {},
): string {
  if (options.documented === false) {
    return `add_concept({slug:"${slug}", kind:"${options.kind ?? "element"}"}) → find_backlinks → reachability --max-depth ${maxDepth}`;
  }
  return `get_concept("${slug}") → find_backlinks → reachability --max-depth ${maxDepth}`;
}
