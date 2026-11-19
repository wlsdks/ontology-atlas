import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { authoredMarkdownLines } from './analyze/authored-markdown.mjs';
import { readCapabilityClaim, readRecordedSection, readReviewedEvidence } from './agent-brief/reviewed-evidence.mjs';

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
