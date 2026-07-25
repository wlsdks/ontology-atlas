import { describe, expect, it } from 'vitest';
import { VAULT_HEALTH_CASES } from '../fixtures/vault-health-cases.mjs';
import { computeVaultHealth } from '@/entities/knowledge-graph/lib/vault-health';
import { compileOntology } from '../../mcp/src/ontology-compiler.mjs';
import { queryCompiledOntology } from '../../mcp/src/ontology-engine.mjs';

/**
 * C1 (codex-audit 2026-07-25) — vault-health contract. The app's
 * `/ontology/insights` health verdict (`src/entities/knowledge-graph/lib/
 * vault-health.ts`) must agree with the CLI/MCP `ontology-atlas health`
 * (`query_ontology({operation:'health'})`) on the SAME vault. Previously the app
 * auto-healed containment in its derived graph and reported "100% 수리할 것
 * 없음" while the CLI reported `needs_attention` — a trust hole.
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
  'compile_issues',
  'unresolved_edges',
  'dependency_cycles',
  'relation_recommendations',
  'components',
] as const;

function mcpHealth(docs: { slug: string; frontmatter: Record<string, unknown> }[]) {
  const withMtime = docs.map((d, i) => ({ ...d, body: '', mtime: i + 1 }));
  const artifact = compileOntology(withMtime, { includeIndexes: true });
  const result = queryCompiledOntology(artifact, { operation: 'health' }) as {
    status: string;
    checks: McpCheck[];
  };
  return result;
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
      const mcp = mcpHealth(c.docs);
      const app = computeVaultHealth(c.docs);

      expect(app.status).toBe(mcp.status);
      expect(checkMap(app.checks)).toEqual(checkMap(mcp.checks));
    });
  }
});
