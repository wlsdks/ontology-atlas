import type { NavRailContextHrefs } from "@/widgets/app-nav-rail";

/**
 * Carries the map selection over to the left rail. Following the rail's
 * documents entry with a node selected used to land on the default `/docs/`
 * screen, losing what the user was looking at across the surface change. This
 * reshapes the `documentHref` the datasheet already derived (a `?slug=` deep
 * link to the vault file — no new parameter or transform) into the rail's
 * `contextHrefs`.
 *
 * With no selection, or a selected node with no document deep link, it returns
 * null and the rail falls back to the plain `/docs/` href.
 */
export function buildNavRailContextHrefs(
  documentHref: string | null,
): NavRailContextHrefs | null {
  return documentHref ? { docs: documentHref } : null;
}
