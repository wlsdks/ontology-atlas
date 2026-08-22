import { ONTOLOGY_STARTER_FILES } from './ontology-starter';

/**
 * **What the starter creates, counted by meaning.**
 *
 * The defect: the completion toast summed markdown and agent config files into one `created` and said
 * "8 starter documents", while the real ontology concept count was 5 and the settings panel displayed
 * "5 documents" — two screens giving different numbers for one vault (audit 2026-07-25).
 *
 * An agent config such as `.mcp.json` **is not a concept.** Summing the file counts makes a user read
 * it as "my ontology gained 8 concepts". The two numbers stay separate all the way through.
 */

/** How many ontology markdown files (i.e. nodes) the starter creates. */
export const STARTER_CONCEPT_COUNT = ONTOLOGY_STARTER_FILES.length;
