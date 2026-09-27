/** `/topology/?p=<slug>`; explicit `/topology/` so the link never lands on the ontology view. */
export function getTopologyProjectHref(slug: string): string {
  return `/topology/?p=${encodeURIComponent(slug)}`;
}

/** Links to the project's own node (`project:<slug>`), which opens the inspector with code evidence. */
export function getTopologyProjectNodeHref(slug: string): string {
  return `/topology/?p=${encodeURIComponent(`project:${slug}`)}`;
}

/** Focus-mode link for a non-project node; `?p=` is the vault slug. */
export function getTopologyFocusHref(nodeId: string): string {
  return `/topology/?mode=focus&p=${encodeURIComponent(nodeId)}`;
}
