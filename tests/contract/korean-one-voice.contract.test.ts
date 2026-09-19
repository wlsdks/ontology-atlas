import { describe, expect, it } from 'vitest';

import ko from '../../messages/ko.json';

/**
 * **The product speaks one Korean.**
 *
 * Owner, 2026-09-19, of the Korean catalogue: some of it reads like a bad translation. Measured, it
 * was speaking in two registers at once — 839 of 5,055 strings ended in the formal one and the rest
 * in the plain one — and the split ran **through** single surfaces rather than between them. The
 * permission card own title was plain while the review inside it was formal; one notice managed
 * both inside a single sentence; the Library alone carried 159 formal strings beside its plain ones.
 *
 * All 839 are now the plain register, which is what every first-contact surface already used: the
 * empty states, the status words, the first-run wait, the buttons.
 *
 * ⚠️ **This gate checks the register, not the grammar.** It can tell that a sentence stopped ending
 * formally; it cannot tell that the verb was conjugated correctly. The conversion was done with an
 * explicit table for all 97 irregular endings in the catalogue rather than a blind substitution,
 * and read back in sample — but if a wrong form ships, this gate will be green. That is the honest
 * boundary of what a machine can hold here.
 */
const STRINGS = collect(ko as unknown as Record<string, unknown>);

function collect(value: unknown, path = ''): Array<{ key: string; text: string }> {
  if (typeof value === 'string') return [{ key: path, text: value }];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, child]) => collect(child, path ? `${path}.${key}` : key));
}

/**
 * The formal register's sentence endings.
 *
 * ⚠️ It matches the formal terminator broadly on purpose. An earlier pass looked only for the three
 * most common spellings and reported 605 when the real count was 839 — the 97 forms it could not
 * see were ordinary verbs (the everyday words for "becomes", "is not", "writes", "makes"). A narrow
 * matcher here does not make the catalogue cleaner; it makes the gate blind in exactly the places
 * nobody thinks to look.
 */
const FORMAL = /[가-힣]니다|하십시오/;

describe('the Korean catalogue speaks one register', () => {
  it('has subjects — an empty catalogue would make every check below vacuous', () => {
    expect(STRINGS.length).toBeGreaterThan(4000);
  });

  it('uses the plain register everywhere, so one surface never speaks in two voices', () => {
    const formal = STRINGS.filter(({ text }) => FORMAL.test(text)).map(({ key }) => key);
    expect(
      formal,
      `이 문장들만 격식체로 남아 한 화면이 두 가지 말투를 씁니다:\n${formal.slice(0, 40).join('\n')}`,
    ).toEqual([]);
  });

  /**
   * English wearing Hangul, each with a plain Korean word that surface already uses.
   *
   * ⚠️ **Scoped to the conversation panel, and the scoping is the finding.** Written catalogue-wide
   * first, this block reddened on twenty-four strings that are not the same defect at all. The
   * Library counts work in "agent turns" — a named unit it prints fifteen times and tallies, as in
   * "1 agent turn" and "no agent turn". The native Git errors use the transliteration of "snapshot"
   * because that is what a commit is called there. Two download captions use the transliteration of
   * "capture" for a screenshot. Those are deliberate vocabulary on surfaces this change did not
   * measure, and widening a panel-local judgement over them would be this gate overruling a product
   * decision it never looked at.
   *
   * Widen it one namespace at a time, with the same rule: measure that surface first.
   */
  const PANEL = STRINGS.filter(({ key }) => key.startsWith('acpChat.'));
  const BORROWED: ReadonlyArray<{ borrowed: string; word: RegExp; say: string }> = [
    { borrowed: '캡처', word: /캡처/, say: '적어 둔' },
    { borrowed: '스냅샷', word: /스냅샷/, say: '기록' },
    /*
     * Only the left boundary is anchored. A Korean noun takes particles glued to its end, so
     * requiring a non-Hangul after it would miss every real use; requiring one before it keeps
     * ordinary words ending in the same syllable — "pattern", "button" — out of the gate.
     */
    { borrowed: '턴', word: /(^|[^가-힣])턴/, say: '차례' },
  ];

  it('the panel has subjects of its own', () => {
    expect(PANEL.length).toBeGreaterThan(200);
  });

  for (const { borrowed, word, say } of BORROWED) {
    it(`the conversation panel says 「${say}」 rather than 「${borrowed}」`, () => {
      const hits = PANEL.filter(({ text }) => word.test(text)).map(({ key }) => key);
      expect(hits, `한국어로 옮기지 않은 낱말이 남아 있습니다:\n${hits.join('\n')}`).toEqual([]);
    });
  }

  it('probe: plants both violations and confirms ordinary Korean is not one', () => {
    const planted = collect({ a: { b: '확인할 수 없습니다.' }, c: '이번 턴에서', d: '됩니다' });
    expect(planted.filter(({ text }) => FORMAL.test(text)).map(({ key }) => key)).toEqual(['a.b', 'd']);
    expect(planted.filter(({ text }) => BORROWED[2].word.test(text)).map(({ key }) => key)).toEqual(['c']);
    expect(collect({ e: '버튼과 패턴' }).filter(({ text }) => BORROWED[2].word.test(text))).toEqual([]);
  });
});
