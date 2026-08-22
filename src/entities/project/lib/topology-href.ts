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
