import test from 'node:test';
import assert from 'node:assert/strict';

import { assertArchitectureBriefResult } from './architecture-results.mjs';

function validBrief() {
  return {
    contract: 'architectureBrief:v1',
    sideEffect: 0,
    profile: { slug: 'atlas-web', roles: [] },
    measured: {
      at: '2026-08-27T00:00:00.000Z',
      tool: { name: 'ontology-atlas', version: '0.13.0' },
      source: { kind: 'git', revision: 'abcdef123456', dirty: true },
    },
    conformance: {
      status: 'unknown',
      violations: [],
      typeOnlyEdgeCount: 0,
    },
    agentPlanContract: {},
    nextActions: [],
  };
}

test('accepts a stamped brief with git and folder sources', () => {
  assert.doesNotThrow(() => assertArchitectureBriefResult(validBrief()));
  const folder = validBrief();
  folder.measured.source = { kind: 'folder', fingerprint: `sha256:${'0f'.repeat(32)}` };
  assert.doesNotThrow(() => assertArchitectureBriefResult(folder));
});

test('rejects a brief without a measured stamp', () => {
  const brief = validBrief();
  delete brief.measured;
  assert.throws(() => assertArchitectureBriefResult(brief), /measured/);
});

test('rejects conflated git/folder stamps', () => {
  const gitWithFingerprint = validBrief();
  gitWithFingerprint.measured.source.fingerprint = `sha256:${'0f'.repeat(32)}`;
  assert.throws(() => assertArchitectureBriefResult(gitWithFingerprint), /must not mix/);

  const folderWithRevision = validBrief();
  folderWithRevision.measured.source = {
    kind: 'folder',
    fingerprint: `sha256:${'0f'.repeat(32)}`,
    revision: 'abcdef123456',
  };
  assert.throws(() => assertArchitectureBriefResult(folderWithRevision), /must not mix/);
});

test('rejects a brief without the type-only edge count', () => {
  const brief = validBrief();
  delete brief.conformance.typeOnlyEdgeCount;
  assert.throws(() => assertArchitectureBriefResult(brief), /typeOnlyEdgeCount/);
});
