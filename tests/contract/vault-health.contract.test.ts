import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { VAULT_HEALTH_CASES } from '../fixtures/vault-health-cases.mjs';
import { computeVaultHealth } from '@/entities/knowledge-graph/lib/vault-health';
import { compileOntology } from '../../mcp/src/ontology-compiler.mjs';
import { queryCompiledOntology } from '../../mcp/src/ontology-engine.mjs';

/**
 * C1 (codex-audit 2026-07-25) — vault-health contract. The app's
 * `/ontology/insights` health verdict (`src/entities/knowledge-graph/lib/
 * vault-health.ts`) must agree with the CLI/MCP `node $ATLAS/cli/src/index.mjs health`
 * (`query_ontology({operation:'health'})`) on the SAME vault. Previously the app
 * auto-healed containment in its derived graph and reported "100% 수리할 것
 * 없음" (100%, nothing to repair) while the CLI reported `needs_attention` — a trust
 * hole.
 *
 * This test feeds one fixture vault through BOTH implementations and asserts an
 * identical status + per-check {status,count}. Either side drifting fails here,
 * exactly like the parser/validator contract tests.
 */

interface McpCheck {
  id: string;
  status: string;
  count: number;
}

const CHECK_IDS = [
  'vault_present',
  'compile_issues',
  'unresolved_edges',
  'dependency_cycles',
  'relation_recommendations',
  'components',
] as const;

function mcpHealth(
  docs: {
    slug: string;
    frontmatter: Record<string, unknown>;
    diagnostics?: ReadonlyArray<{ code: string }>;
  }[],
) {
  const withMtime = docs.map((d, i) => ({ ...d, body: '', mtime: i + 1 }));
  const artifact = compileOntology(withMtime, { includeIndexes: true });
  const result = queryCompiledOntology(artifact, { operation: 'health' }) as {
    status: string;
    checks: McpCheck[];
  };
  return result;
}

function uidForSlug(slug: string): string {
  const hex = createHash('sha256').update(slug).digest('hex').slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = '8';
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`;
}

function withUids(docs: { slug: string; frontmatter: Record<string, unknown> }[]) {
  return docs.map((doc) => ({
    ...doc,
    frontmatter: { uid: uidForSlug(doc.slug), ...doc.frontmatter },
  }));
}

function checkMap(checks: { id: string; status: string; count: number }[]) {
  const map: Record<string, { status: string; count: number }> = {};
  for (const c of checks) {
    if ((CHECK_IDS as readonly string[]).includes(c.id)) {
      map[c.id] = { status: c.status, count: c.count };
    }
  }
  return map;
}

describe('vault-health contract — src lib mirrors the MCP engine health verdict', () => {
  for (const c of VAULT_HEALTH_CASES) {
    it(c.name, () => {
      const docs = withUids(c.docs);
      const mcp = mcpHealth(docs);
      const app = computeVaultHealth(docs);

      expect(app.status).toBe(mcp.status);
      expect(checkMap(app.checks)).toEqual(checkMap(mcp.checks));
    });
  }
});
