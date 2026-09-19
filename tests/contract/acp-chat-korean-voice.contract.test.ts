import { describe, expect, it } from 'vitest';

import ko from '../../messages/ko.json';

/**
 * **The conversation panel speaks in one voice, and uses words people say.**
 *
 * Owner, 2026-09-19, of the Korean catalogue: some of it reads like a bad translation. Measured,
 * the panel was speaking in two registers: 48 of its 285 Korean strings used the formal one and 61
 * the plain one, and the split ran **through** single surfaces rather than between them. The
 * permission card's own title was plain while the review inside it was formal, and one notice
 * managed both inside a single sentence.
 *
 * Alongside it sat words that are English wearing Hangul: the transliteration of "turn" for a
 * conversational turn, of "capture" for what the app wrote down, of "snapshot" for a saved record,
 * and a rendering of "generation" that in Korean means a human generation. One phrase read
 * "matches at file-time precision", which is not a sentence anybody says.
 *
 * ⚠️ **This gate claims only this panel.** The same drift runs through the rest of the catalogue —
 * 605 strings in fifteen namespaces, `library` heaviest at 159 — and converting those is a
 * product-wide copy decision, not a rider on a panel fix. Widen this gate namespace by namespace as
 * each one is actually converted; a gate that fails on work nobody has done yet is a gate people
 * learn to skip.
 */
const PANEL = ko.acpChat as unknown as Record<string, unknown>;

function strings(value: unknown, path = ''): Array<{ key: string; text: string }> {
  if (typeof value === 'string') return [{ key: path, text: value }];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, child]) => strings(child, path ? `${path}.${key}` : key));
}

const PANEL_STRINGS = strings(PANEL);

/** The formal register's sentence endings. This panel uses the plain one throughout. */
const FORMAL = /(습니다|합니다|입니다)/;

/**
 * English wearing Hangul, each with a plain Korean word this catalogue already uses.
 *
 * ⚠️ Only the **left** boundary is anchored. A Korean noun takes particles glued to its end, so
 * requiring a non-Hangul character after it would miss every real use. Requiring one *before* it is
 * what keeps ordinary Korean words that merely end in the same syllable out of the gate — the
 * everyday words for "pattern" and "button" both end in the syllable the first rule looks for.
 */
const BORROWED: ReadonlyArray<{ borrowed: string; word: RegExp; say: string }> = [
  { borrowed: '캡처', word: /캡처/, say: '적어 둔' },
  { borrowed: '스냅샷', word: /스냅샷/, say: '기록' },
  { borrowed: '세대', word: /(^|[^가-힣])세대/, say: '회차' },
  { borrowed: '턴', word: /(^|[^가-힣])턴/, say: '차례' },
  { borrowed: '정밀도', word: /정밀도/, say: '어디까지 맞는지를 말로' },
];

describe('the conversation panel speaks one Korean', () => {
  it('has subjects — an empty namespace would make every check below vacuous', () => {
    expect(PANEL_STRINGS.length).toBeGreaterThan(200);
  });

  it('is 해요체 everywhere, so one surface never speaks in two voices', () => {
    const formal = PANEL_STRINGS.filter(({ text }) => FORMAL.test(text)).map(({ key }) => key);
    expect(
      formal,
      `이 문장들만 합니다체로 남아 한 화면이 두 가지 말투를 씁니다:\n${formal.join('\n')}`,
    ).toEqual([]);
  });

  for (const { borrowed, word, say } of BORROWED) {
    it(`says 「${say}」 rather than 「${borrowed}」`, () => {
      const hits = PANEL_STRINGS.filter(({ text }) => word.test(text)).map(({ key }) => key);
      expect(hits, `한국어로 옮기지 않은 낱말이 남아 있습니다:\n${hits.join('\n')}`).toEqual([]);
    });
  }

  it('probe: a planted violation is actually caught', () => {
    const planted = strings({ a: { b: '확인할 수 없습니다.' }, c: '이번 턴에서' });
    expect(planted.filter(({ text }) => FORMAL.test(text)).map(({ key }) => key)).toEqual(['a.b']);
    expect(planted.filter(({ text }) => BORROWED[3].word.test(text)).map(({ key }) => key)).toEqual(['c']);
    // Ordinary Korean ending in the same syllable ("button", "pattern") is not a violation.
    expect(strings({ d: '버튼과 패턴' }).filter(({ text }) => BORROWED[3].word.test(text))).toEqual([]);
  });
});
