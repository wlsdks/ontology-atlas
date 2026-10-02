import { describe, expect, it } from 'vitest';

import { listLocales } from '../../scripts/build-messages.mjs';
import { checkEntry, checkLocale, SCRIPT_RULES } from '../../scripts/check-translation-coverage.mjs';

const locales = listLocales();

const scriptErrors = (locale: string, text: string, key = 'probe.sentence') =>
  checkEntry({ locale, key, text }).errors.filter((error) => error.rule === 'script');

describe('catalog script purity', () => {
  it('probe: the catalog is read and every locale has a column', () => {
    expect(locales).toContain('en');
    expect(checkLocale('en').checked).toBeGreaterThan(2000);
    for (const locale of locales) expect(Object.keys(SCRIPT_RULES), locale).toContain(locale);
  });

  it.each(locales)('%s has no foreign script', (locale) => {
    const offenders = checkLocale(locale).errors.filter((error) => error.rule === 'script');
    expect(offenders.map((error) => `${error.key}: ${error.message}`)).toEqual([]);
  });

  it('en: Hangul, Han and kana are caught', () => {
    expect(scriptErrors('en', 'Open 열기')).toHaveLength(1);
    expect(scriptErrors('en', 'Open 開')).toHaveLength(1);
    expect(scriptErrors('en', 'Open ひらく')).toHaveLength(1);
  });

  it('ko: kana and Han are caught', () => {
    expect(scriptErrors('ko', '열기 ひらく')).toHaveLength(1);
    expect(scriptErrors('ko', '열기 開')).toHaveLength(1);
    expect(scriptErrors('ko', '열기')).toEqual([]);
  });

  it('ja: Hangul and Simplified-only characters are caught, shared kanji are not', () => {
    expect(scriptErrors('ja', '開く 열기')).toHaveLength(1);
    expect(scriptErrors('ja', '这个')).toHaveLength(1);
    expect(scriptErrors('ja', '接続と検索')).toEqual([]);
  });

  it('zh: Hangul, kana, the prolonged sound mark and Japanese-only characters are caught', () => {
    expect(scriptErrors('zh', '打开 열기')).toHaveLength(1);
    expect(scriptErrors('zh', '打开 ひらく')).toHaveLength(1);
    expect(scriptErrors('zh', '文件ー')).toHaveLength(1);
    expect(scriptErrors('zh', '接続')).toHaveLength(1);
    expect(scriptErrors('zh', '连接和搜索')).toEqual([]);
  });

  it('language names under locale. are exempt', () => {
    expect(scriptErrors('en', '한국어', 'locale.korean')).toEqual([]);
    expect(scriptErrors('en', '한국어', 'settings.korean')).toHaveLength(1);
  });

  it('a locale with no script column fails', () => {
    expect(scriptErrors('fr', 'Ouvrir')).toHaveLength(1);
  });
});
