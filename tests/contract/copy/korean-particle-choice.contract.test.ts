import { describe, expect, it } from 'vitest';

import ko from '../../../messages/ko.json';

/**
 * Parenthesised particle pairs ship to the reader because ICU cannot choose by the interpolated
 * value final sound; rephrase instead. Checks the Korean catalogue only.
 */
const AMBIGUOUS_PARTICLE = /(을\(를\)|를\(을\)|이\(가\)|가\(이\)|은\(는\)|는\(은\)|와\(과\)|과\(와\)|으로\(로\)|로\(으로\))/;

function* everyString(node: unknown, path: string[] = []): Generator<{ path: string; text: string }> {
  if (typeof node === 'string') {
    yield { path: path.join('.'), text: node };
    return;
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      yield* everyString(value, [...path, key]);
    }
  }
}

describe('한국어 문구는 조사를 괄호로 미루지 않는다', () => {
  it('어느 문구도 「을(를)」 같은 미정 조사를 읽는 사람에게 넘기지 않는다', () => {
    const offenders = [...everyString(ko)]
      .filter((entry) => AMBIGUOUS_PARTICLE.test(entry.text))
      .map((entry) => `${entry.path}: ${entry.text}`);
    expect(offenders, '조사를 고르지 못한 채 화면에 나가는 문구').toEqual([]);
  });

  it('검사기가 실제로 그 모양을 잡는다', () => {
    // A gate with no subjects prints a pass; this one is held to a planted example.
    expect(AMBIGUOUS_PARTICLE.test('{name}을(를) 지울까요?')).toBe(true);
    expect(AMBIGUOUS_PARTICLE.test('{name}에 썼습니다.')).toBe(false);
  });
});
