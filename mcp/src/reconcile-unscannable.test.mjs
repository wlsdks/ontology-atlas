// Never call a relation implemented in a language we cannot read "possibly stale".
//
// Why (measured 2026-08-17, on this repository itself): `infer-imports` judged our
// own vault like this:
//
//   inBoth: 0
//   inVaultNotInCode: 3   → "3 vault depends_on edge(s) have no matching
//                            code import (review for stale)"
//
// All three are **correct relations**:
//   capabilities/acp-runtime      → capabilities/mcp-server
//   capabilities/cli-developer-entry → capabilities/mcp-server
//   capabilities/mcp-server       → capabilities/vault-ontology
//
// The scanner missed them not because the relations are absent but because it
// **cannot see them**. Native C endpoints remain outside the scanner's extension
// list. Process-spawn relations likewise cannot be expressed by an import.
//
// **Reporting "did not see" as "does not exist" makes an agent delete correct
// relations.** This repository's CodeGraph rule already says the same thing:
// *"never use 'not found' as evidence of absence."*
//
// So the verdict splits three ways: visible and absent → "possibly stale";
// **not visible → "cannot judge"**.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { reconcileImportEdges } from './reconcile-imports.mjs';

const vaultEdge = (from, to) => ({ from, to, via: 'dependencies', ref: to });

test('스캐너가 읽는 언어의 관계는 여전히 「오래됐을 수 있다」', () => {
  const out = reconcileImportEdges({
    moduleEdges: [],
    compiledEdges: [vaultEdge('capabilities/a', 'capabilities/b')],
    nodeSlugs: ['capabilities/a', 'capabilities/b'],
    pathBySlug: { 'capabilities/a': 'src/a.ts', 'capabilities/b': 'src/b.ts' },
  });
  assert.equal(out.inVaultNotInCode.length, 1, '볼 수 있는데 없으면 그건 진짜 단서다');
  assert.equal(out.notJudgeableByImports.length, 0);
});

test('못 읽는 언어가 한쪽에라도 끼면 「판정 못 함」이다', () => {
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
    '읽지 못하는 C 구현을 이유로 맞는 관계가 「오래됐다」로 가면 에이전트가 지운다',
  );
  assert.equal(out.notJudgeableByImports.length, 1);
  assert.deepEqual(out.notJudgeableByImports[0].unreadable, ['capabilities/acp-runtime']);
});

test('왜 못 봤는지를 같이 말한다 — 「모른다」만으로는 다음에 할 일이 없다', () => {
  const out = reconcileImportEdges({
    moduleEdges: [],
    compiledEdges: [vaultEdge('capabilities/a', 'capabilities/b')],
    nodeSlugs: ['capabilities/a', 'capabilities/b'],
    pathBySlug: { 'capabilities/a': 'native/a.c', 'capabilities/b': 'src/b.ts' },
  });
  assert.equal(out.notJudgeableByImports[0].reason, 'endpoint_language_not_scanned');
});

test('구현 경로를 아예 모르는 노드도 판정 못 한다 — 없는 것과 다르다', () => {
  const out = reconcileImportEdges({
    moduleEdges: [],
    compiledEdges: [vaultEdge('capabilities/a', 'capabilities/b')],
    nodeSlugs: ['capabilities/a', 'capabilities/b'],
    pathBySlug: { 'capabilities/b': 'src/b.ts' },
  });
  assert.equal(out.notJudgeableByImports.length, 1);
  assert.equal(out.notJudgeableByImports[0].reason, 'endpoint_path_unknown');
});

test('경로 정보를 아예 안 주면 예전처럼 행동한다 — 부르는 쪽을 안 깨뜨린다', () => {
  const out = reconcileImportEdges({
    moduleEdges: [],
    compiledEdges: [vaultEdge('capabilities/a', 'capabilities/b')],
    nodeSlugs: ['capabilities/a', 'capabilities/b'],
  });
  assert.equal(out.inVaultNotInCode.length, 1);
  assert.equal(out.notJudgeableByImports.length, 0);
});

test('코드가 실제로 뒷받침하면 여전히 inBoth 다 — 늘 「판정 못 함」이면 그것도 검사가 아니다', () => {
  const out = reconcileImportEdges({
    moduleEdges: [{ from: 'capabilities/a', to: 'capabilities/b', count: 3 }],
    compiledEdges: [vaultEdge('capabilities/a', 'capabilities/b')],
    nodeSlugs: ['capabilities/a', 'capabilities/b'],
    pathBySlug: { 'capabilities/a': 'src-tauri/src/a.rs', 'capabilities/b': 'src/b.ts' },
  });
  assert.equal(out.inBoth.length, 1);
  assert.equal(out.notJudgeableByImports.length, 0);
});
