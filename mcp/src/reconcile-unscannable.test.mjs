// A relation implemented in a language the scanner cannot read (native C, or a
// process spawn) is "cannot judge", never "possibly stale": reporting "did not
// see" as "does not exist" makes an agent delete correct relations.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { reconcileImportEdges } from './reconcile-imports.mjs';

const vaultEdge = (from, to) => ({ from, to, via: 'dependencies', ref: to });

test('a relation in a language the scanner reads may still be stale', () => {
  const out = reconcileImportEdges({
    moduleEdges: [],
    compiledEdges: [vaultEdge('capabilities/a', 'capabilities/b')],
    nodeSlugs: ['capabilities/a', 'capabilities/b'],
    pathBySlug: { 'capabilities/a': 'src/a.ts', 'capabilities/b': 'src/b.ts' },
  });
  assert.equal(out.inVaultNotInCode.length, 1, 'absent where it could be seen is a real clue');
  assert.equal(out.notJudgeableByImports.length, 0);
});

test('undecidable when either side is in a language the scanner cannot read', () => {
  const out = reconcileImportEdges({
    moduleEdges: [],
    compiledEdges: [vaultEdge('capabilities/acp-runtime', 'capabilities/mcp-server')],
    nodeSlugs: ['capabilities/acp-runtime', 'capabilities/mcp-server'],
    pathBySlug: {
      'capabilities/acp-runtime': 'native/acp.c',
      'capabilities/mcp-server': 'mcp/src/index.js',
    },
  });
  assert.equal(
    out.inVaultNotInCode.length,
    0,
    'calling a correct relation stale because of an unreadable C implementation makes the agent delete it',
  );
  assert.equal(out.notJudgeableByImports.length, 1);
  assert.deepEqual(out.notJudgeableByImports[0].unreadable, ['capabilities/acp-runtime']);
});

test('also says why it could not see, since unknown alone leaves no next step', () => {
  const out = reconcileImportEdges({
    moduleEdges: [],
    compiledEdges: [vaultEdge('capabilities/a', 'capabilities/b')],
    nodeSlugs: ['capabilities/a', 'capabilities/b'],
    pathBySlug: { 'capabilities/a': 'native/a.c', 'capabilities/b': 'src/b.ts' },
  });
  assert.equal(out.notJudgeableByImports[0].reason, 'endpoint_language_not_scanned');
});

test('a node with no known implementation path is undecidable, which differs from absent', () => {
  const out = reconcileImportEdges({
    moduleEdges: [],
    compiledEdges: [vaultEdge('capabilities/a', 'capabilities/b')],
    nodeSlugs: ['capabilities/a', 'capabilities/b'],
    pathBySlug: { 'capabilities/b': 'src/b.ts' },
  });
  assert.equal(out.notJudgeableByImports.length, 1);
  assert.equal(out.notJudgeableByImports[0].reason, 'endpoint_path_unknown');
});

test('without any path information it behaves as before, so callers do not break', () => {
  const out = reconcileImportEdges({
    moduleEdges: [],
    compiledEdges: [vaultEdge('capabilities/a', 'capabilities/b')],
    nodeSlugs: ['capabilities/a', 'capabilities/b'],
  });
  assert.equal(out.inVaultNotInCode.length, 1);
  assert.equal(out.notJudgeableByImports.length, 0);
});

test('real code support is still inBoth, since always undecidable is no check', () => {
  const out = reconcileImportEdges({
    moduleEdges: [{ from: 'capabilities/a', to: 'capabilities/b', count: 3 }],
    compiledEdges: [vaultEdge('capabilities/a', 'capabilities/b')],
    nodeSlugs: ['capabilities/a', 'capabilities/b'],
    pathBySlug: { 'capabilities/a': 'src-tauri/src/a.rs', 'capabilities/b': 'src/b.ts' },
  });
  assert.equal(out.inBoth.length, 1);
  assert.equal(out.notJudgeableByImports.length, 0);
});
