import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { advertisedOutputSchema } from './advertised-output-schema.mjs';
import { TOOL_BY_NAME, TOOL_OUTPUT_CONTRACT_BY_NAME, TOOLS_FOR_LIST } from './registry.mjs';

const DEFINITIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'tool-definitions');
// Measured at 19,728 bytes for the 39 output schemas of the full profile; the
// full contracts behind them measure 197,504.
const ADVERTISED_OUTPUT_SCHEMA_BUDGET_BYTES = 21_000;
// Dropping `oneOf` only loosens; `patternProperties` or similar beside a closed root would not.
const CUT_SAFE_CONTRACT_ROOT_KEYWORDS = new Set(['type', 'properties', 'required', 'additionalProperties', 'oneOf', 'description', 'title']);

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
    assert.deepEqual(
      Object.keys(contract).filter((key) => !CUT_SAFE_CONTRACT_ROOT_KEYWORDS.has(key)),
      [],
      `${name} contract root uses only keywords the cut can drop without rejecting a valid answer`,
    );
    assert.deepEqual(Object.keys(advertised.properties), Object.keys(contract.properties), `${name} property names`);
    for (const [field, schema] of Object.entries(advertised.properties)) {
      assert.ok(contract.properties[field].type, `${name}.${field} declares a type in its contract`);
      assert.deepEqual(schema.type, contract.properties[field].type, `${name}.${field} advertises its contract's type`);
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
