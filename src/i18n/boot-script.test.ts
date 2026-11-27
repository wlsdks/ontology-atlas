import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

import { buildBootScript } from './boot-script';
import { detectLocale } from './detect-locale';
import { htmlLangOf, LOCALE_META } from './locales';
import { routing } from './routing';

const STORAGE_KEY = 'ontology-atlas:locale';
const script = buildBootScript({
  htmlLang: Object.fromEntries(routing.locales.map((code) => [code, LOCALE_META[code].htmlLang])),
  defaultLocale: routing.defaultLocale,
  storageKey: STORAGE_KEY,
});

function run({ pathname = '/', stored = null, languages = [], isTauri = false }: {
  pathname?: string;
  stored?: string | null;
  languages?: string[];
  isTauri?: boolean;
}) {
  const attributes: Record<string, string> = {};
  const replaced: string[] = [];
  const documentElement = { lang: '', setAttribute: (name: string, value: string) => (attributes[name] = value) };
  vm.runInNewContext(script, {
    document: { documentElement },
    location: { pathname, replace: (to: string) => replaced.push(to) },
    localStorage: { getItem: (key: string) => (key === STORAGE_KEY ? stored : null) },
    navigator: { languages, language: languages[0] ?? '' },
    window: isTauri ? { isTauri: true } : {},
  });
  return { lang: documentElement.lang, attributes, replaced };
}

describe('boot script', () => {
  it('chooses the window language as detectLocale does when the path names none', () => {
    const cases: Array<{ stored: string | null; languages: string[] }> = [
      { stored: null, languages: [] },
      { stored: 'ko', languages: ['en-US'] },
      { stored: 'fr', languages: ['ja-JP', 'en'] },
      { stored: null, languages: ['zh-CN'] },
      { stored: null, languages: ['zh-TW', 'ko'] },
      { stored: null, languages: ['de', 'zh-Hans-CN'] },
    ];
    for (const { stored, languages } of cases) {
      expect(run({ stored, languages }).lang, JSON.stringify({ stored, languages })).toBe(
        htmlLangOf(detectLocale(languages, stored)),
      );
    }
  });

  it('lets the path win over the stored choice', () => {
    expect(run({ pathname: '/ja/library/', stored: 'ko' }).lang).toBe('ja');
    expect(run({ pathname: '/zh/', stored: 'ko' }).lang).toBe('zh-Hans');
  });

  it('marks the installed app and sends a plain browser at a language root to the download page', () => {
    expect(run({ pathname: '/ko/', isTauri: true })).toMatchObject({ attributes: { 'data-shell': 'desktop' }, replaced: [] });
    expect(run({ pathname: '/ko/' }).replaced).toEqual(['/ko/download/']);
    expect(run({ pathname: '/ko/topology/' }).replaced).toEqual([]);
  });
});
