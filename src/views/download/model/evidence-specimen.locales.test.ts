import { describe, expect, it } from 'vitest';

import { localName } from '@/features/agent-activity/model/companion-catalog';
import { build } from '../../../../scripts/generate-evidence-specimen.mjs';

describe('locale-shaped data', () => {
  it('builds one entry per injected locale and counts every other display line as omitted', () => {
    const spec = build(['en', 'ja', 'ko', 'zh']);
    expect(Object.keys(spec.frontmatter)).toEqual(['ko', 'en', 'ja', 'zh']);
    for (const locale of ['ja', 'zh']) {
      const lines: string[] = spec.frontmatter[locale];
      expect(lines.some((line) => line.startsWith('title:'))).toBe(true);
      expect(lines.some((line) => /^display_(ko|en):/.test(line))).toBe(false);
      expect(lines.length + spec.omittedLines[locale]).toBe(spec.omittedLines.en + spec.frontmatter.en.length);
      expect((spec.facts.name as Record<string, string>)[locale]).toBeTruthy();
    }
  });

  it('keeps ko and en identical to the two-locale build', () => {
    const two = build(['en', 'ko']);
    const four = build(['en', 'ja', 'ko', 'zh']);
    expect(four.frontmatter.ko).toEqual(two.frontmatter.ko);
    expect(four.frontmatter.en).toEqual(two.frontmatter.en);
    expect(four.omittedLines.ko).toBe(two.omittedLines.ko);
  });

  it('falls back to the English name when a locale has none', () => {
    const name = { en: 'Dragon', ko: '용', ja: 'ドラゴン' };
    expect(localName(name, 'ja')).toBe('ドラゴン');
    expect(localName(name, 'zh')).toBe('Dragon');
    expect(localName(name, 'ko')).toBe('용');
  });
});
