// 못 읽는 언어로 구현된 관계를 「오래됐을 수 있다」고 말하지 않는다.
//
// ## 왜 (2026-08-17 실측, 이 저장소 자신)
//
// `infer-imports` 가 우리 볼트를 이렇게 판정했다:
//
//   inBoth: 0
//   inVaultNotInCode: 3   → "3 vault depends_on edge(s) have no matching
//                            code import (review for stale)"
//
// 그 셋은 전부 **맞는 관계**다:
//   capabilities/acp-runtime      → capabilities/mcp-server
//   capabilities/cli-developer-entry → capabilities/mcp-server
//   capabilities/mcp-server       → capabilities/vault-ontology
//
// 스캐너가 못 본 이유는 관계가 없어서가 아니라 **볼 수 없어서**다.
// `acp-runtime` 의 구현은 `src-tauri/src/acp.rs` — Rust 이고, 스캐너가 읽는
// 확장자 목록(`.ts .js .py .go` …)에 `.rs` 는 없다. 나머지 둘은 프로세스를
// 띄우는 관계(spawn)라 import 로 표현될 수 없다.
//
// **「못 봤다」를 「없다」로 말하면 에이전트가 맞는 관계를 지운다.** 이 저장소의
// CodeGraph 규칙이 같은 말을 이미 하고 있다: *"'not found' 를 부재의 증거로
// 쓰지 마라."*
//
// 그래서 판정을 셋으로 가른다: 볼 수 있는데 없으면 「오래됐을 수 있다」,
// **볼 수 없으면 「판정 못 함」**.

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
      'capabilities/acp-runtime': 'src-tauri/src/acp.rs',
      'capabilities/mcp-server': 'mcp/src/index.js',
    },
  });
  assert.equal(
    out.inVaultNotInCode.length,
    0,
    'Rust 구현을 못 읽었다는 이유로 맞는 관계가 「오래됐다」로 가면 에이전트가 지운다',
  );
  assert.equal(out.notJudgeableByImports.length, 1);
  assert.deepEqual(out.notJudgeableByImports[0].unreadable, ['capabilities/acp-runtime']);
});

test('왜 못 봤는지를 같이 말한다 — 「모른다」만으로는 다음에 할 일이 없다', () => {
  const out = reconcileImportEdges({
    moduleEdges: [],
    compiledEdges: [vaultEdge('capabilities/a', 'capabilities/b')],
    nodeSlugs: ['capabilities/a', 'capabilities/b'],
    pathBySlug: { 'capabilities/a': 'src-tauri/src/a.rs', 'capabilities/b': 'src/b.ts' },
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
