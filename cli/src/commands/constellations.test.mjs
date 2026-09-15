import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { assertConstellationContextShape } from '../lib/constellation-result-contract.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_ENTRY = resolve(__dirname, '../index.mjs');
const CONSTELLATION_ID = '33333333-3333-4333-8333-333333333333';

function run(args) {
  return spawnSync(process.execPath, [CLI_ENTRY, ...args], {
    encoding: 'utf8',
    timeout: 10_000,
  });
}

test('constellation CLI rejects malformed identity before MCP startup', () => {
  const result = run(['constellation', 'not-a-uuid', '--json']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /constellation id must be a lowercase UUIDv4/);
});

test('CLI response contract refuses a claim that saved scope established meaning', () => {
  assert.throws(
    () => assertConstellationContextShape({
      contract: 'savedConstellationContext:v1',
      availability: 'ready',
      source: {
        path: '.ontology-atlas/library-collections.json',
        schema: 'ontology-atlas/library-collections/v1',
        status: 'ready',
        availability: 'ready',
        revision: null,
        mtime: null,
      },
      selection: {
        id: CONSTELLATION_ID,
        name: 'Review',
        purpose: { status: 'unknown' },
        createdAt: '2026-09-15T00:00:00.000Z',
        updatedAt: '2026-09-15T00:00:00.000Z',
        memberCount: 0,
        ontologyMemberCount: 0,
        referenceMemberCount: 0,
        members: [],
        pagination: { offset: 0, limit: 50, total: 0, returned: 0, hasMore: false, nextOffset: null },
      },
      current: { resolvedMembers: [], unresolvedMembers: [], resolvedMemberTotal: 0, unresolvedMemberTotal: 0 },
      relations: { total: 0, returned: 0, limited: false, rows: [] },
      outsideScopeDependencies: { total: 0, returned: 0, limited: false, rows: [] },
      coverage: {
        selectedMembership: 'saved_user_scope',
        memberFacts: 'complete_current_facts_for_saved_members',
        internalRelations: 'all_declared_edges_between_resolved_saved_members',
        outsideScopeDependencies: 'all_direct_declared_dependencies_crossing_saved_scope',
        transitiveImpactChecked: false,
        graphNodesScanned: 0,
        unresolvedGraphReferences: 0,
        unresolvedDependencyReferences: 0,
        meaningAcceptanceInferred: true,
        completeImpactInferred: false,
      },
      guidance: 'Saved scope is context only.',
    }),
    /coverage\.meaningAcceptanceInferred must be false/,
  );
});
