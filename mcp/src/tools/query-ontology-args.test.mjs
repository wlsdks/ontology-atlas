import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateQueryOntologyArgs } from './query-ontology-args.mjs';

const accepts = (args) => assert.doesNotThrow(() => validateQueryOntologyArgs(args));
const rejects = (args, pattern) => assert.throws(() => validateQueryOntologyArgs(args), pattern);

test('a call needs an operation, and a plain overview is valid', () => {
  rejects({}, /operation must be a non-empty string/);
  accepts({ operation: 'overview', limit: 5 });
});

test('an unknown operation is refused', () => {
  rejects({ operation: 'drop_vault' }, /operation/);
});

test('a retired operation is refused with the call that answers the same question', () => {
  const cases = {
    all_paths: /path/,
    centrality: /match_nodes/,
    builder_context: /get_concepts/,
    match_edges: /neighbors/,
    domain_profile: /node_profile/,
    domain_matrix: /project_map/,
    topological_order: /cycles/,
    meaning_repair_review: /validate_vault/,
    analysis_history: /analysis_record/,
  };
  for (const [operation, replacement] of Object.entries(cases)) {
    assert.throws(
      () => validateQueryOntologyArgs({ operation }),
      (error) => error.errorCode === 'invalid_arguments'
        && error.message.includes(`"${operation}" is retired`)
        && replacement.test(error.message),
    );
  }
});

test('recordId belongs to analysis_record alone, and analysis_record needs it', () => {
  accepts({ operation: 'analysis_record', recordId: 'r1' });
  rejects({ operation: 'analysis_record' }, /recordId/);
  rejects({ operation: 'overview', recordId: 'r1' }, /recordId is only valid for analysis_record/);
});

test('counts must be positive integers within their cap, depths non-negative', () => {
  accepts({ operation: 'overview', limit: 500, maxHops: 0, depth: 20, searchBudget: 50_000 });
  rejects({ operation: 'overview', limit: 501 }, /limit/);
  rejects({ operation: 'overview', limit: 0 }, /limit/);
  rejects({ operation: 'overview', maxHops: 21 }, /maxHops/);
  rejects({ operation: 'cycles', searchBudget: 0 }, /searchBudget/);
});

test('flags must be booleans and string lists must be arrays of strings', () => {
  accepts({ operation: 'overview', includeExternal: true, types: ['depends_on'] });
  rejects({ operation: 'overview', includeExternal: 'yes' }, /includeExternal/);
  rejects({ operation: 'overview', types: 'depends_on' }, /types/);
});

test('the kind filter follows the operation that reads it', () => {
  accepts({ operation: 'match_nodes', kind: 'capability' });
  accepts({ operation: 'recommend_relations', kind: 'element' });
  rejects({ operation: 'recommend_relations', kind: 'domain' }, /kind/);
  rejects({ operation: 'match_nodes', kind: 'not_a_kind' }, /kind/);
});
