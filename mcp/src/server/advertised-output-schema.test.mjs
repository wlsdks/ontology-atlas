import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { AjvJsonSchemaValidator } from '@modelcontextprotocol/server/validators/ajv';

import { advertisedOutputSchema } from './advertised-output-schema.mjs';
import { TOOL_BY_NAME, TOOL_OUTPUT_CONTRACT_BY_NAME, TOOLS_FOR_LIST } from './registry.mjs';

const HOST_VALIDATOR = new AjvJsonSchemaValidator();
const DEFINITIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'tool-definitions');
// Measured at 19,728 bytes for the 39 output schemas of the full profile; the
// full contracts behind them measure 197,504.
const ADVERTISED_OUTPUT_SCHEMA_BUDGET_BYTES = 21_000;

async function definedOutputSchemas() {
  const byName = new Map();
  for (const file of readdirSync(DEFINITIONS_DIR).filter((name) => name.endsWith('.mjs'))) {
    const definitions = await import(pathToFileURL(join(DEFINITIONS_DIR, file)).href);
    for (const value of Object.values(definitions)) {
      if (value?.name && value.inputSchema && value.outputSchema) byName.set(value.name, value.outputSchema);
    }
  }
  return byName;
}

test('the output contracts are the schemas the tool files define, and tools/list advertises their cut', async () => {
  const defined = await definedOutputSchemas();
  assert.deepEqual([...TOOL_OUTPUT_CONTRACT_BY_NAME.keys()].sort(), [...defined.keys()].sort());
  for (const [name, contract] of TOOL_OUTPUT_CONTRACT_BY_NAME) {
    assert.equal(contract, defined.get(name), `${name} contract is its tool file's outputSchema`);
    assert.deepEqual(TOOL_BY_NAME.get(name).outputSchema, advertisedOutputSchema(contract), `${name} advertises the cut of its contract`);
  }
});

test('an advertised output schema keeps every top-level name, type and required field and nothing below', () => {
  for (const [name, contract] of TOOL_OUTPUT_CONTRACT_BY_NAME) {
    const advertised = TOOL_BY_NAME.get(name).outputSchema;
    assert.equal(advertised.type, 'object', `${name} root type`);
    assert.deepEqual(advertised.required, contract.required, `${name} required`);
    assert.equal(advertised.additionalProperties, contract.additionalProperties === false ? false : undefined, `${name} root openness`);
    assert.deepEqual(Object.keys(advertised).filter((key) => !['type', 'properties', 'required', 'additionalProperties'].includes(key)), [], `${name} root keywords`);
    assert.deepEqual(Object.keys(advertised.properties), Object.keys(contract.properties), `${name} property names`);
    for (const [field, schema] of Object.entries(advertised.properties)) {
      assert.ok(schema.type, `${name}.${field} keeps a type`);
      assert.deepEqual(Object.keys(schema).filter((key) => key !== 'type' && key !== 'description'), [], `${name}.${field} is one level deep`);
    }
  }
});

test(`advertised output schemas stay under ${ADVERTISED_OUTPUT_SCHEMA_BUDGET_BYTES} bytes on the full profile`, () => {
  const bytes = TOOLS_FOR_LIST
    .filter((tool) => tool.outputSchema)
    .reduce((sum, tool) => sum + Buffer.byteLength(JSON.stringify(tool.outputSchema), 'utf8'), 0);
  assert.ok(bytes <= ADVERTISED_OUTPUT_SCHEMA_BUDGET_BYTES, `advertised output schemas are ${bytes} bytes`);
});

test('the advertised cut accepts every value its contract accepts, under an SDK client validator', () => {
  const row = {
    type: 'object',
    properties: { id: { type: 'string', pattern: '^r-' }, tags: { type: 'array', items: { type: 'string', enum: ['a'] } } },
    required: ['id'],
    additionalProperties: false,
  };
  const contract = {
    type: 'object',
    properties: {
      state: { type: 'string', enum: ['ready', 'blocked'] },
      score: { anyOf: [{ type: 'integer', minimum: 0 }, { type: 'number' }] },
      next: { anyOf: [row, { type: 'null' }] },
      mode: { const: 'summary' },
      rows: { type: 'array', maxItems: 2, items: row },
      canConfirm: { type: 'boolean', description: 'True only when confirm:true can perform the change.' },
      note: { type: 'string', description: 'A long description the agent does not need.' },
    },
    required: ['state', 'rows'],
    oneOf: [{ required: ['score'] }, { required: ['next'] }],
    additionalProperties: false,
  };
  const advertised = advertisedOutputSchema(contract);
  assert.deepEqual(advertised.properties, {
    state: { type: 'string' },
    score: { type: 'number' },
    next: { type: ['object', 'null'] },
    mode: { type: 'string' },
    rows: { type: 'array' },
    canConfirm: { type: 'boolean', description: 'True only when confirm:true can perform the change.' },
    note: { type: 'string' },
  });

  const checkContract = HOST_VALIDATOR.getValidator(contract);
  const checkAdvertised = HOST_VALIDATOR.getValidator(advertised);
  const valid = [
    { state: 'ready', rows: [], score: 1 },
    { state: 'blocked', rows: [{ id: 'r-1', tags: ['a'] }], score: 0.5, mode: 'summary', canConfirm: true },
    { state: 'ready', rows: [{ id: 'r-2' }], next: { id: 'r-3' }, note: 'x' },
    { state: 'ready', rows: [], next: null },
  ];
  for (const value of valid) {
    assert.ok(checkContract(value).valid, `the contract accepts ${JSON.stringify(value)}`);
    assert.ok(checkAdvertised(value).valid, `the advertised cut accepts ${JSON.stringify(value)}`);
  }
  for (const value of [{ rows: [] }, { state: 'ready', rows: {} }, { state: 'ready', rows: [], extra: 1 }]) {
    assert.equal(checkAdvertised(value).valid, false, `the advertised cut still refuses ${JSON.stringify(value)}`);
  }
});
