import assert from 'node:assert/strict';
import test from 'node:test';

import { retiredArgumentError, withoutNoOpRetiredArguments } from './retired-arguments.mjs';

/** Each cut argument and the current argument its refusal must name. */
const REPLACEMENTS = [
  ['iterations', 'sort:"degree"'],
  ['nodeLimit', 'limit'],
  ['componentLimit', 'limit'],
  ['cycleLimit', 'limit'],
  ['recommendationLimit', 'limit'],
  ['orderLimit', 'limit'],
  ['minDegree', 'sort:"degree"'],
  ['maxDegree', 'sort:"degree"'],
  ['minInDegree', 'sort:"degree"'],
  ['minOutDegree', 'sort:"degree"'],
  ['slugContains', 'list_concepts({mentions})'],
  ['relation', 'type'],
  ['seed', 'slug'],
  ['dependencyTypes', 'types'],
  ['componentTypes', 'types'],
];

test('every retired query_ontology argument is refused as invalid_arguments and names its replacement', () => {
  for (const [name, replacement] of REPLACEMENTS) {
    const error = retiredArgumentError('query_ontology', { operation: 'health', [name]: 3 });
    assert.equal(error?.errorCode, 'invalid_arguments', name);
    assert.ok(error.message.includes(replacement), `${name} -> ${error.message}`);
  }
});

test('a null retired argument counts as absent and detail "full" means nothing, but a value is refused', () => {
  const sent = { operation: 'match_nodes', minDegree: null, detail: 'full', limit: 5 };
  const cleaned = withoutNoOpRetiredArguments('query_ontology', sent);
  assert.deepEqual(cleaned, { operation: 'match_nodes', limit: 5 });
  assert.equal(retiredArgumentError('query_ontology', cleaned), null);
  assert.ok(retiredArgumentError('query_ontology', { operation: 'agent_brief', detail: 'compact' }));
  assert.equal(withoutNoOpRetiredArguments('list_concepts', { limit: null }).limit, null, 'only retired names are cleaned');
});
