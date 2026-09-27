import { ONTOLOGY_STARTER_FILES } from '@/entities/vault-session';

/**
 * Starter output counted by meaning: agent config such as `.mcp.json` is not a concept, so the
 * concept and config counts stay separate, or two screens report different numbers for one vault.
 */

/** Ontology markdown files, i.e. nodes. */
export const STARTER_CONCEPT_COUNT = ONTOLOGY_STARTER_FILES.length;
