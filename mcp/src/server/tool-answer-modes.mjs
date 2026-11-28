/**
 * Tools that give two kinds of answer by one argument, each kind under its own
 * schema. `tools/list` carries the union of the two, so a tool's advertised
 * schema cannot say which fields belong to which answer; a test holds each
 * answer to the schema of its own mode.
 */

import { GET_CONSTELLATION_ANSWER_MODES } from './tool-definitions/constellations.mjs';
import { RENAME_CONCEPT_ANSWER_MODES } from './tool-definitions/lifecycle.mjs';
import { REMOVE_RELATION_ANSWER_MODES } from './tool-definitions/write-relations.mjs';

const TOOL_ANSWER_MODES = new Map([
  ['remove_relation', { schemas: REMOVE_RELATION_ANSWER_MODES, modeOf: (args) => (args.replaceWith ? 'replace' : 'remove') }],
  ['rename_concept', { schemas: RENAME_CONCEPT_ANSWER_MODES, modeOf: (args) => (args.newKind === undefined ? 'rename' : 'reclassify') }],
  ['get_constellation', { schemas: GET_CONSTELLATION_ANSWER_MODES, modeOf: (args) => (args.id === undefined ? 'list' : 'context') }],
]);

/** The mode a call asks for and the schema its answer must meet, or null for a tool with one kind of answer. */
export function answerModeOf(name, args) {
  const entry = TOOL_ANSWER_MODES.get(name);
  if (!entry) return null;
  const mode = entry.modeOf(args);
  return { mode, schema: entry.schemas[mode] };
}
