import { describe, expect, it } from 'vitest';
import { VALIDATE_CASES } from '../../fixtures/validate-vault-cases.mjs';
import { validateVaultDocument as validateTs } from '@/shared/lib/vault-document/validate-vault-document';

/**
 * Vault validator contract. `tests/fixtures/validate-vault-cases.mjs` states, for each raw input,
 * the issue codes the validator gives. The app (runtime plus the UI fast path's raw validation)
 * runs it here. Adding,
 * changing, or removing a code on either side fails one of the two.
 */

interface ValidatorReport {
  ok: boolean;
  issues: Array<{
    code: string;
    severity: 'error' | 'warning';
    message: string;
  }>;
}

interface ValidatorOptions {
  slug?: string;
}

type Validator = (raw: string, options?: ValidatorOptions) => ValidatorReport;

const validate: Validator = validateTs;

describe('validator contract — the app gives the issue codes the table states', () => {
  for (const c of VALIDATE_CASES) {
    it(c.name, () => {
      const result = validate(c.input, c.options);
      expect(result.ok).toBe(c.expectedOk);
      const codes = result.issues.map((i) => i.code).sort();
      expect(codes).toEqual([...c.expectedCodes].sort());
    });
  }
});
