import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  BUN_VERSION_FILE,
  binaryFileNameForTriple,
  bunTargetForTriple,
  bunVersionVerdict,
  hostTargetTriple,
  pinnedBunVersion,
  SUPPORTED_TARGET_TRIPLES,
} from './mcp-binary.mjs';

test('CI compiles the sidecar only with the bun release the repository names', () => {
  const pinned = pinnedBunVersion(readFileSync(BUN_VERSION_FILE, 'utf8'));
  const escaped = pinned.replaceAll('.', '\\.');
  assert.equal(bunVersionVerdict(pinned, `${pinned}\n`, { ci: true }), null);
  assert.equal(bunVersionVerdict(pinned, '9.9.9', { ci: true }).fatal, true);
  assert.equal(bunVersionVerdict(pinned, '9.9.9', { ci: false }).fatal, false, 'a local build warns and continues');
  assert.equal(bunVersionVerdict(pinned, '9.9.9').fatal, false);
  assert.match(bunVersionVerdict(pinned, '9.9.9').message, new RegExp(`not the pinned ${escaped}`));
  assert.match(bunVersionVerdict(pinned, '').message, /bun \(unknown\)/);
  assert.match(bunVersionVerdict(pinned, '9.9.9').message, new RegExp(`bash -s "bun-v${escaped}"`));
  for (const floating of ['latest', 'canary', '1.4.x', '^1.4.2', '']) {
    assert.throws(() => pinnedBunVersion(floating), /one exact bun release/);
  }
});

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
