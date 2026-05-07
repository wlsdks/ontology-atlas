import { describe, expect, it } from 'vitest';
import { VALIDATE_CASES } from '../fixtures/validate-vault-cases.mjs';
import { validateVaultDocument as validateCli } from '../../cli/src/lib/validate.mjs';
import { KNOWN_CODES } from '../../cli/src/commands/validate.mjs';

/**
 * R+ — cycle 45: KNOWN_CODES (cli/src/commands/validate.mjs) ↔
 * validateVaultDocument 출력 (cli/src/lib/validate.mjs) drift 차단.
 *
 * cycle 44 에서 `--list-codes` 와 `--fail-on` 의 unknown code 검사가
 * KNOWN_CODES 정적 list 에 의존. validate.mjs (3-way contract) 가 새 code 를
 * 추가하거나 제거할 때 KNOWN_CODES 를 같이 갱신 안 하면:
 *   - `--list-codes` 가 신규 code 누락
 *   - `--fail-on=newcode` 가 silently \"no match\" (typo 가 아닌데 typo 처리)
 *   - severity 불일치 시 `--fail-on` 결정 흐름 어긋남
 *
 * 두 contract:
 * 1. KNOWN_CODES.map(c => c.code) 가 fixture 가 elicit 하는 모든 code 와 일치.
 * 2. 각 KNOWN_CODES 엔트리의 severity 가 실제 validator 출력의 severity 와 동일.
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
    const knownCodes = new Set(KNOWN_CODES.map((c) => c.code));
    // 양방향 — 추가/누락 모두 잡힘.
    expect([...knownCodes].sort()).toEqual([...fixtureCodes].sort());
  });

  it('KNOWN_CODES 에 중복 code 없음', () => {
    const codes = KNOWN_CODES.map((c) => c.code);
    const unique = new Set(codes);
    expect(codes.length).toBe(unique.size);
  });

  it('각 KNOWN_CODES.severity 가 validator 실제 출력 severity 와 일치', () => {
    // 각 code 별로 fixture 에서 그 code 를 elicit 하는 첫 case 를 찾고,
    // 실제 validator 를 돌려 severity 비교.
    for (const known of KNOWN_CODES) {
      const fixtureCase = VALIDATE_CASES.find((c) =>
        c.expectedCodes.includes(known.code),
      );
      if (!fixtureCase) {
        // contract 1 이 이미 잡았겠지만 방어적 — 그래도 명시 fail.
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
