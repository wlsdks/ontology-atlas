/**
 * Deep-link builder for the topology surface. `?p=<slug>` is the query key
 * `useHomeRouteState` reads on HomePage.
 *
 * Note it targets `/topology/` explicitly. `/` renders the same HomePage, but this
 * helper keeps the explicit deep-link namespace: an earlier version returned `/?p=`
 * and the "view on the map" CTA fell through to the ontology view instead.
 */
export function getTopologyProjectHref(slug: string): string {
  return `/topology/?p=${encodeURIComponent(slug)}`;
}

/**
 * Deep-link to **the project's own node** on the map: the id a click on that node selects
 * (`project:<slug>`, the id `deriveOntologyFromVault` gives a project), so the map opens the
 * project inspector — the surface that carries the project's code evidence and the one
 * control that connects its code folder.
 *
 * Why it is not `getTopologyProjectHref` (2026-09-25 sweep): a bare slug resolves to the
 * project *record* and opens the project drawer, which has no code evidence at all. The
 * Projects list's and the project page's "View on map" sent that bare slug, so from the two
 * screens whose job is a project, connecting its code folder took a second press on a chip
 * in the drawer that nothing marked as the way there.
 */
export function getTopologyProjectNodeHref(slug: string): string {
  return `/topology/?p=${encodeURIComponent(`project:${slug}`)}`;
}

/**
 * Deep-link that opens a non-project ontology node (domain, capability, element) on
 * the topology in *focus* mode. `mode=focus` is read by HomePage's route-state hook,
 * which selects and zooms the node and opens the drawer. The topology renders the
 * whole ontology graph, so non-project nodes have 1:1 graph nodes too and
 * `?p=<nodeId>` is the vault slug. Same URL contract as the drawer's relation-row
 * navigation.
 */
export function getTopologyFocusHref(nodeId: string): string {
  return `/topology/?mode=focus&p=${encodeURIComponent(nodeId)}`;
}
