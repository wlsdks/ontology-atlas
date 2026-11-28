/**
 * The summary-freshness rule exists twice: the script server's `stale-parent.mjs` and
 * `src/entities/docs-vault/lib/summary-freshness.ts`. The app runs the cases here and its outcome
 * and lag are compared with the verdicts recorded from the script server in
 * `tests/fixtures/summary-freshness-golden.json`, not with the object shape.
 */

import { describe, expect, it } from 'vitest';

import {
  summaryStalenessOf,
  createSummaryStalenessScan,
  type NodeRevision,
} from '../../../src/entities/docs-vault/lib/summary-freshness';
import { SUMMARY_FRESHNESS_BASE, SUMMARY_FRESHNESS_CASES } from '../../fixtures/summary-freshness-cases.mjs';
import golden from '../../fixtures/summary-freshness-golden.json';

const DAY = 86_400_000;
const BASE = Date.parse(SUMMARY_FRESHNESS_BASE);
const at = (days: number) => new Date(BASE + days * DAY).toISOString();

interface Case {
  name: string;
  kind: string;
  /** Oldest first, as history reads; both sides receive it newest-first. */
  timeline: Array<{ day: number; body: string; children: string[] }>;
}

const CASES = SUMMARY_FRESHNESS_CASES as Case[];

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

/** What the script server answered for the case; `null` is no verdict. */
function recordedVerdict(testCase: Case): { slug: string; behindByMs: number } | null {
  return (golden.verdicts as Record<string, { slug: string; behindByMs: number } | null>)[testCase.name];
}

describe('summary freshness: the app against the verdicts the script server recorded', () => {
  for (const testCase of CASES) {
    it(`agrees with the recording on: ${testCase.name}`, () => {
      const server = recordedVerdict(testCase);
      const client = summaryStalenessOf(clientRevisions(testCase));
      const scan = createSummaryStalenessScan(SLUG);
      for (const revision of clientRevisions(testCase)) {
        if (scan.push(revision)) break;
      }
      expect(scan.finish()).toEqual(client);

      expect(Boolean(client), `client verdict for "${testCase.name}"`).toBe(Boolean(server));
      if (server && client) {
        expect(client.behindByMs).toBe(server.behindByMs);
        expect(client.slug).toBe(server.slug);
      }
    });
  }

  it('records a verdict for every case', () => {
    expect(Object.keys(golden.verdicts).sort()).toEqual(CASES.map((testCase) => testCase.name).sort());
  });

  it('covers both outcomes, so parity cannot be satisfied by agreeing on nothing', () => {
    const verdicts = CASES.map((testCase) => Boolean(recordedVerdict(testCase)));
    expect(verdicts).toContain(true);
    expect(verdicts).toContain(false);
  });
});
