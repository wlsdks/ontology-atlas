import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { describe, expect, it } from 'vitest';

import { splitMarkdownBlocks } from './markdown-blocks';

const html = (texts: readonly string[]) =>
  renderToStaticMarkup(
    createElement(
      Fragment,
      null,
      ...texts.map((text, index) => createElement(ReactMarkdown, { key: index, remarkPlugins: [remarkGfm] }, text)),
    ),
  )
    .replace(/>\s+</g, '><')
    .trim();

const CASES: Record<string, string> = {
  'headings and paragraphs': '## Step 1\n\nFirst paragraph.\n\nSecond one, with `code`.\n\n### Detail\n\nText.\n',
  'a loose bullet list': '- one\n\n- two\n\n- three\n\nAfter the list.\n',
  'an ordered list that continues after blank lines': '1. one\n\n2. two\n\nPause.\n\n3. three\n\n4. four\n',
  'a nested list': '- outer\n\n  - inner\n\n  more inner\n\nOutside.\n',
  'a list then a paragraph': '- a\n- b\n\nParagraph.\n',
  'a fence with blank lines inside': 'Intro.\n\n```ts\nconst a = 1;\n\n\nconst b = 2;\n```\n\nAfter.\n',
  'an unclosed fence': 'Intro.\n\n```bash\npnpm atlas compile\n\nstill code\n',
  'a tilde fence holding backticks': 'Intro.\n\n~~~\n```\n\nnot a fence\n~~~\n\nAfter.\n',
  'a table between paragraphs': 'Before.\n\n| Page | Status |\n| --- | --- |\n| a | stale |\n\nAfter.\n',
  'a quote across a blank line': '> one\n>\n> two\n\n> three\n\nAfter.\n',
  'thematic breaks': 'One.\n\n---\n\nTwo.\n\n- - -\n\nThree.\n',
  'a setext heading': 'Intro.\n\nTitle\n=====\n\nBody.\n',
  'indented code': 'Intro.\n\n    code line\n\n    more code\n\nAfter.\n',
  'lines that only look like markers': '*Emphasis* opens this.\n\n+1 for that.\n\n2026 was the year.\n',
  'a task list': '- [ ] todo\n\n- [x] done\n\nAfter.\n',
  'a footnote': 'Claim.[^1]\n\nMore.\n\n[^1]: The source.\n',
  'a reference link': 'See [the spec][spec].\n\nMore.\n\n[spec]: https://example.com\n',
  'an HTML comment across a blank line': 'Intro.\n\n<!-- one\n\ntwo -->\n\nAfter.\n',
  'CRLF line endings around a fence with a blank line inside':
    'Intro.\r\n\r\n```ts\r\nconst a = 1;\r\n\r\nconst b = 2;\r\n```\r\n\r\nAfter.\r\n',
  'a fence opened on a list-marker line, then a bare fence later':
    '- ```\n  a\n  ```\n\nThen:\n\n```\nx = 1\n\ny = 2\n```\n\nAfter.\n',
  'a fence inside a list item whose code is not indented':
    '1. Install:\n   ```bash\npnpm install\n   ```\n\nText.\n\nMore text.\n',
  'a definition inside a quote, used earlier': 'See [the spec][spec].\n\nMore.\n\n> [spec]: https://example.com\n',
  'a definition inside a list item, used earlier': 'See [the spec][spec].\n\nMore.\n\n- [spec]: https://example.com\n',
  'an ideographic-space line between two lines': '첫 문단입니다.\n\u3000\n둘째 줄입니다.\n',
  'a closing fence followed by an ideographic space':
    'Intro.\n\n```\ncode\n```\u3000\n\nstill code?\n\n```\n\nAfter.\n',
  'a properly indented fence in a list, then more text':
    'Intro.\n\nSteps follow.\n\n1. Install:\n\n   ```bash\n   pnpm install\n\n   pnpm build\n   ```\n\n2. Run.\n\nDone.\n\nMore after.\n',
  'a footnote on the final line, no trailing newline':
    'The refund path is checkout.[^1]\n\nIt is the only path.\n\n[^1]: capabilities/checkout',
  'a reference definition on the final line, no trailing newline':
    'See [the spec][spec].\n\nMore.\n\n[spec]: https://example.com',
  'a definition with an escaped bracket in its label': 'See [a\\]b].\n\nMore.\n\n[a\\]b]: https://example.com\n',
};

const COLLAPSING = new Set([
  'a footnote',
  'a reference link',
  'an HTML comment across a blank line',
  'a definition inside a quote, used earlier',
  'a definition inside a list item, used earlier',
  'a footnote on the final line, no trailing newline',
  'a reference definition on the final line, no trailing newline',
  'a definition with an escaped bracket in its label',
]);

describe('splitMarkdownBlocks', () => {
  it.each(Object.entries(CASES))('renders %s the same apart as together', (_, text) => {
    const blocks = splitMarkdownBlocks(text);
    expect(blocks.join('')).toBe(text);
    expect(html(blocks)).toBe(html([text]));
  });

  it('splits an ordinary answer into several blocks', () => {
    expect(splitMarkdownBlocks(CASES['headings and paragraphs']).length).toBeGreaterThan(3);
  });

  it('keeps a text that can refer across blocks whole', () => {
    expect(splitMarkdownBlocks(CASES['a footnote'])).toEqual([CASES['a footnote']]);
    expect(splitMarkdownBlocks(CASES['a reference link'])).toEqual([CASES['a reference link']]);
  });

  it('never changes an earlier block as the text grows, except when a later line collapses it whole', () => {
    for (const [name, text] of Object.entries(CASES)) {
      const final = splitMarkdownBlocks(text);
      if (COLLAPSING.has(name)) {
        expect(final, name).toEqual([text]);
        continue;
      }
      for (let length = 0; length <= text.length; length += 1) {
        const blocks = splitMarkdownBlocks(text.slice(0, length));
        expect(blocks.slice(0, -1), `${name} at ${length}`).toEqual(final.slice(0, blocks.length - 1));
      }
    }
  });

  it('keeps splitting before a list with an embedded fence, and not after it', () => {
    const blocks = splitMarkdownBlocks(CASES['a properly indented fence in a list, then more text']);
    expect(blocks[0]).toBe('Intro.\n\n');
    expect(blocks).toHaveLength(2);
  });

  it('splits a CRLF text where the same LF text splits', () => {
    const crlf = CASES['CRLF line endings around a fence with a blank line inside'];
    const blocks = splitMarkdownBlocks(crlf);
    expect(blocks.length).toBeGreaterThan(1);
    expect(blocks.length).toBe(splitMarkdownBlocks(crlf.replaceAll('\r\n', '\n')).length);
  });

  it('decides nothing on a line that is still being written', () => {
    expect(splitMarkdownBlocks('One.\n\n- tw')).toEqual(['One.\n\n- tw']);
    expect(splitMarkdownBlocks('One.\n\nTwo')).toEqual(['One.\n\nTwo']);
    expect(splitMarkdownBlocks('One.\n\nTwo\n')).toEqual(['One.\n\n', 'Two\n']);
  });
});
