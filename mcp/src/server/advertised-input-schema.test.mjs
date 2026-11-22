import assert from 'node:assert/strict';
import test from 'node:test';

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
      ...['\n', '\r', '\u2028', '\u2029'].map((terminator) => [
        `first${terminator}second`,
        `${field} must be a single line: no line feed, carriage return, U+2028 or U+2029.`,
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
