import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VAULT_HEALTH_CASES } from '../fixtures/vault-health-cases.mjs';
import {
  UNAVAILABLE_CHECKS,
  capabilitiesWithoutImplementationEvidence,
  computeVaultHealth,
} from '@/entities/knowledge-graph/lib/vault-health';
import { compileOntology } from '../../mcp/src/ontology-compiler.mjs';
import { queryCompiledOntology } from '../../mcp/src/ontology-engine.mjs';

/**
 * Vault-health contract: the app health status (`src/entities/knowledge-graph/lib/vault-health.ts`)
 * must agree with the CLI/MCP `health` on the same vault. One fixture runs through both and compares
 * status and per-check status and count.
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

  it('uses the maintenance-plan evidence boundary for capability suggestions', () => {
    const docs = withUids([
      {
        slug: 'capabilities/no-pointer',
        frontmatter: { kind: 'capability', title: 'No pointer' },
      },
      {
        slug: 'capabilities/canonical-path',
        frontmatter: {
          kind: 'capability',
          title: 'Canonical path',
          path: 'src/canonical.ts',
        },
      },
      {
        slug: 'capabilities/resolved-element',
        frontmatter: {
          kind: 'capability',
          title: 'Resolved element',
          elements: ['elements/worker'],
        },
      },
      {
        slug: 'capabilities/raw-elements-path',
        frontmatter: {
          kind: 'capability',
          title: 'Raw elements path',
          elements: ['src/raw.ts'],
        },
      },
      {
        slug: 'capabilities/dangling-element',
        frontmatter: {
          kind: 'capability',
          title: 'Dangling element',
          elements: ['elements/missing'],
        },
      },
      {
        slug: 'elements/worker',
        frontmatter: { kind: 'element', title: 'Worker', path: 'src/worker.ts' },
      },
    ]);
    const artifact = compileOntology(
      docs.map((doc, index) => ({ ...doc, body: '', mtime: index + 1 })),
      { includeIndexes: true },
    );
    const maintenance = queryCompiledOntology(artifact, {
      operation: 'maintenance_plan',
      kinds: ['capability_without_evidence'],
      limit: 20,
    }) as { actions: Array<{ node: { slug: string } }> };

    expect(capabilitiesWithoutImplementationEvidence(docs)).toEqual(
      maintenance.actions.map((action) => action.node.slug),
    );
    expect(capabilitiesWithoutImplementationEvidence(docs)).toEqual([
      'capabilities/dangling-element',
      'capabilities/no-pointer',
      'capabilities/raw-elements-path',
    ]);
  });
});

/**
 * The browser checks plus its declared gaps must account for every check the command reports: the MCP
 * tool layer adds frontmatter validation and a meaning assessment that can flip the status. The extra
 * ids are read from the server source, not a second list.
 */
describe('vault health — 안 돌리는 검사는 이름으로 남는다', () => {
  it('브라우저가 도는 검사 + 안 돈다고 밝힌 검사 = 명령이 보고하는 검사', () => {
    // The tool layer is the `tools/` modules, so both files are read; this gate cannot go green on a file
    // that no longer carries the ids.
    const serverSource = ['maintenance.mjs', 'graph.mjs']
      .map((file) => readFileSync(join(process.cwd(), 'mcp', 'src', 'tools', file), 'utf8'))
      .join('\n');
    // The two the tool layer attaches on top of the engine's six.
    const attachedByToolLayer = ['vault_validation', 'meaning_assessment'].filter((id) =>
      serverSource.includes(`id: '${id}'`),
    );
    expect(
      attachedByToolLayer,
      'the server must still attach both checks for this gap to be the real one',
    ).toEqual(['vault_validation', 'meaning_assessment']);

    const declared = UNAVAILABLE_CHECKS.map((check) => check.id).sort();
    expect(declared).toEqual([...attachedByToolLayer].sort());
  });

  it('안 돈다고 밝힌 검사는 어디서 돌리는지도 말한다 — 진단만 남기지 않는다', () => {
    for (const check of UNAVAILABLE_CHECKS) {
      expect(check.reason.trim().length, `${check.id} needs a reason`).toBeGreaterThan(0);
      expect(check.where.trim().length, `${check.id} needs somewhere to run it`).toBeGreaterThan(0);
      // A command carrying a placeholder nobody can fill in is not a remedy.
      expect(check.hint.trim().length, `${check.id} needs the placeholder hint`).toBeGreaterThan(0);
    }
  });
});
