import assert from 'node:assert/strict';
import test from 'node:test';

import { MEANING_COMPETENCY_QUESTIONS } from '../meaning/meaning-assessment.mjs';
import { advertisedInputSchema } from './advertised-input-schema.mjs';
import { TOOL_BY_NAME, TOOL_INPUT_CONTRACT_BY_NAME } from './registry.mjs';
import { NON_BLANK_STRING_SCHEMA } from './tool-schemas/field-primitives.mjs';
import { normalizeToolArguments } from './validate.mjs';

/**
 * A top-level non-blank string loses its pattern in tools/list; the server must
 * still refuse what the pattern refused, before any handler runs.
 */

function strippedTopLevelFields() {
  const rows = [];
  for (const [name, contract] of TOOL_INPUT_CONTRACT_BY_NAME) {
    const advertised = TOOL_BY_NAME.get(name).inputSchema.properties;
    for (const [field, schema] of Object.entries(contract.properties ?? {})) {
      if (schema.pattern === NON_BLANK_STRING_SCHEMA.pattern && !schema.enum && advertised[field].pattern === undefined) {
        rows.push([name, field]);
      }
    }
  }
  return rows;
}

test('top-level non-blank strings are advertised without their pattern', () => {
  assert.ok(strippedTopLevelFields().length >= 40);
});

test('every stripped top-level pattern is still enforced before the handler', () => {
  for (const [tool, field] of strippedTopLevelFields()) {
    for (const [value, message] of [
      [' padded', `${field} must not have leading or trailing whitespace. Example ${field}: "padded".`],
      ['', `${field} must be a non-empty string.`],
      ['   ', `${field} must be a non-empty string.`],
      ['a\0b', `${field} must not contain a null byte.`],
      ...[['\n', '000A'], ['\r', '000D'], ['\u2028', '2028'], ['\u2029', '2029']].map(([terminator, codePoint]) => [
        `first${terminator}second`,
        `${field} must be a single line: it contains U+${codePoint}, a control or invisible formatting character that breaks a line.`,
      ]),
    ]) {
      assert.throws(() => normalizeToolArguments({ [field]: value }, tool), { message }, `${tool}.${field}`);
    }
    assert.doesNotThrow(() => normalizeToolArguments({ [field]: 'plain' }, tool), `${tool}.${field}`);
  }
});

test('a string item of a top-level array keeps its advertised pattern for the handler to judge', () => {
  const advertised = TOOL_BY_NAME.get('add_concept').inputSchema.properties.capabilities;
  assert.equal(advertised.items.pattern, NON_BLANK_STRING_SCHEMA.pattern);
  assert.doesNotThrow(() => normalizeToolArguments({ capabilities: [' capabilities/b'] }, 'add_concept'));
});

test('an enum string drops only the keywords every listed value satisfies', () => {
  const kind = TOOL_BY_NAME.get('list_concepts').inputSchema.properties.kind;
  assert.ok(kind.enum.length > 0);
  assert.equal(kind.pattern, undefined);
  assert.equal(kind.minLength, undefined);
});

/** Paths of advertised array schemas that do not say what their items are. */
function arraysWithoutItems(schema, path, found) {
  if (!schema || typeof schema !== 'object') return found;
  if (Array.isArray(schema)) {
    schema.forEach((child, index) => arraysWithoutItems(child, `${path}[${index}]`, found));
    return found;
  }
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (types.includes('array') && schema.items === undefined) found.push(path);
  for (const [key, child] of Object.entries(schema)) arraysWithoutItems(child, `${path}.${key}`, found);
  return found;
}

test('every advertised array says what its items are, as some hosts require', () => {
  const missing = [];
  for (const [name, tool] of TOOL_BY_NAME) arraysWithoutItems(tool.inputSchema, name, missing);
  assert.deepEqual(missing, []);
});

test('a top-level oneOf or allOf branch keeps its pattern, since only anyOf is checked again', () => {
  const advertised = advertisedInputSchema({
    type: 'object',
    properties: {
      chosen: { oneOf: [NON_BLANK_STRING_SCHEMA, { type: 'null' }] },
      combined: { allOf: [NON_BLANK_STRING_SCHEMA] },
      either: { anyOf: [NON_BLANK_STRING_SCHEMA, { type: 'null' }] },
    },
  }).properties;
  assert.equal(advertised.chosen.oneOf[0].pattern, NON_BLANK_STRING_SCHEMA.pattern);
  assert.equal(advertised.combined.allOf[0].pattern, NON_BLANK_STRING_SCHEMA.pattern);
  assert.equal(advertised.either.anyOf[0].pattern, undefined);
});

test('finalize_project_meaning lists every competency question and its witnesses where answers are written', () => {
  const { description } = TOOL_BY_NAME.get('finalize_project_meaning').inputSchema.properties.answers;
  for (const { id, question, requiredWitnesses } of MEANING_COMPETENCY_QUESTIONS) {
    assert.ok(description.includes(`\`${id}\`: ${question} (answered needs ${requiredWitnesses.join(', ')})`), id);
  }
});

test('an add_concepts row says what a body holds and that it is written in this call', () => {
  const { body } = TOOL_BY_NAME.get('add_concepts').inputSchema.properties.concepts.items.properties;
  for (const part of ['the deciding rule with the cite', '`## Includes`', '`## Excludes`', '`## Uncertainty`', 'written now']) {
    assert.ok(body.description?.includes(part), part);
  }
  assert.equal(TOOL_BY_NAME.get('add_concept').inputSchema.properties.body.description.startsWith(body.description), true);
});

test('absorb_document asks for the reviewed dry-run first and calls the outside-repo flag a destructive opt-in', () => {
  const tool = TOOL_BY_NAME.get('absorb_document');
  assert.match(tool.description, /Review the dry-run first: without confirm: true nothing is written\./);
  assert.match(tool.description, /reviewed dry-run plus allowOutsideRepo:true/);
  assert.match(tool.inputSchema.properties.allowOutsideRepo.description, /^Explicit destructive opt-in/);
});

test('destructive and approval limits keep their meaning in tools/list', () => {
  assert.match(TOOL_BY_NAME.get('delete_concept').inputSchema.properties.force.description, /referrers are left dangling/);
  for (const name of ['add_relation', 'add_relations']) {
    assert.match(TOOL_BY_NAME.get(name).description, /infer_imports\.moduleEdges.*(human approval|the user's acceptance) first/, name);
  }
});
