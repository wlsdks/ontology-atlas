import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { TOOLS_FOR_LIST } from './registry.mjs';
import { inlineSharedSubschemas } from './shared-subschemas.mjs';

const DEFINITIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'tool-definitions');

async function definedOutputSchemas() {
  const byName = new Map();
  for (const file of readdirSync(DEFINITIONS_DIR).filter((name) => name.endsWith('.mjs'))) {
    const definitions = await import(pathToFileURL(join(DEFINITIONS_DIR, file)).href);
    for (const value of Object.values(definitions)) {
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
