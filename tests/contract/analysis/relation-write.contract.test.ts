import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { applyFrontmatterUpdates } from '@/entities/docs-vault';
import type { MeaningEditRelation } from '@/entities/knowledge-graph';
import { buildOntologyRelationEditPlan } from '@/entities/knowledge-graph/lib/ontology-relation-edit';
import { parseFrontmatter } from '@/shared/lib/vault-document/parse-frontmatter';

import { runJsonRpcProcess } from '../../../scripts/lib/mcp-test-rpc.mjs';
import { RELATION_WRITE_CASES } from '../../fixtures/relation-write-cases.mjs';

interface CaseDoc {
  slug: string;
  kind: string;
  frontmatter: string[];
}

const UID = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;

function documentText(doc: CaseDoc, index: number): string {
  return ['---', `uid: ${UID(index)}`, `slug: ${doc.slug}`, `kind: ${doc.kind}`, ...doc.frontmatter, '---', '', `${doc.slug} says what it is.`, ''].join('\n');
}

interface RpcAnswer {
  id?: number;
  result?: { isError?: boolean; content?: { text?: string }[] };
}
const runServer = runJsonRpcProcess as unknown as (options: Record<string, unknown>) => Promise<{ responses: RpcAnswer[] }>;

async function writtenByMcp(vault: string, args: Record<string, unknown>): Promise<void> {
  const { responses } = await runServer({
    command: process.execPath,
    args: [join(process.cwd(), 'mcp', 'src', 'index.js')],
    timeoutMs: 30_000,
    env: { ...process.env, OATLAS_VAULT: vault, OATLAS_REPO_ROOT: vault },
    requests: [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'relation-write-contract', version: '1' } } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'add_relation', arguments: args } },
    ],
  });
  const answer = responses.find((response) => response.id === 2);
  expect(answer?.result?.isError ?? false, answer?.result?.content?.[0]?.text).toBe(false);
}

/**
 * Decision 15 of `docs/specs/2026-11-20-first-map-at-scale-and-by-hand.md`: a hand write produces
 * the frontmatter the MCP writer produces for the same relation.
 */
describe('a relation written by hand and by add_relation', () => {
  it.each(RELATION_WRITE_CASES)('$name leaves the same frontmatter', async (row) => {
    const vault = mkdtempSync(join(tmpdir(), 'atlas-relation-write-'));
    try {
      const docs: CaseDoc[] = [row.source, row.target, ...row.others];
      docs.forEach((doc, index) => {
        const file = join(vault, `${doc.slug}.md`);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, documentText(doc, index + 1));
      });
      const sourceFile = join(vault, `${row.source.slug}.md`);
      const before = readFileSync(sourceFile, 'utf8');

      const plan = buildOntologyRelationEditPlan({
        sourceSlug: row.source.slug,
        targetSlug: row.target.slug,
        targetKind: row.target.kind,
        fromRelation: null,
        toRelation: row.hand as MeaningEditRelation,
        why: row.why,
        frontmatter: parseFrontmatter(before).frontmatter,
      });
      const byHand = parseFrontmatter(applyFrontmatterUpdates(before, plan.updates)).frontmatter;

      await writtenByMcp(vault, {
        from: row.source.slug,
        to: row.target.slug,
        type: row.mcp,
        ...(row.why ? { why: row.why } : {}),
      });
      const byMcp = parseFrontmatter(readFileSync(sourceFile, 'utf8')).frontmatter;

      expect(Object.keys(byHand).sort()).toEqual(Object.keys(byMcp).sort());
      expect(byHand).toEqual(byMcp);
      expect(byHand, 'the write changed the document').not.toEqual(parseFrontmatter(before).frontmatter);
    } finally {
      rmSync(vault, { recursive: true, force: true });
    }
  });
});
