import { strict as assert } from 'node:assert';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import {
  getSavedConstellation,
  listSavedConstellations,
  loadLibraryCollections,
  parseLibraryCollections,
} from './constellations.mjs';
import { loadVaultDocs } from './vault.mjs';
import { runJsonRpcProcess } from '../../scripts/lib/mcp-test-rpc.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(
  __dirname,
  '../../tests/contract/fixtures/library-collections/constellations-v1.json',
);
const FIXTURE_RAW = readFileSync(FIXTURE_PATH, 'utf8');
const SERVER_ENTRY = resolve(__dirname, 'index.js');

function callTool(id, name, args = {}) {
  return {
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name, arguments: args },
  };
}

async function rpc(vaultRoot, requests) {
  return runJsonRpcProcess({
    command: process.execPath,
    args: [SERVER_ENTRY],
    env: { ...process.env, OATLAS_VAULT: vaultRoot },
    requests: [
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'constellation-test', version: '1' },
        },
      },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      ...requests,
    ],
    timeoutMs: 5_000,
  });
}

function writeNode(vault, slug, frontmatter, body) {
  const path = join(vault, `${slug}.md`);
  mkdirSync(dirname(path), { recursive: true });
  const yaml = Object.entries(frontmatter).flatMap(([key, value]) => {
    if (Array.isArray(value)) {
      return value.length === 0
        ? [`${key}: []`]
        : [`${key}:`, ...value.map((entry) => `  - ${entry}`)];
    }
    return [`${key}: ${value}`];
  });
  writeFileSync(path, `---\n${yaml.join('\n')}\n---\n\n${body}\n`, 'utf8');
}

function makeVault() {
  const vault = mkdtempSync(join(tmpdir(), 'ontology-atlas-constellations-'));
  const sidecar = join(vault, '.ontology-atlas');
  mkdirSync(sidecar);
  writeFileSync(join(sidecar, 'library-collections.json'), FIXTURE_RAW, 'utf8');
  writeNode(vault, 'capabilities/current-member', {
    uid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    kind: 'capability',
    title: 'Current member',
    domain: 'domains/review',
    path: 'mcp/src/index.js',
    depends_on: ['capabilities/merged-member', 'elements/outside-dependency'],
    relates: ['capabilities/unresolved-ref'],
    relation_notes: '{ capabilities/merged-member: "Real internal reason", elements/outside-dependency: "Real outside reason" }',
  }, 'Current member evidence explains the task boundary.');
  writeNode(vault, 'domains/review', {
    uid: 'f3333333-3333-4333-8333-333333333333',
    kind: 'domain',
    title: 'Review',
    capabilities: ['capabilities/current-member', 'capabilities/merged-member'],
  }, 'The review responsibility boundary.');
  writeNode(vault, 'capabilities/merged-member', {
    uid: '12121212-1212-4212-8212-121212121212',
    merged_uids: ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'],
    kind: 'capability',
    title: 'Merged member',
    domain: 'domains/review',
  }, 'The current node retains the old identity as merge history.');
  writeNode(vault, 'capabilities/path-now-reused', {
    uid: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    kind: 'capability',
    title: 'Different node at the old path',
    domain: 'domains/review',
  }, 'Path reuse must not retarget the deleted member.');
  writeNode(vault, 'capabilities/ambiguous-one', {
    uid: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    kind: 'capability',
    title: 'Ambiguous one',
    domain: 'domains/review',
  }, 'One claim.');
  writeNode(vault, 'capabilities/ambiguous-two', {
    uid: 'f1111111-1111-4111-8111-111111111111',
    merged_uids: ['eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'],
    kind: 'capability',
    title: 'Ambiguous two',
    domain: 'domains/review',
  }, 'A conflicting merged claim.');
  writeNode(vault, 'elements/outside-dependency', {
    uid: 'f2222222-2222-4222-8222-222222222222',
    kind: 'element',
    title: 'Outside dependency',
    domain: 'domains/review',
    depends_on: ['capabilities/current-member'],
  }, 'A direct dependency outside the saved set.');
  return vault;
}

describe('saved constellation reads', () => {
  it('keeps the MCP parser byte-contract aligned with the v1 fixture', () => {
    const parsed = parseLibraryCollections(FIXTURE_RAW);
    assert.equal(parsed.status, 'ready');
    assert.equal(parsed.value.folders.length, 4);
    assert.equal(parsed.value.items.length, 7);
    assert.equal(parseLibraryCollections(null).status, 'missing');
    assert.equal(parseLibraryCollections('{oops').status, 'corrupt');
    assert.equal(
      parseLibraryCollections('{"schema":"ontology-atlas/library-collections/v2"}').status,
      'unsupported',
    );
  });

  it('lists only root constellation metadata and preserves unknown purpose', () => {
    const vault = makeVault();
    try {
      const result = listSavedConstellations({ vaultRoot: vault, limit: 1 });
      assert.equal(result.availability, 'ready');
      assert.equal(result.total, 2);
      assert.equal(result.returned, 1);
      assert.equal(result.limited, true);
      assert.equal(result.pagination.nextOffset, 1);
      assert.equal(result.constellations[0].name, 'Ontology write review');
      assert.deepEqual(result.constellations[0].purpose, {
        status: 'recorded',
        value: 'Reopen the exact write-review scope with current evidence.',
      });
      const second = listSavedConstellations({ vaultRoot: vault, offset: 1, limit: 1 });
      assert.deepEqual(second.constellations[0].purpose, { status: 'unknown' });
    } finally {
      rmSync(vault, { recursive: true, force: true });
    }
  });

  it('separates saved membership from current facts, real edges, unresolved identities, and outside dependencies', () => {
    const vault = makeVault();
    try {
      const docs = loadVaultDocs(vault);
      const result = getSavedConstellation({
        vaultRoot: vault,
        id: '33333333-3333-4333-8333-333333333333',
        docs,
        limit: 100,
      });
      assert.equal(result.selection.memberCount, 5);
      assert.equal(result.selection.referenceMemberCount, 1);
      assert.equal(result.current.resolvedMemberTotal, 2);
      assert.equal(result.current.unresolvedMemberTotal, 2);
      assert.deepEqual(
        result.current.resolvedMembers.map((row) => [row.requestedUid, row.uid, row.identityResolution]),
        [
          ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'current'],
          ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '12121212-1212-4212-8212-121212121212', 'merged'],
        ],
      );
      assert.deepEqual(
        result.current.unresolvedMembers.map((row) => [row.uid, row.reason]),
        [
          ['cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'missing'],
          ['eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'ambiguous'],
        ],
      );
      assert.equal(
        result.current.resolvedMembers.some((row) => row.uid === 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
        false,
        'a node reusing lastKnownPath is never substituted',
      );
      assert.deepEqual(
        result.relations.rows.map((edge) => [edge.from.slug, edge.to.slug, edge.type]),
        [['capabilities/current-member', 'capabilities/merged-member', 'dependencies']],
      );
      assert.equal(result.relations.rows[0].rationale, 'Real internal reason');
      assert.deepEqual(
        result.outsideScopeDependencies.rows.map((edge) => [edge.scopeDirection, edge.from.slug, edge.to.slug]),
        [
          ['incoming', 'elements/outside-dependency', 'capabilities/current-member'],
          ['outgoing', 'capabilities/current-member', 'elements/outside-dependency'],
        ],
      );
      assert.equal(result.coverage.transitiveImpactChecked, false);
      assert.equal(result.coverage.meaningAcceptanceInferred, false);
      assert.equal(result.coverage.completeImpactInferred, false);
      assert.equal(result.coverage.unresolvedGraphReferences, 1);

      const finalPage = getSavedConstellation({
        vaultRoot: vault,
        id: '33333333-3333-4333-8333-333333333333',
        docs,
        offset: 4,
        limit: 1,
      });
      assert.equal(finalPage.selection.pagination.hasMore, false);
      assert.equal(finalPage.coverage.memberFacts, 'paged_current_facts');
    } finally {
      rmSync(vault, { recursive: true, force: true });
    }
  });

  it('reports corrupt, unsupported, and escaped sidecars as unavailable without replacing bytes', () => {
    const vault = makeVault();
    const path = join(vault, '.ontology-atlas/library-collections.json');
    try {
      writeFileSync(path, '{oops', 'utf8');
      assert.equal(listSavedConstellations({ vaultRoot: vault }).availability, 'unavailable');
      assert.equal(readFileSync(path, 'utf8'), '{oops');

      writeFileSync(path, '{"schema":"ontology-atlas/library-collections/v2"}', 'utf8');
      assert.equal(loadLibraryCollections(vault).source.status, 'unsupported');

      rmSync(join(vault, '.ontology-atlas'), { recursive: true, force: true });
      const outside = mkdtempSync(join(tmpdir(), 'ontology-atlas-constellations-outside-'));
      mkdirSync(join(outside, '.ontology-atlas'));
      writeFileSync(join(outside, '.ontology-atlas/library-collections.json'), FIXTURE_RAW, 'utf8');
      symlinkSync(join(outside, '.ontology-atlas'), join(vault, '.ontology-atlas'), 'dir');
      assert.equal(loadLibraryCollections(vault).source.availability, 'unavailable');
      rmSync(outside, { recursive: true, force: true });
    } finally {
      rmSync(vault, { recursive: true, force: true });
    }
  });

  it('serves both tools through the public JSON-RPC registry in read-only mode', async () => {
    const vault = makeVault();
    try {
      const { responses } = await rpc(vault, [
        { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
        callTool(3, 'list_constellations', { limit: 1 }),
        callTool(4, 'get_constellation', {
          id: '33333333-3333-4333-8333-333333333333',
          limit: 2,
          relationLimit: 1,
          dependencyLimit: 1,
        }),
      ]);
      const tools = responses.find((response) => response.id === 2)?.result?.tools ?? [];
      for (const name of ['list_constellations', 'get_constellation']) {
        const tool = tools.find((candidate) => candidate.name === name);
        assert.equal(tool?.annotations?.readOnlyHint, true);
        assert.equal(tool?.annotations?.openWorldHint, false);
      }
      const listed = responses.find((response) => response.id === 3)?.result?.structuredContent;
      assert.equal(listed.contract, 'savedConstellationList:v1');
      assert.equal(listed.pagination.hasMore, true);
      const context = responses.find((response) => response.id === 4)?.result?.structuredContent;
      assert.equal(context.contract, 'savedConstellationContext:v1');
      assert.equal(context.selection.pagination.hasMore, true);
      assert.equal(context.relations.limited, false);
      assert.equal(context.outsideScopeDependencies.limited, true);
    } finally {
      rmSync(vault, { recursive: true, force: true });
    }
  });
});
