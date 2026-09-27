import { DEFAULT_ONTOLOGY_CLASSES } from './defaults';

/** Kind id → label from `DEFAULT_ONTOLOGY_CLASSES`; unlisted kinds return the raw id. */
export function getOntologyKindLabel(kind: string): string {
  const found = DEFAULT_ONTOLOGY_CLASSES.find((c) => c.id === kind);
  return found?.name ?? kind;
}
