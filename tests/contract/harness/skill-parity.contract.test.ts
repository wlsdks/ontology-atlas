import { describe, expect, it } from 'vitest';

import { analyzeAgentFiles as analyzeWeb } from '@/entities/agent-files';
import { buildSkillParityModel } from '@/views/docs-vault/lib/agent-files/skill-parity';
import { analyzeAgentFiles as analyzeCli } from '../../../cli/src/lib/agent-setup/agent-files.mjs';
import { CASES as FIXTURE_CASES } from '../../fixtures/agent-files-cases.mjs';

/**
 * Checks that the screen skill-copy folding states the same totals as the CLI, and that the model
 * is empty in the `not-applicable` case, since drawing it as 0 findings would claim a verification.
 */

interface FixtureCase {
  name: string;
  input: Parameters<typeof analyzeWeb>[0];
}

const CASES = FIXTURE_CASES as unknown as FixtureCase[];

describe('스킬 사본 — 화면의 접기가 CLI 집계와 같은 사실을 말한다', () => {
  it.each(CASES.map((c) => [c.name, c] as const))('%s', (_name, testCase) => {
    const web = analyzeWeb(testCase.input);
    // The CLI is a plain JS package with no type declarations, so its signature is inferred narrowly.
    const cli = (analyzeCli as unknown as typeof analyzeWeb)(testCase.input);

    // Premise: the two analyses produce the same facts (kept by the existing contract, re-confirmed here).
    expect(web.checks.skillCopy.status).toBe(cli.checks.skillCopy.status);

    const model = buildSkillParityModel(web);

    if (web.checks.skillCopy.status === 'not-applicable') {
      // With no skill tree there is nothing to show.
      expect(model.rows).toEqual([]);
      expect(model.disagreeing).toBe(0);
      return;
    }

    // The number of folded rows must equal every skill the CLI saw (shared + one-sided).
    const cliSkillCount =
      cli.checks.skillCopy.sharedSkills.length +
      cli.checks.skillCopy.claudeOnlySkills.length +
      cli.checks.skillCopy.agentsOnlySkills.length;
    expect(model.rows).toHaveLength(cliSkillCount);

    // If there is a mismatch the screen must say so too — the signs must agree.
    expect(model.disagreeing > 0).toBe(cli.checks.skillCopy.status === 'drift');

    // A skill present on only one side must always fold as one-sided.
    for (const name of [
      ...cli.checks.skillCopy.claudeOnlySkills,
      ...cli.checks.skillCopy.agentsOnlySkills,
    ]) {
      expect(model.rows.find((row) => row.name === name)?.verdict).toBe('one-sided');
    }
  });
});
