import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { assertConstellationContextShape } from '../lib/constellation-result-contract.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_ENTRY = resolve(__dirname, '../index.mjs');
const MCP_ENTRY = resolve(__dirname, '../../../mcp/src/index.js');
const FIXTURE = resolve(__dirname, '../../../tests/contract/fixtures/library-collections/constellations-v1.json');
const CONSTELLATION_ID = '33333333-3333-4333-8333-333333333333';

function writeNode(vault, slug, frontmatter, body) {
  const path = join(vault, `${slug}.md`);
  mkdirSync(dirname(path), { recursive: true });
  const yaml = Object.entries(frontmatter).flatMap(([key, value]) => Array.isArray(value)
    ? (value.length === 0 ? [`${key}: []`] : [`${key}:`, ...value.map((item) => `  - ${item}`)])
    : [`${key}: ${value}`]);
  writeFileSync(path, `---\n${yaml.join('\n')}\n---\n\n${body}\n`, 'utf8');
}

function makeVault() {
  const vault = mkdtempSync(join(tmpdir(), 'ontology-atlas-cli-constellations-'));
  mkdirSync(join(vault, '.ontology-atlas'));
  writeFileSync(
    join(vault, '.ontology-atlas/library-collections.json'),
    readFileSync(FIXTURE, 'utf8'),
    'utf8',
  );
  writeNode(vault, 'capabilities/current-member', {
    uid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    kind: 'capability',
    title: 'Current member',
    path: 'mcp/src/index.js',
    depends_on: ['capabilities/merged-member'],
  }, 'Current source-backed evidence.');
  writeNode(vault, 'capabilities/merged-member', {
    uid: '12121212-1212-4212-8212-121212121212',
    merged_uids: ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'],
    kind: 'capability',
    title: 'Merged member',
  }, 'Current node for the saved merged identity.');
  return vault;
}

function run(args) {
  return spawnSync(process.execPath, [CLI_ENTRY, ...args], {
    encoding: 'utf8',
    env: { ...process.env, OATLAS_MCP_PATH: MCP_ENTRY },
    timeout: 10_000,
  });
}

test('public CLI wrappers recover a saved ID through the source MCP', () => {
  const vault = makeVault();
  try {
    const listed = run(['constellations', vault, '--limit', '1', '--json']);
    assert.equal(listed.status, 0, listed.stderr);
    const listResult = JSON.parse(listed.stdout);
    assert.equal(listResult.contract, 'savedConstellationList:v1');
    assert.equal(listResult.constellations[0].id, CONSTELLATION_ID);
    assert.equal(listResult.pagination.hasMore, true);

    const focused = run([
      'constellation', CONSTELLATION_ID, vault,
      '--limit', '2', '--relation-limit', '1', '--dependency-limit', '1', '--json',
    ]);
    assert.equal(focused.status, 0, focused.stderr);
    const context = JSON.parse(focused.stdout);
    assert.equal(context.contract, 'savedConstellationContext:v1');
    assert.deepEqual(
      context.current.resolvedMembers.map((member) => member.identityResolution),
      ['current', 'merged'],
    );
    assert.equal(context.selection.pagination.hasMore, true);
    assert.equal(context.coverage.transitiveImpactChecked, false);
    assert.equal(context.coverage.meaningAcceptanceInferred, false);
  } finally {
    rmSync(vault, { recursive: true, force: true });
  }
});

test('constellation CLI rejects malformed identity before MCP startup', () => {
  const result = run(['constellation', 'not-a-uuid', '--json']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /constellation id must be a lowercase UUIDv4/);
});

test('CLI exposes a corrupt sidecar as unavailable and does not rewrite it', () => {
  const vault = makeVault();
  const sidecar = join(vault, '.ontology-atlas/library-collections.json');
  try {
    writeFileSync(sidecar, '{oops', 'utf8');
    const result = run(['constellations', vault, '--json']);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(JSON.parse(result.stdout).availability, 'unavailable');
    assert.equal(readFileSync(sidecar, 'utf8'), '{oops');
  } finally {
    rmSync(vault, { recursive: true, force: true });
  }
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
