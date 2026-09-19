import { describe, expect, it } from 'vitest';

import ko from '../../messages/ko.json';

/**
 * **A Korean sentence does not hand the reader a choice of particle.**
 *
 * ## What this forbids
 *
 * The parenthesised allomorph pairs listed in `AMBIGUOUS_PARTICLE` below are what a writer leaves
 * behind when a value will be interpolated and its final sound is not known at authoring time.
 * Korean picks the particle by whether the preceding syllable ends in a consonant, and ICU cannot
 * do that — so the parenthesis ships to the reader and the sentence stops being a sentence.
 *
 * Measured 2026-09-20: seventeen strings across the catalogue, including the one line that tells
 * a person a file was **written without asking** (`acpChat.notice.autoAllowed`). That is the
 * highest-stakes notice the chat panel has, and it put the pair straight after `{detail}`.
 *
 * ## Why this is a gate and not a lint rule
 *
 * The repair is not mechanical. There is no correct particle to substitute — the value's ending
 * is unknown — so each sentence is rephrased to a shape that needs no allomorph: a postposition
 * that has only one form, an apposition, or the name moved out of the clause behind a separator.
 * A rule that rewrote them automatically would produce Korean nobody wrote.
 *
 * ⚠️ **This checks the Korean catalogue only.** English has no allomorph and the same parenthesis
 * there would be ordinary prose.
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
