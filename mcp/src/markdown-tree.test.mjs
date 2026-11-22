import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { authoredMarkdownLines } from './analyze/candidates/authored-markdown.mjs';
import { readCapabilityClaim, readRecordedSection, readReviewedEvidence } from './agent-brief/reviewed-evidence.mjs';
import { markdownTree } from './markdown-tree.mjs';

const evidencePage = (lineEnding) =>
  ['Intro line', 'second <b>bold</b> line', '', '## Evidence', '', '- `src/a.ts` entry <i>point</i>', '  continues', '', '## Includes', '', 'Reads files.', ''].join(lineEnding);

const evidenceLines = [
  'Intro line',
  'second    bold     line',
  '',
  '## Evidence',
  '',
  '`src/a.ts` entry    point    ',
  '  continues',
  '',
  '## Includes',
  '',
  'Reads files.',
  '',
];

// Each row is what the survey and the agent brief read from one page. Offsets
// that land on the wrong line, or HTML left in place, change these strings.
const CASES = [
  {
    name: 'CRLF line endings',
    text: evidencePage('\r\n'),
    lines: evidenceLines,
    section: '- `src/a.ts` entry <i>point</i>\r\n  continues',
    paths: ['src/a.ts'],
  },
  {
    name: 'lone CR line endings',
    text: evidencePage('\r'),
    lines: evidenceLines,
    section: '- `src/a.ts` entry <i>point</i>\r  continues',
    paths: ['src/a.ts'],
  },
  {
    name: 'a byte order mark',
    text: '﻿# Title <b>x</b>\n\nPara <i>y</i> end\n',
    lines: ['# Title x', '', 'Para    y     end', ''],
    excerpt: 'Para y end',
  },
  {
    name: 'NUL in a heading below a fence',
    text: '```\nfence\n```\n## Usage\u0000 <b>x</b>\n',
    lines: ['', '', '', '## Usage\u0000 x', ''],
  },
  {
    name: 'HTML on the second line of a paragraph',
    text: 'one\ntwo <b>three</b> four\n',
    lines: ['one', 'two    three     four', ''],
    excerpt: 'one\ntwo three four',
  },
  {
    name: 'a tag across lines in a list item',
    text: '- item <span\n  class="a">kept</span> tail\n',
    lines: ['item      ', '            kept        tail', ''],
  },
  {
    name: 'every inline HTML form',
    text: 'a <!-- c --> b <?p q?> c <![CDATA[ d ]]> e <!DOCTYPE f> g <x-y z="1"> h </x-y> i <!--> j <!---> k\n',
    lines: ['a            b         c                 e              g             h        i       j        k', ''],
    excerpt: 'a  b  c  e  g  h  i  j  k',
  },
  {
    name: 'an unterminated instruction before a comment',
    text: 'Text <? more <!-- SECRET --> end\n',
    lines: ['Text <? more                 end', ''],
    excerpt: 'Text <? more  end',
  },
  {
    name: 'a lazy line ending a quote longer than the first bound',
    text: '> a\n> b\n> c\n> d\nlazy tail\n',
    lines: ['', '', '', '', '', ''],
  },
  {
    name: 'a title read past the first bound of a quote',
    text: '> [a]: /url\n"t1\nt2\nt3\n> t4"\n',
    lines: ['', '', '', '', '', ''],
  },
  {
    name: 'HTML in a setext heading',
    text: 'Head <b>x</b>\n===\n',
    lines: ['# Head x', '', ''],
  },
];

describe('the Markdown tree places every span on its source line', () => {
  for (const { name, text, lines, excerpt = '', section = '', paths = [] } of CASES) {
    it(name, () => {
      assert.deepEqual(authoredMarkdownLines(text), lines);
      assert.equal(readCapabilityClaim(text).excerpt, excerpt);
      assert.equal(readRecordedSection(text, 'Evidence'), section);
      assert.deepEqual(readReviewedEvidence(text).paths, paths);
    });
  }
});

describe('a quote parses the same whatever bound its first parse tried', () => {
  const outline = (node) => ({ type: node.type, line: node.position?.start.line, children: node.children?.map(outline) });
  const types = (node) => [node.type, ...(node.children ?? []).flatMap(types)];

  it('keeps a quote longer than the first bound as one node holding its lazy line', () => {
    assert.deepEqual(markdownTree('> a\n> b\n> c\n> d\nlazy tail\n> # Heading\n').children.map(outline), [
      {
        type: 'blockquote',
        line: undefined,
        children: [
          { type: 'paragraph', line: 1, children: [{ type: 'text', line: undefined, children: undefined }] },
          { type: 'heading', line: 6, children: [{ type: 'text', line: undefined, children: undefined }] },
        ],
      },
    ]);
  });

  it('keeps a definition made inside a quote whose bounded parse is kept', () => {
    assert.ok(types(markdownTree('> q\n[a]\n > - [a]: u\n\n > </div>\n')).includes('link'));
  });

  it('drops a definition only a discarded bounded parse made', () => {
    assert.ok(!types(markdownTree('> - [\n> - t\n=\n> > [b]: /u "\n    1. t3"\n')).includes('link'));
  });
});
