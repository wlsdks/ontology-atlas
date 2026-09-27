/**
 * Full-detail agent handoff: one suggested MCP/CLI call chain, the same string the copy button
 * copies (`docs/prototypes/detail-a1-datasheet.html`).
 */
import type { FullDetailReachDepth } from "./full-detail-reach";

export function formatFullDetailHandoffChain(
  slug: string,
  maxDepth: FullDetailReachDepth,
  /**
   * `get_concept` fails for a concept with no document, so the chain creates the document first
   * under the raw reference name.
   */
  options: { documented?: boolean; kind?: string } = {},
): string {
  if (options.documented === false) {
    return `add_concept({slug:"${slug}", kind:"${options.kind ?? "element"}"}) → find_backlinks → reachability --max-depth ${maxDepth}`;
  }
  return `get_concept("${slug}") → find_backlinks → reachability --max-depth ${maxDepth}`;
}
