import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { AjvJsonSchemaValidator } from '@modelcontextprotocol/server/validators/ajv';

import { TOOLS_FOR_LIST } from './registry.mjs';
import { hoistSharedSubschemas, inlineSharedSubschemas } from './shared-subschemas.mjs';

const DEFINITIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'tool-definitions');

async function definedOutputSchemas() {
  const byName = new Map();
  for (const file of readdirSync(DEFINITIONS_DIR).filter((name) => name.endsWith('.mjs'))) {
    const module = await import(pathToFileURL(join(DEFINITIONS_DIR, file)).href);
    for (const value of Object.values(module)) {
      if (value?.name && value.inputSchema) byName.set(value.name, value.outputSchema);
    }
  }
  return byName;
}

function refNodes(node, found = []) {
  if (Array.isArray(node)) node.forEach((child) => refNodes(child, found));
  else if (node && typeof node === 'object') {
    if ('$ref' in node) found.push(node);
    Object.values(node).forEach((child) => refNodes(child, found));
  }
  return found;
}

test('every listed outputSchema inlines back to exactly the schema its tool file defines', async () => {
  const defined = await definedOutputSchemas();
  assert.equal(defined.size, TOOLS_FOR_LIST.length);
  for (const tool of TOOLS_FOR_LIST) {
    assert.equal(
      JSON.stringify(inlineSharedSubschemas(tool.outputSchema)),
      JSON.stringify(defined.get(tool.name)),
      `${tool.name} outputSchema lost or changed a constraint`,
    );
  }
});

test('a listed $ref stands alone, points into the root $defs, and every def is used', () => {
  for (const tool of TOOLS_FOR_LIST.filter((entry) => entry.outputSchema?.$defs)) {
    const refs = refNodes(tool.outputSchema);
    for (const ref of refs) {
      assert.deepEqual(Object.keys(ref), ['$ref'], `${tool.name} $ref has siblings a draft-07 reader would drop`);
      assert.ok(ref.$ref.slice('#/$defs/'.length) in tool.outputSchema.$defs, `${tool.name} ${ref.$ref} resolves`);
    }
    const used = new Set(refs.map((ref) => ref.$ref.slice('#/$defs/'.length)));
    assert.deepEqual(Object.keys(tool.outputSchema.$defs).filter((name) => !used.has(name)), [], `${tool.name} has unused $defs`);
  }
});

test('a hoisted schema accepts and rejects the same values as the inline one under an SDK client validator', () => {
  const action = {
    type: 'object',
    properties: { id: { type: 'string', minLength: 1 }, score: { type: 'number', minimum: 0 } },
    required: ['id', 'score'],
    additionalProperties: false,
  };
  const inline = {
    type: 'object',
    properties: { next: { ...action, type: ['object', 'null'] }, first: action, actions: { type: 'array', items: action } },
    required: ['first', 'actions'],
    additionalProperties: false,
  };
  const hoisted = hoistSharedSubschemas(inline);
  assert.ok(hoisted.$defs, 'the repeated action shape is written once');
  assert.ok(JSON.stringify(hoisted).length < JSON.stringify(inline).length);
  assert.deepEqual(inlineSharedSubschemas(hoisted), inline);

  const validator = new AjvJsonSchemaValidator();
  const checkInline = validator.getValidator(inline);
  const checkHoisted = validator.getValidator(hoisted);
  const values = [
    { first: { id: 'a', score: 1 }, actions: [{ id: 'b', score: 0 }], next: null },
    { first: { id: 'a', score: 1 }, actions: [{ id: 'b', score: -1 }] },
    { first: { id: '', score: 1 }, actions: [] },
    { first: { id: 'a', score: 1, extra: true }, actions: [] },
    { first: { id: 'a', score: 1 }, actions: [{ id: 'b' }] },
    { first: { id: 'a', score: 1 }, actions: [], next: { id: 'c', score: 2 } },
  ];
  assert.deepEqual(
    values.map((value) => checkHoisted(value).valid),
    values.map((value) => checkInline(value).valid),
  );
  assert.deepEqual(values.map((value) => checkHoisted(value).valid), [true, false, false, false, false, true]);
});
