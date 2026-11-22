import { describe, expect, it } from 'vitest';

import { analyzeAgentFiles as analyzeWeb } from '@/entities/agent-files';
import { buildSkillParityModel } from '@/views/docs-vault/lib/agent-files/skill-parity';
import { CASES as FIXTURE_CASES } from '../../fixtures/agent-files-cases.mjs';

/**
 * Checks that the screen skill-copy folding states the same totals as the analysis, and that the model
 * is empty in the `not-applicable` case, since drawing it as 0 findings would claim a verification.
 */

interface FixtureCase {
  name: string;
  input: Parameters<typeof analyzeWeb>[0];
}

const CASES = FIXTURE_CASES as unknown as FixtureCase[];

describe('skill copy — the on-screen fold states the same fact as the analysis tally', () => {
  it.each(CASES.map((c) => [c.name, c] as const))('%s', (_name, testCase) => {
    const web = analyzeWeb(testCase.input);
    const skillCopy = web.checks.skillCopy;

    const model = buildSkillParityModel(web);

    if (web.checks.skillCopy.status === 'not-applicable') {
      // With no skill tree there is nothing to show.
      expect(model.rows).toEqual([]);
      expect(model.disagreeing).toBe(0);
      return;
    }

    // The number of folded rows must equal every skill the analysis saw (shared + one-sided).
    const skillCount =
      skillCopy.sharedSkills.length + skillCopy.claudeOnlySkills.length + skillCopy.agentsOnlySkills.length;
    expect(model.rows).toHaveLength(skillCount);

    // If there is a mismatch the screen must say so too — the signs must agree.
    expect(model.disagreeing > 0).toBe(skillCopy.status === 'drift');

    // A skill present on only one side must always fold as one-sided.
    for (const name of [
      ...skillCopy.claudeOnlySkills,
      ...skillCopy.agentsOnlySkills,
    ]) {
      expect(model.rows.find((row) => row.name === name)?.verdict).toBe('one-sided');
    }
  });
});
