import type { NavRailContextHrefs } from "@/widgets/app-nav-rail";

/**
 * Carries the map selection to the rail's documents entry by reusing the
 * datasheet's `documentHref` deep link.
 * Returns null without a selection or a document link, so the rail falls back to `/docs/`.
 */
export function buildNavRailContextHrefs(
  documentHref: string | null,
): NavRailContextHrefs | null {
  return documentHref ? { docs: documentHref } : null;
}
