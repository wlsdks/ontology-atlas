import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VAULT_HEALTH_CASES } from '../../fixtures/vault-health-cases.mjs';
import {
  UNAVAILABLE_CHECKS,
  capabilitiesWithoutImplementationEvidence,
  computeVaultHealth,
} from '@/entities/knowledge-graph/lib/vault-health';
import { buildMarkdown } from '@/shared/lib/vault-document/frontmatter-codec.mjs';
import { callServerTool } from '../server-session/call-server-tool';

/**
 * Vault-health contract: the app health status (`src/entities/knowledge-graph/lib/vault-health.ts`)
 * must agree with the MCP server's `health` on the same vault. Each fixture is written to a
 * temporary folder, the server is asked over stdio, and status and per-check status and count are
 * compared.
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

/** Two lines no frontmatter reader can use; each one is a `malformed-frontmatter-line` diagnostic. */
const MALFORMED_LINES = ['this line is not a key', 'neither is this one'];

function writeVault(
  vault: string,
  docs: { slug: string; frontmatter: Record<string, unknown>; diagnostics?: ReadonlyArray<{ code: string }> }[],
) {
  for (const doc of docs) {
    const file = join(vault, `${doc.slug}.md`);
    mkdirSync(dirname(file), { recursive: true });
    let markdown = buildMarkdown({ frontmatter: doc.frontmatter, body: `${doc.slug}.` });
    if (doc.diagnostics?.length) {
      expect(doc.diagnostics.every((diagnostic) => diagnostic.code === 'malformed-frontmatter-line')).toBe(true);
      markdown = markdown.replace('\n---\n', `\n${MALFORMED_LINES.slice(0, doc.diagnostics.length).join('\n')}\n---\n`);
    }
    writeFileSync(file, markdown);
  }
}

async function serverHealth(
  docs: Parameters<typeof writeVault>[1],
): Promise<{ status: string; checks: McpCheck[] }> {
  const vault = mkdtempSync(join(tmpdir(), 'atlas-vault-health-'));
  try {
    writeVault(vault, docs);
    const answer = await callServerTool(vault, 'query_ontology', { operation: 'health' });
    expect(answer.isError, String(answer.value)).toBe(false);
    return answer.value as { status: string; checks: McpCheck[] };
  } finally {
    rmSync(vault, { recursive: true, force: true });
  }
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

describe('vault-health contract — src lib mirrors the MCP server health verdict', () => {
  for (const c of VAULT_HEALTH_CASES) {
    it(c.name, async () => {
      const docs = withUids(c.docs);
      const server = await serverHealth(docs);
      const app = computeVaultHealth(docs);

      expect(checkMap(app.checks)).toEqual(checkMap(server.checks));
      // The server's own status also counts the tool layer's checks (below), which can only add
      // attention: what the six shared checks flag, the server flags.
      if (app.status === 'needs_attention') expect(server.status).toBe('needs_attention');
    }, 30_000);
  }

  it('uses the maintenance-plan evidence boundary for capability suggestions', async () => {
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
    const vault = mkdtempSync(join(tmpdir(), 'atlas-vault-health-'));
    let maintenance: { actions: Array<{ node: { slug: string } }> };
    try {
      writeVault(vault, docs);
      const answer = await callServerTool(vault, 'query_ontology', {
        operation: 'maintenance_plan',
        kinds: ['capability_without_evidence'],
        limit: 20,
      });
      expect(answer.isError, String(answer.value)).toBe(false);
      maintenance = answer.value as typeof maintenance;
    } finally {
      rmSync(vault, { recursive: true, force: true });
    }

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
 * The browser checks plus its declared gaps must account for every check the command reports: the
 * server's tool layer adds frontmatter validation and a meaning assessment that can flip the
 * status. The extra ids are read from the server's own answer, not a second list.
 */
describe('vault health — checks not run are kept by name', () => {
  it('checks the browser runs + checks declared not run = checks the command reports', async () => {
    // A vault with a project, because the meaning assessment is asked of a project.
    const withProject = VAULT_HEALTH_CASES.find((c) => c.docs.some((doc) => doc.frontmatter.kind === 'project'))!;
    const server = await serverHealth(withUids(withProject.docs));
    const reported = server.checks.map((check) => check.id);
    const attachedByToolLayer = reported.filter((id) => !(CHECK_IDS as readonly string[]).includes(id));

    const declared = UNAVAILABLE_CHECKS.map((check) => check.id).sort();
    expect(declared).toEqual([...attachedByToolLayer].sort());
  }, 30_000);

  it('a check declared not run also says where it runs — it does not leave only the diagnosis', () => {
    for (const check of UNAVAILABLE_CHECKS) {
      expect(check.reason.trim().length, `${check.id} needs a reason`).toBeGreaterThan(0);
      expect(check.where.trim().length, `${check.id} needs somewhere to run it`).toBeGreaterThan(0);
      // A command carrying a placeholder nobody can fill in is not a remedy.
      expect(check.hint.trim().length, `${check.id} needs the placeholder hint`).toBeGreaterThan(0);
    }
  });
});
