import { DEFAULT_ONTOLOGY_CLASSES } from './defaults';

/**
 * ontology kind id → display label.
 *
 * The `name` field of `DEFAULT_ONTOLOGY_CLASSES` is the source of truth. A kind not in
 * the seed (added dynamically at runtime) returns the raw kind string, avoiding a dead label.
 *
 * Single entry point so UI surfaces (tree chips, node detail panel, search results)
 * do not each define their own labels.
 */
export function getOntologyKindLabel(kind: string): string {
  const found = DEFAULT_ONTOLOGY_CLASSES.find((c) => c.id === kind);
  return found?.name ?? kind;
}
