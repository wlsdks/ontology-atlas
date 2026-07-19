import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  comparableDoc,
  comparableManifest,
  extractOutLinksWithContext,
  parseArgs,
  resolveWikilinkTargetSlug,
  usage,
} from './build-docs-vault.mjs';

describe('build-docs-vault script helpers', () => {
  it('parses check/help flags and rejects accidental writes from unknown args', () => {
    assert.deepEqual(parseArgs([]), { check: false });
    assert.deepEqual(parseArgs(['--check']), { check: true });
    assert.deepEqual(parseArgs(['--help']), { help: true });
    assert.deepEqual(parseArgs(['-h']), { help: true });
    assert.deepEqual(parseArgs(['--check', 'extra']), {
      error: 'Unexpected argument: extra',
    });
    assert.deepEqual(parseArgs(['--fix']), {
      error: 'Unknown option: --fix',
    });
  });

  it('keeps usage explicit about check mode being read-only', () => {
    assert.match(usage(), /Usage: node scripts\/build-docs-vault\.mjs \[--check\]/);
    assert.match(usage(), /Verify generated outputs are current without writing/);
  });

  it('ignores timestamp-only manifest churn while preserving content drift', () => {
    const baseDoc = {
      slug: 'README',
      title: 'Readme',
      wordCount: 10,
      updatedAt: '2026-05-18T00:00:00.000Z',
    };
    const nextDoc = {
      ...baseDoc,
      updatedAt: '2026-05-18T01:00:00.000Z',
    };
    assert.deepEqual(comparableDoc(baseDoc), comparableDoc(nextDoc));
    assert.notDeepEqual(
      comparableDoc(baseDoc),
      comparableDoc({ ...nextDoc, wordCount: 11 }),
    );

    const baseManifest = {
      version: '2026-04-23',
      generatedAt: '2026-05-18T00:00:00.000Z',
      docs: [baseDoc],
    };
    const nextManifest = {
      ...baseManifest,
      generatedAt: '2026-05-18T01:00:00.000Z',
      docs: [nextDoc],
    };
    assert.deepEqual(comparableManifest(baseManifest), comparableManifest(nextManifest));
    assert.notDeepEqual(
      comparableManifest(baseManifest),
      comparableManifest({
        ...nextManifest,
        docs: [{ ...nextDoc, title: 'Changed' }],
      }),
    );
  });
});

describe('resolveWikilinkTargetSlug / extractOutLinksWithContext — nested ontology/ vault', () => {
  // persona QA (fix/persona-findings ③) — mirror of the shared TS test in
  // src/shared/lib/parse-frontmatter.test.ts. This .mjs copy is the one that
  // actually builds the static dogfood manifest (`docs-vault:build`), so it
  // needs its own regression guard against the same drift.
  it('ontology/ 문서 안의 위키링크는 ontology/ 접두사를 붙여 정규화한다', () => {
    assert.equal(
      resolveWikilinkTargetSlug('capabilities/topology-canvas-render', 'ontology/elements/sigma-graphology'),
      'ontology/capabilities/topology-canvas-render',
    );
    const { contexts } = extractOutLinksWithContext(
      '같은 캔버스 엔진 얘기는 [[capabilities/topology-canvas-render]] 참고.',
      'ontology/elements/sigma-graphology',
    );
    assert.equal(contexts.length, 1);
    assert.equal(contexts[0].target, 'ontology/capabilities/topology-canvas-render');
  });

  it('이미 ontology/ 접두사가 붙은 위키링크는 이중으로 접두사를 붙이지 않는다', () => {
    assert.equal(
      resolveWikilinkTargetSlug('ontology/project', 'ontology/domains/views'),
      'ontology/project',
    );
  });

  it('ontology/ 바깥(최상위) 문서의 위키링크는 그대로 vault 루트 기준을 유지한다', () => {
    assert.equal(resolveWikilinkTargetSlug('FEATURES', 'CHANGELOG'), 'FEATURES');
  });
});
