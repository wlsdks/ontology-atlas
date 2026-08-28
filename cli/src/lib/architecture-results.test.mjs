import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FSD_ALLOWED_EDGES,
  FSD_PROFILE_FRONTMATTER,
} from '../../../tests/fixtures/architecture-profile-cases.mjs';
import {
  buildArchitectureBrief,
  parseArchitectureProfile,
} from '../../../mcp/src/architecture-profile.mjs';
import { assertArchitectureBriefResult } from './architecture-results.mjs';

function validBrief() {
  return buildArchitectureBrief(parseArchitectureProfile(FSD_PROFILE_FRONTMATTER), {
    rootPath: '/repo',
    edges: FSD_ALLOWED_EDGES,
    filesScanned: 12,
    coverage: { allDetectedLanguagesSupported: true, supportedLanguages: ['typescript'] },
  });
}

test('architecture result validator accepts the usage-qualified public contract', () => {
  const brief = validBrief();
  assert.equal(assertArchitectureBriefResult(brief), brief);
});

test('architecture result validator rejects missing or duplicate governed usages', () => {
  const missing = structuredClone(validBrief());
  delete missing.profile.dependencyUsages;
  assert.throws(() => assertArchitectureBriefResult(missing), /dependencyUsages must be an array/);

  const duplicate = structuredClone(validBrief());
  duplicate.profile.dependencyUsages = ['value', 'value'];
  assert.throws(
    () => assertArchitectureBriefResult(duplicate),
    /dependencyUsages must contain value and\/or type_only/,
  );
});

test('architecture result validator rejects usage receipt and aggregate drift', () => {
  const badReceipt = structuredClone(validBrief());
  badReceipt.conformance.observedRoleEdges[0].evidence[0].importUsage = 'mystery';
  assert.throws(() => assertArchitectureBriefResult(badReceipt), /importUsage must be value/);

  const badCount = structuredClone(validBrief());
  badCount.conformance.observedRoleEdges[0].importUsageCounts.value += 1;
  assert.throws(() => assertArchitectureBriefResult(badCount), /must total count/);

  const missingUnknown = structuredClone(validBrief());
  delete missingUnknown.conformance.unknown.unknownImportUsages;
  assert.throws(() => assertArchitectureBriefResult(missingUnknown), /must be a non-negative integer/);
});
