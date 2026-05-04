import { describe, expect, it } from 'vitest';
import { VALIDATE_CASES } from '../fixtures/validate-vault-cases.mjs';
import { validateVaultDocument as validateTs } from '@/shared/lib/validate-vault-document';
import { validateVaultDocument as validateMcp } from '../../mcp/src/validate.mjs';
import { validateVaultDocument as validateCli } from '../../cli/src/lib/validate.mjs';

/**
 * R11 #27 — vault validator contract. src/shared/lib (런타임 + UI fast path
 * 의 raw 검증) 와 mcp/src/validate.mjs (AI agent surface) 가 같은 raw 입력에
 * 대해 같은 5 issue codes set 을 보장. 한 쪽이 코드 추가/변경/제거 시 contract
 * test 가 즉시 차단 — parser 3-way contract (#3) 와 같은 패턴.
 *
 * mcp 가 별도 npm package 라 물리적 단일 모듈 통합 불가능 → contract test 가
 * effective 단일화.
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
