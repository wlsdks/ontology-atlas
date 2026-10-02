import { describe, expect, it } from 'vitest';

import { listLocales } from '../../scripts/build-messages.mjs';
import { checkEntry, checkLocale } from '../../scripts/check-translation-coverage.mjs';

const locales = listLocales().filter((locale) => locale !== 'en');
const INJECTED = ['ko', 'ja', 'zh'];

const argumentErrors = (locale: string, text: string, reference: string) =>
  checkEntry({ locale, key: 'probe.sentence', text, reference }).errors.filter((error) => error.rule === 'arguments');

describe('message arguments', () => {
  it('probe: the catalog has locales to compare and strings to check', () => {
    expect(locales).toContain('ko');
    expect(checkLocale('ko').checked).toBeGreaterThan(2000);
  });

  it.each(locales)('%s keeps every argument and tag of en', (locale) => {
    const offenders = checkLocale(locale).errors.filter((error) => error.rule === 'arguments');
    expect(offenders.map((error) => `${error.key}: ${error.message}`)).toEqual([]);
  });

  it.each(INJECTED)('%s: a dropped argument is caught', (locale) => {
    expect(argumentErrors(locale, 'files', 'Delete {count} files')).toHaveLength(1);
  });

  it.each(INJECTED)('%s: an argument en does not have is caught', (locale) => {
    expect(argumentErrors(locale, '{count} {other}', 'Delete {count}')).toHaveLength(1);
  });

  it.each(INJECTED)('%s: a selector-only argument may be dropped', (locale) => {
    expect(argumentErrors(locale, '{n}', '{count, plural, one {# file} other {# files}} in {n}')).toEqual([]);
  });

  it.each(INJECTED)('%s: tags must match as a multiset', (locale) => {
    expect(argumentErrors(locale, '<b>a</b><b>b</b>', '<b>a</b>')).toHaveLength(1);
    expect(argumentErrors(locale, '<b>a</b>', '<b>a</b>')).toEqual([]);
  });

  it('only ko may add the particle helpers', () => {
    expect(argumentErrors('ko', '{name}{josa}', '{name}')).toEqual([]);
    expect(argumentErrors('ja', '{name}{josa}', '{name}')).toHaveLength(1);
    expect(argumentErrors('zh', '{name}{josa}', '{name}')).toHaveLength(1);
  });
});
