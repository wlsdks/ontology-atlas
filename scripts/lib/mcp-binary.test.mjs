import test from 'node:test';
import assert from 'node:assert/strict';

import {
  binaryFileNameForTriple,
  bunTargetForTriple,
  hostTargetTriple,
  SUPPORTED_TARGET_TRIPLES,
} from './mcp-binary.mjs';

test('Windows x64 is a first-class native MCP sidecar target', () => {
  const triple = 'x86_64-pc-windows-msvc';

  assert.ok(SUPPORTED_TARGET_TRIPLES.includes(triple));
  assert.equal(hostTargetTriple('win32', 'x64'), triple);
  assert.equal(bunTargetForTriple(triple), 'bun-windows-x64');
  assert.equal(binaryFileNameForTriple(triple), 'ontology-atlas-mcp-x86_64-pc-windows-msvc.exe');
});

test('macOS host target behavior remains unchanged', () => {
  assert.equal(hostTargetTriple('darwin', 'arm64'), 'aarch64-apple-darwin');
  assert.equal(hostTargetTriple('darwin', 'x64'), 'x86_64-apple-darwin');
  assert.equal(binaryFileNameForTriple('aarch64-apple-darwin'), 'ontology-atlas-mcp-aarch64-apple-darwin');
});
