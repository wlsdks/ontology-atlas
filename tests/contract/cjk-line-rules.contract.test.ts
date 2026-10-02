import { describe, expect, it } from 'vitest';
import { readGlobalCss } from '../../scripts/lib/global-css.mjs';

const CSS = readGlobalCss();
const CJK_LOCALES = ['ja', 'zh'] as const;

function isOutsideLayers(css: string, index: number): boolean {
  const opens = new Set<number>();
  for (const m of css.matchAll(/@layer[^{;]*\{/g)) opens.add(m.index + m[0].length - 1);
  let depth = 0;
  let layerDepth = -1;
  for (let i = 0; i < index; i += 1) {
    if (css[i] === '{') {
      depth += 1;
      if (opens.has(i) && layerDepth < 0) layerDepth = depth;
    } else if (css[i] === '}') {
      if (depth === layerDepth) layerDepth = -1;
      depth -= 1;
    }
  }
  return layerDepth < 0;
}

function blockAt(selector: RegExp): { at: number; block: string } {
  const at = CSS.search(selector);
  return { at, block: at < 0 ? '' : CSS.slice(at, CSS.indexOf('}', at)) };
}

describe('Japanese and Chinese line rules', () => {
  const body = blockAt(/:root:lang\(ja\) body,\s*:root:lang\(zh\) body\s*\{/);
  const strict = blockAt(/:root:lang\(ja\) body\s*\{/);
  const neutraliser = blockAt(/:root:is\(:lang\(ja\), :lang\(zh\)\)\s+:is\([^)]*break-keep[^{]*\{/);

  it('breaks between any two characters of a script with no spaces', () => {
    expect(body.at, 'the ja/zh body rule is missing').toBeGreaterThan(-1);
    expect(body.block).toMatch(/word-break:\s*normal/);
    expect(body.block).toMatch(/overflow-wrap:\s*break-word/);
  });

  it('uses strict line breaking for Japanese', () => {
    expect(strict.block).toMatch(/line-break:\s*strict/);
  });

  it('sits outside every @layer so a utility cannot win it back', () => {
    for (const rule of [body, strict, neutraliser]) {
      expect(rule.at).toBeGreaterThan(-1);
      expect(isOutsideLayers(CSS, rule.at)).toBe(true);
    }
  });

  it('neutralises both per-element keep-all spellings under both locales', () => {
    expect(neutraliser.at, 'the break-keep neutraliser is missing').toBeGreaterThan(-1);
    expect(neutraliser.block).toMatch(/\.break-keep/);
    expect(neutraliser.block).toMatch(/word-break:keep-all/);
    expect(neutraliser.block).toMatch(/word-break:\s*normal/);
  });

  it('keeps keep-all out of every rule that is not Korean', () => {
    for (const rule of CSS.split('}')) {
      const open = rule.lastIndexOf('{');
      if (open < 0 || !/word-break:\s*keep-all/.test(rule.slice(open))) continue;
      expect(rule.slice(0, open), 'a keep-all declaration outside the Korean rule').toMatch(/:lang\(ko\)/);
    }
    for (const locale of CJK_LOCALES) {
      expect(CSS).not.toMatch(new RegExp(`:lang\\(${locale}\\)[^{]*\\{[^}]*keep-all`));
    }
  });

  it('puts the Latin-only Pretendard face ahead of the OS CJK faces', () => {
    for (const locale of CJK_LOCALES) {
      const { block } = blockAt(new RegExp(`:root:lang\\(${locale}\\)\\s*\\{`));
      for (const token of ['--font-sans', '--font-mono']) {
        const stack = new RegExp(`${token}:\\s*([^;]+);`).exec(block)?.[1] ?? '';
        expect(stack, `${locale} ${token}`).toContain('var(--font-pretendard-latin)');
        expect(stack.indexOf('--font-pretendard-latin')).toBeLessThan(stack.search(/system-ui|ui-monospace/));
      }
    }
  });
});

describe('Japanese and Chinese font stacks', () => {
  const faces = (locale: string, token: string): string[] => {
    const block = blockAt(new RegExp(`:root:lang\\(${locale}\\)\\s*\\{`)).block;
    const stack = new RegExp(`${token}:\\s*([^;]+);`).exec(block)?.[1] ?? '';
    return [...stack.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  };
  const PLATFORMS = {
    ja: { mac: /^Hiragino/, windows: /^(Yu Gothic|Meiryo)/, linux: /^Noto Sans (CJK )?JP$/ },
    zh: { mac: /^(PingFang SC|Hiragino Sans GB)$/, windows: /^Microsoft YaHei/, linux: /^(Noto Sans (CJK )?SC|Source Han Sans SC|WenQuanYi)/ },
  } as const;
  const OWN = { ja: /^(Hiragino (Sans|Kaku)|Yu Gothic|Meiryo|Noto Sans (CJK )?JP)/, zh: /^(PingFang|Hiragino Sans GB|Microsoft YaHei|Noto Sans (CJK )?SC|Source Han Sans SC|WenQuanYi)/ } as const;

  for (const locale of CJK_LOCALES) {
    for (const token of ['--font-sans', '--font-mono']) {
      it(`${locale} ${token} has a native face for macOS, Windows and Android or Linux`, () => {
        const list = faces(locale, token);
        expect(list.length, 'no quoted faces parsed').toBeGreaterThan(0);
        for (const [platform, re] of Object.entries(PLATFORMS[locale])) {
          expect(list.some((name) => re.test(name)), `${locale} ${token}: ${platform}`).toBe(true);
        }
      });
    }
  }

  it('never lets one locale reach the other locale face first (Han unification)', () => {
    for (const token of ['--font-sans', '--font-mono']) {
      const zh = faces('zh', token);
      const ja = faces('ja', token);
      expect(zh.some((name) => OWN.ja.test(name) && !OWN.zh.test(name)), `zh ${token} lists a ja-only face`).toBe(false);
      expect(ja.some((name) => OWN.zh.test(name) && !OWN.ja.test(name)), `ja ${token} lists a zh-only face`).toBe(false);
    }
  });
});
