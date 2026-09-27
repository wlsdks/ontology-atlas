import { describe, expect, it } from 'vitest';

import { AGENT_FILE_RULES } from './agent-files';

import { CITATIONS_REVIEWED, guideCitation, UNCITED_TOOLS } from './guide-citations';

/** Every (rule, tool) pair the classifier produces is cited or declared uncited. */
describe('every tool×file claim is either cited or declared uncited', () => {
  it('covers every pair the classifier resolves', () => {
    const uncovered: string[] = [];
    for (const rule of AGENT_FILE_RULES) {
      for (const tool of rule.tools) {
        if (UNCITED_TOOLS.includes(tool)) continue;
        if (guideCitation(rule.id, tool)) continue;
        uncovered.push(`${rule.id}:${tool}`);
      }
    }
    expect(uncovered).toEqual([]);
  });

  it('cites nothing the classifier does not actually claim', () => {
    // A citation for a pair no rule produces would read as coverage for a row that never renders.
    const claimed = new Set(
      AGENT_FILE_RULES.flatMap((rule) => rule.tools.map((tool) => `${rule.id}:${tool}`)),
    );
    const stale: string[] = [];
    for (const rule of AGENT_FILE_RULES) {
      for (const tool of rule.tools) {
        if (!claimed.has(`${rule.id}:${tool}`)) stale.push(`${rule.id}:${tool}`);
      }
    }
    expect(stale).toEqual([]);
  });

  it('every source is an absolute URL a reader can open', () => {
    for (const rule of AGENT_FILE_RULES) {
      for (const tool of rule.tools) {
        const citation = guideCitation(rule.id, tool);
        if (!citation) continue;
        expect(citation.source).toMatch(/^https:\/\/[^\s]+$/);
      }
    }
  });

  it('records the day the sources were last read, so the screen can print the row’s age', () => {
    expect(CITATIONS_REVIEWED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
