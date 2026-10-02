import { describe, expect, it } from 'vitest';

import { listLocales } from '../../scripts/build-messages.mjs';
import { checkEntry, checkLocale } from '../../scripts/check-translation-coverage.mjs';
import { KEEP_TERMS, keepTermsIn } from '../../scripts/lib/keep-terms.mjs';

const locales = listLocales().filter((locale) => locale !== 'en');

const keepErrors = (locale: string, text: string, reference: string) =>
  checkEntry({ locale, key: 'probe.sentence', text, reference }).errors.filter((error) => error.rule === 'keep-terms');

describe('message keep-terms', () => {
  it('probe: the list is read and matches whole words', () => {
    expect(KEEP_TERMS).toContain('MCP');
    expect(keepTermsIn('Connect MCP to Git')).toEqual(['MCP', 'Git']);
    expect(keepTermsIn('Open GitHub')).toEqual(['GitHub']);
    expect(checkLocale('ko').checked).toBeGreaterThan(2000);
  });

  it.each(locales)('%s keeps every keep-term its en string has', (locale) => {
    const offenders = checkLocale(locale).errors.filter((error) => error.rule === 'keep-terms');
    expect(offenders.map((error) => `${error.key}: ${error.message}`)).toEqual([]);
  });

  it.each(['ko', 'ja', 'zh'])('%s: removing a keep-term is caught', (locale) => {
    expect(keepErrors(locale, '연결', 'Connect MCP')).toHaveLength(1);
    expect(keepErrors(locale, 'MCP 연결', 'Connect MCP')).toEqual([]);
  });

  it('Git inside GitHub does not count as Git', () => {
    expect(keepErrors('ja', 'GitHub', 'GitHub')).toEqual([]);
    expect(keepErrors('ja', '開く', 'Open GitHub')).toHaveLength(1);
  });

  it('only ko may write Markdown in its own script', () => {
    expect(keepErrors('ko', '마크다운', 'Markdown')).toEqual([]);
    expect(keepErrors('ja', 'マークダウン', 'Markdown')).toHaveLength(1);
    expect(keepErrors('zh', '标记文本', 'Markdown')).toHaveLength(1);
  });

  it('a keep-term in a code span is not required', () => {
    expect(keepErrors('ja', '`MCP`', 'Run `MCP`')).toEqual([]);
  });
});
