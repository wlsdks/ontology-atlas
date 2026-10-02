import { describe, expect, it } from 'vitest';

import { listLocales } from '../../scripts/build-messages.mjs';
import { checkEntry, checkLocale } from '../../scripts/check-translation-coverage.mjs';

const locales = listLocales();

const pluralErrors = (locale: string, text: string) =>
  checkEntry({ locale, key: 'probe.sentence', text }).errors.filter((error) => error.rule === 'plural');

describe('message plural categories', () => {
  it('probe: the catalog has plurals to check', () => {
    expect(locales).toContain('en');
    expect(locales).toContain('ko');
    expect(checkLocale('en').checked).toBeGreaterThan(2000);
  });

  it.each(locales)('%s uses only branches its plural rules reach', (locale) => {
    const offenders = checkLocale(locale).errors.filter((error) => error.rule === 'plural');
    expect(offenders.map((error) => `${error.key}: ${error.message}`)).toEqual([]);
  });

  it.each(['ko', 'ja', 'zh'])('%s: a one branch is caught', (locale) => {
    expect(pluralErrors(locale, '{n, plural, one {# a} other {# b}}')).toHaveLength(1);
  });

  it.each(['ko', 'ja', 'zh'])('%s: other and exact branches are allowed', (locale) => {
    expect(pluralErrors(locale, '{n, plural, =0 {none} =1 {single} other {# b}}')).toEqual([]);
  });

  it.each(['en', 'ko', 'ja', 'zh'])('%s: a missing other branch is caught', (locale) => {
    expect(pluralErrors(locale, '{n, plural, =0 {none}}')).toHaveLength(1);
  });

  it('a locale with more categories keeps them', () => {
    expect(pluralErrors('en', '{n, plural, one {# a} other {# b}}')).toEqual([]);
    expect(pluralErrors('en', '{n, plural, few {# a} other {# b}}')).toHaveLength(1);
    expect(pluralErrors('ru', '{n, plural, one {# a} few {# b} many {# c} other {# d}}')).toEqual([]);
  });
});
