import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_BRIEF_TASK_MAX_CHARS } from '../agent-brief/agent-brief-compact.mjs';
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

test('recordId belongs to analysis_record alone, and analysis_record needs it', () => {
  accepts({ operation: 'analysis_record', recordId: 'r1' });
  rejects({ operation: 'analysis_record' }, /recordId/);
  rejects({ operation: 'overview', recordId: 'r1' }, /recordId is only valid for analysis_record/);
});

test('analysis history filters and the scanned-file limit are bounded', () => {
  accepts({ operation: 'analysis_history', analysisMode: 'meaning', limit: 100 });
  rejects({ operation: 'overview', analysisMode: 'meaning' }, /require analysis_history/);
  rejects({ operation: 'analysis_history', limit: 101 }, /between 1 and 100/);
  rejects({ operation: 'analysis_history', limit: 0 }, /between 1 and 100/);
});

test('a compact agent brief needs a task, and a task needs a compact agent brief', () => {
  accepts({ operation: 'agent_brief', detail: 'compact', task: 'Fix cart rounding' });
  rejects({ operation: 'agent_brief', detail: 'compact' }, /requires task/);
  rejects({ operation: 'agent_brief', task: 'Fix cart rounding' }, /task is only valid/);
  rejects({ operation: 'overview', detail: 'full' }, /detail is only valid/);
});

test('a task longer than the brief limit is refused', () => {
  const task = 'x'.repeat(AGENT_BRIEF_TASK_MAX_CHARS + 1);
  rejects({ operation: 'agent_brief', detail: 'compact', task }, /at most/);
});

test('counts must be positive integers within their cap, depths non-negative', () => {
  accepts({ operation: 'overview', limit: 500, maxHops: 0, depth: 20, iterations: 100 });
  rejects({ operation: 'overview', limit: 501 }, /limit/);
  rejects({ operation: 'overview', limit: 0 }, /limit/);
  rejects({ operation: 'overview', maxHops: 21 }, /maxHops/);
  rejects({ operation: 'overview', minDegree: -1 }, /minDegree/);
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

test('a meaning repair review names its project and revision', () => {
  rejects({ operation: 'meaning_repair_review' }, /project/);
  rejects({ operation: 'meaning_repair_review', project: 'p' }, /reviewRevision/);
});
