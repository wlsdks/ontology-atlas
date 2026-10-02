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
    for (const m of CSS.matchAll(/([^{}]+)\{([^{}]*word-break:\s*keep-all[^{}]*)\}/g)) {
      expect(m[1], 'a keep-all declaration outside the Korean rule').toMatch(/:lang\(ko\)/);
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
