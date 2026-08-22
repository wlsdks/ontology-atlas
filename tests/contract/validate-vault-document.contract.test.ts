import { describe, expect, it } from 'vitest';
import { VALIDATE_CASES } from '../fixtures/validate-vault-cases.mjs';
import { validateVaultDocument as validateTs } from '@/shared/lib/validate-vault-document';
import { validateVaultDocument as validateMcp } from '../../mcp/src/validate.mjs';
import { validateVaultDocument as validateCli } from '../../cli/src/lib/validate.mjs';

/**
 * R11 #27 — vault validator contract. Guarantees that src/shared/lib (runtime plus
 * the UI fast path's raw validation) and mcp/src/validate.mjs (the AI agent surface)
 * produce the same issue-code set for the same raw input. Adding, changing, or
 * removing a code on either side is blocked immediately — the same pattern as the
 * 3-way parser contract (#3).
 *
 * mcp is a separate package, so merging them into one physical module is impossible;
 * this contract test is the effective unification.
 */

interface ValidatorReport {
  ok: boolean;
  issues: Array<{
    code: string;
    severity: 'error' | 'warning';
    message: string;
  }>;
}

const VALIDATORS: Record<string, (raw: string) => ValidatorReport> = {
  'src/shared/lib (TS)': validateTs,
  'mcp/src/validate.mjs': validateMcp as (raw: string) => ValidatorReport,
  'cli/src/lib/validate.mjs': validateCli as (raw: string) => ValidatorReport,
};

describe('validator contract — 3 implementations agree on issue codes', () => {
  for (const [validatorName, validate] of Object.entries(VALIDATORS)) {
    describe(validatorName, () => {
      for (const c of VALIDATE_CASES) {
        it(c.name, () => {
          const result = validate(c.input);
          expect(result.ok).toBe(c.expectedOk);
          const codes = result.issues.map((i) => i.code).sort();
          expect(codes).toEqual([...c.expectedCodes].sort());
        });
      }
    });
  }
});
