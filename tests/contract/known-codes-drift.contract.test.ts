import { describe, expect, it } from 'vitest';
import { VALIDATE_CASES } from '../fixtures/validate-vault-cases.mjs';
import { validateVaultDocument as validateCli } from '../../cli/src/lib/validate.mjs';
import { KNOWN_CODES } from '../../cli/src/commands/validate.mjs';
import { VAULT_ISSUE_CODE_VALUES } from '../../mcp/src/validate.mjs';

/**
 * R+ — cycle 45: KNOWN_CODES (cli/src/commands/validate.mjs) ↔
 * Blocks drift in `validateVaultDocument`'s output (cli/src/lib/validate.mjs).
 *
 * The unknown-code checks behind `--list-codes` and `--fail-on` depend on the static
 * KNOWN_CODES list. If validate.mjs (the 3-way contract) adds or removes a code without
 * updating KNOWN_CODES:
 *   - `--list-codes` omits the new code
 *   - `--fail-on=newcode` silently reports "no match" (treating a real code as a typo)
 *   - a severity mismatch throws off `--fail-on`'s decision flow
 *
 * Three contracts:
 * 1. Document-scope KNOWN_CODES matches every code the fixtures elicit.
 * 2. Each document-scope KNOWN_CODES entry's severity equals the validator's actual
 *    output severity.
 * 3. The issue-code set is identical between the CLI's list-codes / fail-on and the MCP
 *    `validate_vault` outputSchema.
 */

interface ValidatorReport {
  ok: boolean;
  issues: Array<{
    code: string;
    severity: 'error' | 'warning';
    message: string;
  }>;
}

describe('KNOWN_CODES drift contract — list-codes / fail-on UX 진실원', () => {
  it('KNOWN_CODES 의 code set 이 fixture 가 elicit 하는 모든 code 와 동일', () => {
    const fixtureCodes = new Set<string>();
    for (const c of VALIDATE_CASES) {
      for (const code of c.expectedCodes) fixtureCodes.add(code);
    }
    const knownCodes = new Set(
      KNOWN_CODES.filter((c) => c.scope !== 'vault').map((c) => c.code),
    );
    // Both directions — additions and omissions are caught.
    expect([...knownCodes].sort()).toEqual([...fixtureCodes].sort());
  });

  it('KNOWN_CODES 에 중복 code 없음', () => {
    const codes = KNOWN_CODES.map((c) => c.code);
    const unique = new Set(codes);
    expect(codes.length).toBe(unique.size);
  });

  it('MCP validate_vault issue-code enum 이 CLI KNOWN_CODES 전체와 동일', () => {
    expect([...VAULT_ISSUE_CODE_VALUES].sort()).toEqual(
      KNOWN_CODES.map((c) => c.code).sort(),
    );
  });

  it('각 KNOWN_CODES.severity 가 validator 실제 출력 severity 와 일치', () => {
    // For each code, find the first fixture case eliciting it, run the real validator, and
    // compare severities.
    for (const known of KNOWN_CODES.filter((c) => c.scope !== 'vault')) {
      const fixtureCase = VALIDATE_CASES.find((c) =>
        c.expectedCodes.includes(known.code),
      );
      if (!fixtureCase) {
        // Contract 1 would already have caught this; fail explicitly anyway.
        throw new Error(
          `KNOWN_CODES has '${known.code}' but no fixture case elicits it`,
        );
      }
      const result = validateCli(fixtureCase.input) as ValidatorReport;
      const issue = result.issues.find((i) => i.code === known.code);
      expect(issue, `'${known.code}' issue not produced by validator`).toBeDefined();
      expect(issue!.severity).toBe(known.severity);
    }
  });

  it('각 KNOWN_CODES 엔트리에 description 이 비어있지 않은 string', () => {
    for (const c of KNOWN_CODES) {
      expect(typeof c.description).toBe('string');
      expect(c.description.length).toBeGreaterThan(10);
    }
  });
});
