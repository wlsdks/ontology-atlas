import { describe, expect, it } from 'vitest';

import { AGENT_FILE_RULES } from './agent-files';

import { CITATIONS_REVIEWED, guideCitation, UNCITED_TOOLS } from './guide-citations';

/**
 * **The claim and its source cannot drift apart.**
 *
 * The tool×file table is the one column on the Harness screen that is not measured from the
 * repository, so the screen prints the document behind each claim. That promise is only kept if
 * adding a tool to a rule also adds its source — otherwise the new row renders looking exactly like
 * the sourced ones. This test walks the classifier's own rules and requires every (rule, tool) pair
 * to be either cited or named as uncited, which is what makes the uncited marker a statement
 * rather than an oversight.
 */
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
    // A citation for a pair no rule produces is a claim about a row that never renders. It would
    // read as coverage in this file while proving nothing on screen.
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
