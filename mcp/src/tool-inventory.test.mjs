import assert from 'node:assert/strict';
import test from 'node:test';

import { buildToolInventorySection } from './tool-inventory.mjs';

const readTool = (name) => ({ name, annotations: { readOnlyHint: true } });
const writeTool = (name) => ({ name, annotations: { readOnlyHint: false } });

test('buildToolInventorySection derives counts and names from the advertised registry', () => {
  assert.equal(
    buildToolInventorySection([
      readTool('list_things'),
      writeTool('add_thing'),
      readTool('get_thing'),
    ]),
    `## Tool inventory (3 tools = read 2 + write 1)

**read** — \`list_things\` · \`get_thing\`.
**write** — \`add_thing\`.`,
  );
});

test('buildToolInventorySection represents an advertised read-only registry without hidden writes', () => {
  assert.equal(
    buildToolInventorySection([readTool('list_things'), readTool('get_thing')]),
    `## Tool inventory (2 tools = read 2 + write 0)

**read** — \`list_things\` · \`get_thing\`.
**write** — none.`,
  );
});

test('buildToolInventorySection fails closed on malformed or duplicate advertised names', () => {
  assert.throws(() => buildToolInventorySection(null), /requires an array/);
  assert.throws(() => buildToolInventorySection([{ name: 'Bad Tool' }]), /canonical tool name/);
  assert.throws(
    () => buildToolInventorySection([readTool('same_tool'), writeTool('same_tool')]),
    /must be unique/,
  );
});
