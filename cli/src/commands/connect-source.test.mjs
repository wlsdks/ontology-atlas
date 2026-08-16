import test from 'node:test';
import assert from 'node:assert/strict';
import { parseConnectSourceArgs } from './connect-source.mjs';

const EXPECTED = {
  projectSlug: 'projects/example',
  vault: 'docs/ontology',
  root: '/workspace/source',
  confirm: false,
  repair: false,
  json: true,
};

test('connect-source accepts the documented --root <path> form', () => {
  assert.deepEqual(
    parseConnectSourceArgs([
      'projects/example',
      'docs/ontology',
      '--root',
      '/workspace/source',
      '--json',
    ]),
    EXPECTED,
  );
});

test('connect-source accepts the --root=<path> form', () => {
  assert.deepEqual(
    parseConnectSourceArgs([
      'projects/example',
      'docs/ontology',
      '--root=/workspace/source',
      '--json',
    ]),
    EXPECTED,
  );
});

test('connect-source rejects a missing --root value before MCP startup', () => {
  assert.deepEqual(
    parseConnectSourceArgs(['projects/example', 'docs/ontology', '--root']),
    { error: '--root requires a value' },
  );
});
