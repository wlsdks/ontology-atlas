/**
 * Pins the two implementations of the summary-freshness rule to the same verdict.
 *
 * The rule exists twice on purpose. `mcp/src/stale-parent.mjs` answers it for agents
 * over MCP; `src/entities/docs-vault/lib/summary-freshness.ts` answers it for the
 * installed app, which cannot import the server because `src/` and `mcp/` are separate
 * packages and the web bundle ships without it. Two copies of a rule is drift waiting to
 * happen, so both run over the same cases here and must agree.
 *
 * What is compared is the **verdict and the lag**, not the object shape: the MCP side
 * returns rows carrying scores and prose for an agent, the client side returns the
 * minimum a popover row needs. Requiring identical shapes would pin presentation and
 * make the contract fire on harmless edits; requiring identical answers pins the rule.
 *
 * A case that changes one side's answer and not the other fails here rather than
 * shipping as "the app and the agent disagree about whether this domain is current".
 */

import { describe, expect, it } from 'vitest';

import { findStaleParentSummaries } from '../../mcp/src/stale-parent.mjs';
import {
  summaryStalenessOf,
  type NodeRevision,
} from '../../src/entities/docs-vault/lib/summary-freshness';

const DAY = 86_400_000;
const BASE = Date.parse('2026-08-01T00:00:00Z');
const at = (days: number) => new Date(BASE + days * DAY).toISOString();

interface Case {
  name: string;
  kind: string;
  /** Oldest first, as history reads; both sides receive it newest-first. */
  timeline: Array<{ day: number; body: string; children: string[] }>;
}

const CASES: Case[] = [
  {
    name: 'membership moved after the prose',
    kind: 'domain',
    timeline: [
      { day: 0, body: 'covers alpha', children: ['capabilities/alpha'] },
      { day: 10, body: 'covers alpha', children: ['capabilities/alpha', 'capabilities/beta'] },
    ],
  },
  {
    name: 'prose re-written after the membership moved',
    kind: 'domain',
    timeline: [
      { day: 0, body: 'covers alpha', children: ['capabilities/alpha'] },
      { day: 4, body: 'covers alpha', children: ['capabilities/alpha', 'capabilities/beta'] },
      { day: 6, body: 'covers alpha and beta', children: ['capabilities/alpha', 'capabilities/beta'] },
    ],
  },
  {
    name: 'one commit changed both, which is a re-judgement',
    kind: 'domain',
    timeline: [
      { day: 0, body: 'covers alpha', children: ['capabilities/alpha'] },
      { day: 7, body: 'covers alpha and beta', children: ['capabilities/alpha', 'capabilities/beta'] },
    ],
  },
  {
    name: 'a removal counts the same as an addition',
    kind: 'domain',
    timeline: [
      { day: 0, body: 'covers both', children: ['capabilities/alpha', 'capabilities/beta'] },
      { day: 5, body: 'covers both', children: ['capabilities/alpha'] },
    ],
  },
  {
    name: 'a reordered containment array is not a change',
    kind: 'domain',
    timeline: [
      { day: 0, body: 'text', children: ['capabilities/alpha', 'capabilities/beta'] },
      { day: 11, body: 'text', children: ['capabilities/beta', 'capabilities/alpha'] },
    ],
  },
  {
    name: 'a duplicate member is not a change',
    kind: 'domain',
    timeline: [
      { day: 0, body: 'text', children: ['capabilities/alpha'] },
      { day: 9, body: 'text', children: ['capabilities/alpha', 'capabilities/alpha'] },
    ],
  },
  {
    name: 'nothing moved at all',
    kind: 'domain',
    timeline: [
      { day: 0, body: 'text', children: ['capabilities/alpha'] },
      { day: 20, body: 'text', children: ['capabilities/alpha'] },
    ],
  },
  {
    name: 'a project is a summary kind too',
    kind: 'project',
    timeline: [
      { day: 0, body: 'holds one domain', children: ['domains/alpha'] },
      { day: 14, body: 'holds one domain', children: ['domains/alpha', 'domains/beta'] },
    ],
  },
  {
    name: 'an element is not a summary kind',
    kind: 'element',
    timeline: [
      { day: 0, body: 'text', children: ['capabilities/alpha'] },
      { day: 14, body: 'text', children: ['capabilities/alpha', 'capabilities/beta'] },
    ],
  },
  {
    name: 'a summary node holding nothing',
    kind: 'domain',
    timeline: [
      { day: 0, body: 'text', children: [] },
      { day: 14, body: 'other text', children: [] },
    ],
  },
  {
    name: 'a single revision cannot separate the clocks',
    kind: 'domain',
    timeline: [{ day: 0, body: 'text', children: ['capabilities/alpha'] }],
  },
];

const SLUG = 'domains/sample';

function renderMarkdown(kind: string, body: string, children: string[]): string {
  const list = children.length ? `\ncapabilities: [${children.join(', ')}]` : '';
  return `---\nslug: ${SLUG}\nkind: ${kind}${list}\n---\n${body}\n`;
}

/** Newest-first revisions in the shape the Tauri command returns. */
function clientRevisions(testCase: Case): NodeRevision[] {
  return [...testCase.timeline]
    .reverse()
    .map((step) => ({
      slug: SLUG,
      isoTime: at(step.day),
      content: renderMarkdown(testCase.kind, step.body, step.children),
    }));
}

/** Newest-first revisions in the shape the MCP module takes. */
function serverRevisions(testCase: Case) {
  return [...testCase.timeline]
    .reverse()
    .map((step) => ({ changedAt: at(step.day), body: step.body, children: step.children }));
}

function serverVerdict(testCase: Case) {
  const rows = findStaleParentSummaries({
    docs: [{ slug: SLUG, frontmatter: { kind: testCase.kind, capabilities: testCase.timeline.at(-1)!.children } }],
    revisionsOf: () => serverRevisions(testCase),
  }) as Array<{ slug: string; behindByMs?: number; reasonCode?: string }>;
  // `insufficient-history` is a "cannot tell", which the client expresses as no verdict.
  const row = rows.find((candidate) => !candidate.reasonCode);
  return row ?? null;
}

describe('summary freshness parity between the MCP server and the app', () => {
  for (const testCase of CASES) {
    it(`agrees on: ${testCase.name}`, () => {
      const server = serverVerdict(testCase);
      const client = summaryStalenessOf(clientRevisions(testCase));

      expect(Boolean(client), `client verdict for "${testCase.name}"`).toBe(Boolean(server));
      if (server && client) {
        expect(client.behindByMs).toBe(server.behindByMs);
        expect(client.slug).toBe(server.slug);
      }
    });
  }

  it('covers both outcomes, so parity cannot be satisfied by agreeing on nothing', () => {
    const verdicts = CASES.map((testCase) => Boolean(serverVerdict(testCase)));
    expect(verdicts).toContain(true);
    expect(verdicts).toContain(false);
  });
});
