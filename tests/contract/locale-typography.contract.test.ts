import { describe, expect, it } from 'vitest';

import { listLocales } from '../../scripts/build-messages.mjs';
import { checkEntry, checkLocale, TYPOGRAPHY_RULES } from '../../scripts/check-translation-coverage.mjs';

const NO_RULES = ['en', 'ko'];
const locales = listLocales();

const typographyErrors = (locale: string, text: string) =>
  checkEntry({ locale, key: 'probe.sentence', text }).errors.filter((error) => error.rule === 'typography');

describe('locale typography', () => {
  it('probe: every locale has a typography column or is named as having none', () => {
    expect(locales).toContain('en');
    for (const locale of locales) {
      expect([...NO_RULES, ...Object.keys(TYPOGRAPHY_RULES)], locale).toContain(locale);
    }
  });

  it.each(locales)('%s follows its typography rules', (locale) => {
    const offenders = checkLocale(locale).errors.filter((error) => error.rule === 'typography');
    expect(offenders.map((error) => `${error.key}: ${error.message}`)).toEqual([]);
  });

  it('ja: a space next to Latin text, a digit or an argument is caught', () => {
    expect(typographyErrors('ja', 'MCP 接続')).toHaveLength(1);
    expect(typographyErrors('ja', '接続 MCP')).toHaveLength(1);
    expect(typographyErrors('ja', '{count} 件')).toHaveLength(1);
    expect(typographyErrors('ja', '件 {count}')).toHaveLength(1);
    expect(typographyErrors('ja', 'MCP接続と{count}件')).toEqual([]);
  });

  it('ja: ASCII punctuation, em dash and double hyphen are caught', () => {
    expect(typographyErrors('ja', '接続,検索')).toHaveLength(1);
    expect(typographyErrors('ja', '接続.')).toHaveLength(1);
    expect(typographyErrors('ja', '接続—検索')).toHaveLength(1);
    expect(typographyErrors('ja', '接続--検索')).toHaveLength(1);
    expect(typographyErrors('ja', '接続、検索。')).toEqual([]);
  });

  it('zh: Han touching Latin text, a digit or an argument is caught', () => {
    expect(typographyErrors('zh', 'MCP连接')).toHaveLength(1);
    expect(typographyErrors('zh', '连接MCP')).toHaveLength(1);
    expect(typographyErrors('zh', '{count}个文件')).toHaveLength(1);
    expect(typographyErrors('zh', '使用 MCP 连接，共 {count} 个文件')).toEqual([]);
  });

  it('zh: ASCII punctuation and dashes are caught', () => {
    expect(typographyErrors('zh', '连接,搜索')).toHaveLength(1);
    expect(typographyErrors('zh', '连接—搜索')).toHaveLength(1);
    expect(typographyErrors('zh', '连接--搜索')).toHaveLength(1);
  });

  it('a plural branch is judged as the sentence it renders', () => {
    expect(typographyErrors('zh', '{n, plural, other {# 个文件}}')).toEqual([]);
    expect(typographyErrors('ja', '{n, plural, other {#件}}')).toEqual([]);
    expect(typographyErrors('zh', '共 {n, plural, other {#个文件}}')).toHaveLength(1);
  });

  it('code spans are exempt', () => {
    expect(typographyErrors('ja', '実行 `mcp serve` する')).toEqual([]);
    expect(typographyErrors('zh', '运行 `mcp serve`，然后')).toEqual([]);
  });
});
