import { describe, expect, it } from 'vitest';

import { analyzeAgentFiles as analyzeWeb } from '@/views/docs-vault/lib/agent-files';
import { buildSkillParityModel } from '@/views/docs-vault/lib/skill-parity';
import { analyzeAgentFiles as analyzeCli } from '../../cli/src/lib/agent-files.mjs';
import { CASES as FIXTURE_CASES } from '../fixtures/agent-files-cases.mjs';

/**
 * **Does the screen's skill-copy verdict state the same facts as the CLI?**
 *
 * `tests/contract/agent-files.contract.test.ts` keeps the two implementations
 * producing the same **per-file findings**. This file is the layer above: whether
 * the result the screen **folds per skill** for a human matches the CLI's totals.
 *
 * Why it is needed separately: the folding step exists only on the screen, outside
 * the existing contract's reach — yet the number a user reads is the folded one.
 * "The CLI says 3 but the screen says 2" means one of them is lying, and the one
 * that loses trust is **the screen**.
 *
 * For the same reason it locks that the model must be **empty** in the
 * `not-applicable` case (no skill tree) — drawing something that does not exist as
 * "0 findings, matching" would claim verification that never happened.
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
