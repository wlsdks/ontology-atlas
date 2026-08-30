import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { assertArchitectureBriefResult } from './architecture-results.mjs';
import { loadMcpModule } from './mcp-module.mjs';

// The fixture table lives in the repository, not in the published package: the
// installed `npm test` skips these two cases instead of failing on a missing
// file, while a source checkout still runs them against the real MCP profile.
const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, '../../../tests/fixtures/architecture-profile-cases.mjs');
const fixtures = existsSync(fixturePath) ? await import(pathToFileURL(fixturePath).href) : null;
const { buildArchitectureBrief, parseArchitectureProfile } = await loadMcpModule('architecture-profile.mjs');

function validBrief() {
  return buildArchitectureBrief(parseArchitectureProfile(fixtures.FSD_PROFILE_FRONTMATTER), {
    rootPath: '/repo',
    edges: fixtures.FSD_ALLOWED_EDGES,
    filesScanned: 12,
    coverage: { allDetectedLanguagesSupported: true, supportedLanguages: ['typescript'] },
  });
}

const skip = fixtures ? false : 'repository fixture table is not shipped in the package';

test('architecture result validator accepts the usage-qualified public contract', { skip }, () => {
  const brief = validBrief();
  assert.equal(assertArchitectureBriefResult(brief), brief);
});

test('architecture result validator rejects missing or duplicate governed usages', { skip }, () => {
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

test('architecture result validator rejects usage receipt and aggregate drift', { skip }, () => {
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
