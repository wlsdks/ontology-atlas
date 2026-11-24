/**
 * Full-detail agent handoff: one suggested MCP/CLI call chain, the same string the copy button
 * copies.
 */
import type { FullDetailReachDepth } from "./full-detail-reach";

export function formatFullDetailHandoffChain(
  slug: string,
  maxDepth: FullDetailReachDepth,
  /**
   * `get_concepts` finds no row for a concept with no document, so the chain creates the document first
   * under the raw reference name.
   */
  options: { documented?: boolean; kind?: string } = {},
): string {
  if (options.documented === false) {
    return `add_concepts({concepts:[{slug:"${slug}", kind:"${options.kind ?? "element"}"}]}) → find_backlinks → reachability --max-depth ${maxDepth}`;
  }
  return `get_concepts({slugs:["${slug}"]}) → find_backlinks → reachability --max-depth ${maxDepth}`;
}
