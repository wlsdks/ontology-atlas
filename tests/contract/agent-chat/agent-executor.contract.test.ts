// Blocks drift between the in-app agent's read executor and the MCP server's vault
// reads. The server is asked over stdio.
//
// Tool **names and arguments** are covered by
// `agent-tool-catalog.contract.test.ts`. What is covered here is **the answers**:
// asked the same question about the same vault, the in-screen agent and the
// terminal's MCP agent must receive the same facts. Both really read this
// repository's dogfood vault (`docs/ontology/`) — a real vault rather than a
// synthetic fixture, so subtle places like derived stubs and alias rules are
// genuinely compared.
//
// Changing one side breaks here: if MCP changes an alias rule the web derive must
// change with it (and vice versa), otherwise a person and an agent see different
// ontologies.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import manifest from '@/entities/docs-vault/data/manifest.json';
import content from '@/entities/docs-vault/data/content.json';
import type { VaultManifest } from '@/entities/docs-vault';
import { deriveOntologyFromVault } from '@/entities/docs-vault/lib/derive-ontology-from-vault';
import { derivationToInsight } from '@/features/vault-ontology/model/use-ontology-insight';
import {
  GRAPH_FRONTMATTER_KEYS,
  createToolExecutor,
} from '@/features/vault-agent/model/agent-tools/tool-executor';
import type { VaultReadPort } from '@/features/vault-agent/model/agent-tools/vault-read-port';
import type { NormalizedToolCall } from '@/features/vault-agent/model/providers/provider-adapter';

import { RELATION_KEY_CASES } from '../../fixtures/relation-keys-cases.mjs';
import { callServerTools } from '../server-session/call-server-tool';

const VAULT_DIR = join(__dirname, '../../../docs/ontology');

/**
 * The bundled dogfood manifest is built with `docs/` as its root, leaving an
 * `ontology/` segment in front of each slug. MCP reads with `docs/ontology/` as the
 * root, so that segment must be stripped for the names to match — the app uses
 * exactly this prefix rule
 * (`derivationToInsight({ agentSlugPrefix })`).
 */
const AGENT_SLUG_PREFIX = 'ontology/';

const bundled = manifest as unknown as VaultManifest;
const bodies = content as unknown as Record<string, string>;

const insight = derivationToInsight(deriveOntologyFromVault(bundled), undefined, {
  agentSlugPrefix: AGENT_SLUG_PREFIX,
});

function stripPrefix(slug: string): string {
  return slug.startsWith(AGENT_SLUG_PREFIX) ? slug.slice(AGENT_SLUG_PREFIX.length) : slug;
}

const port: VaultReadPort = {
  nodes: insight.nodes,
  edges: insight.edges,
  docs: bundled.docs
    .filter((doc) => typeof doc.frontmatter?.kind === 'string')
    .map((doc) => ({
      slug: stripPrefix(doc.slug),
      path: doc.path,
      title: doc.title,
      kind: String(doc.frontmatter.kind),
      domain:
        typeof doc.frontmatter.domain === 'string' ? doc.frontmatter.domain : undefined,
      frontmatter: doc.frontmatter,
      mtime: doc.mtime,
    })),
  async readDocText(slug: string) {
    return bodies[`${AGENT_SLUG_PREFIX}${slug}`] ?? bodies[slug] ?? null;
  },
};

const execute = createToolExecutor(port);

function call(name: string, args: unknown = {}): NormalizedToolCall {
  return { id: 'c', name, args, argsInvalid: false };
}

async function run<T>(name: string, args: unknown = {}): Promise<T> {
  const result = await execute(call(name, args));
  return JSON.parse(result.content.split('\n…(truncated')[0]) as T;
}

interface ServerNode {
  slug: string;
  kind: string;
  title?: string;
}
interface ServerBacklinks {
  matches: Array<{ slug: string; matchedKeys?: string[] }>;
}

// The server reads the vault folder directly, never through our manifest: one session answers the
// census, every node and each node's backlinks.
const [serverList] = await callServerTools(VAULT_DIR, [{ name: 'list_concepts', arguments: { limit: 500 } }]);
expect(serverList.isError, JSON.stringify(serverList.value)).toBe(false);
const serverCensus = (serverList.value as {
  census: { total: number; byKind: Record<string, number>; referencedOnlyTotal: number };
}).census;
const serverNodes = (serverList.value as { nodes: ServerNode[] }).nodes;
const serverBacklinks = new Map<string, ServerBacklinks['matches']>();
{
  const answers = await callServerTools(
    VAULT_DIR,
    serverNodes.map((node) => ({ name: 'find_backlinks', arguments: { slug: node.slug } })),
  );
  serverNodes.forEach((node, index) => {
    expect(answers[index].isError, `${node.slug}: ${JSON.stringify(answers[index].value)}`).toBe(false);
    serverBacklinks.set(node.slug, (answers[index].value as ServerBacklinks).matches);
  });
}

describe('agent read executor ↔ MCP vault reads (the real dogfood vault)', () => {
  it('the count per kind and the number of "concepts only named" are wholly equal', async () => {
    // Even the field names match — the in-screen agent and the terminal agent must state
    // the inventory in the same words for a user to compare the two numbers.
    const ours = await run<typeof serverCensus & { conceptsIncludingReferenced: number }>('list_kinds');
    expect(ours).toEqual({
      ...serverCensus,
      conceptsIncludingReferenced: serverCensus.total + serverCensus.referencedOnlyTotal,
    });
  });

  it('the set of document slugs per kind is the same', async () => {
    // Fetching everything at once hits the round-trip character limit and truncates
    // rows — that is the contract, not a defect (it protects the user's cost). So the
    // comparison narrows by kind and follows bounded pages, the same way real usage does.
    const kinds = [...new Set(serverNodes.map((doc) => doc.kind))];
    for (const kind of kinds) {
      const expected = serverNodes
        .filter((doc) => doc.kind === kind)
        .map((doc) => doc.slug)
        .sort();
      const actual: string[] = [];
      let offset = 0;
      let pages = 0;
      do {
        const ours = await run<{
          rows: Array<{ slug: string }>;
          truncated?: boolean;
          pagination: { hasMore: boolean; nextOffset: number | null };
        }>('list_concepts', { kind, limit: 40, offset });
        expect(ours.truncated ?? false, `${kind} page ${pages + 1} exceeded the agent result cap`).toBe(false);
        actual.push(...ours.rows.map((row) => row.slug));
        pages += 1;
        if (!ours.pagination.hasMore) break;
        expect(ours.pagination.nextOffset, `${kind} says it has another page without a cursor`).toBeGreaterThan(offset);
        offset = ours.pagination.nextOffset!;
      } while (pages < 20);
      expect(pages, `${kind} pagination did not terminate`).toBeLessThan(20);
      expect(actual.sort()).toEqual(expected);
    }
  });

  it('asking about the same node answers the same kind', async () => {
    // The first few only — a sample suffices for the contract, and an exhaustive run is merely slow.
    for (const doc of serverNodes.slice(0, 12)) {
      const ours = await run<{ kind: string; hasDocument: boolean }>('get_concept', {
        slug: doc.slug,
      });
      expect(ours.hasDocument).toBe(true);
      expect(ours.kind).toBe(doc.kind);
    }
  });

  it('the set of backlink targets is the same', async () => {
    // The contract means something only on a node that really has backlinks.
    const withBacklinks = serverNodes
      .map((doc) => ({ slug: doc.slug, backlinks: serverBacklinks.get(doc.slug) ?? [] }))
      .filter((row) => row.backlinks.length > 0)
      .slice(0, 8);
    expect(withBacklinks.length).toBeGreaterThan(0);

    for (const row of withBacklinks) {
      const ours = await run<{ backlinks: Array<{ slug: string; matchedKeys: string[] }> }>(
        'find_backlinks',
        { slug: row.slug },
      );
      // Compares what is linked through frontmatter keys — MCP also counts body mentions
      // (which are evidence rather than relations), but the relation sets must match
      // exactly.
      const expected = row.backlinks
        .filter((entry) => (entry.matchedKeys?.length ?? 0) > 0)
        .map((entry) => entry.slug)
        .sort();
      expect(ours.backlinks.map((entry) => entry.slug).sort()).toEqual(expected);
    }
  });

  it('title search finds the same documents', async () => {
    const sample = serverNodes.find((doc) => typeof doc.title === 'string' && doc.title.trim());
    expect(sample).toBeTruthy();
    const ours = await run<{ rows: Array<{ slug: string }> }>('list_concepts', {
      mentions: sample?.title as string,
    });
    expect(ours.rows.some((row) => row.slug === sample?.slug)).toBe(true);
  });

  it('the vault body goes out wrapped as untrusted data', async () => {
    const documented = serverNodes.find((doc) => doc.slug !== 'README') as { slug: string };
    const result = await execute(call('get_concept', { slug: documented.slug }));
    expect(result.content).toContain('<untrusted_vault_content>');
  });

  it('the list of frontmatter keys where relations are written equals the shared relation-key table', () => {
    // Backlinks are counted from this key list, not from map edges. Growing one side
    // creates relations the in-screen agent cannot see.
    expect([...GRAPH_FRONTMATTER_KEYS].sort()).toEqual(
      [...RELATION_KEY_CASES.map((relation: { key: string }) => relation.key), 'domain'].sort(),
    );
  });

  it('the bundled manifest does not diverge from the real vault (the premise of the contract)', () => {
    // Without this test the comparisons above can pass silently while comparing a stale
    // manifest against the real vault. `docs-vault:check` keeps the committed manifest
    // current; this holds that premise once more.
    const readme = readFileSync(join(VAULT_DIR, 'README.md'), 'utf-8');
    expect(readme.length).toBeGreaterThan(0);
    expect(port.docs.length).toBe(serverNodes.length);
  });
});
