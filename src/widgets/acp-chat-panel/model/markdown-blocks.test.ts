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
};

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

  it('never changes an earlier block as the text grows', () => {
    const text = Object.values(CASES).slice(0, 15).join('\n');
    const final = splitMarkdownBlocks(text);
    for (let length = 0; length <= text.length; length += 7) {
      const blocks = splitMarkdownBlocks(text.slice(0, length));
      expect(blocks.slice(0, -1)).toEqual(final.slice(0, blocks.length - 1));
    }
  });

  it('decides nothing on a line that is still being written', () => {
    expect(splitMarkdownBlocks('One.\n\n- tw')).toEqual(['One.\n\n- tw']);
    expect(splitMarkdownBlocks('One.\n\nTwo')).toEqual(['One.\n\nTwo']);
    expect(splitMarkdownBlocks('One.\n\nTwo\n')).toEqual(['One.\n\n', 'Two\n']);
  });
});
