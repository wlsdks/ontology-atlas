import { describe, expect, it } from 'vitest';

import {
  anchorResolves,
  classifySourceFormat,
  decodeSourceText,
  measureSourceText,
  numberParagraphs,
  sourcePathProblem,
  SOURCE_TEXT_CHAR_CAP,
  stripHtml,
} from './source-text';

function bytesOf(text: string): ArrayBuffer {
  const encoded = new TextEncoder().encode(text);
  return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer;
}

describe('classifySourceFormat — three answers, never two', () => {
  it.each(['md', 'txt', 'csv', 'json', 'html', 'HTM', '.md'])('%s is readable here', (format) => {
    expect(classifySourceFormat(format)).toBe('readable');
  });

  it.each(['pdf', 'docx', 'pptx', 'xlsx', 'PDF'])(
    '%s is named and refused rather than guessed at',
    (format) => {
      expect(classifySourceFormat(format)).toBe('needs-a-parser');
    },
  );

  it('an unnamed binary is its own answer, not "needs a parser"', () => {
    // "install a coding agent and it opens this" is true of a PDF and false of a PNG.
    expect(classifySourceFormat('png')).toBe('unknown-format');
    expect(classifySourceFormat('')).toBe('unknown-format');
  });
});

describe('sourcePathProblem — the shape gate', () => {
  it('accepts a plain path under sources/', () => {
    expect(sourcePathProblem('sources/quarter-plan.md')).toBeNull();
    expect(sourcePathProblem('sources/2027/plan.md')).toBeNull();
  });

  it.each([
    ['', 'empty-path'],
    ['   ', 'empty-path'],
    ['/etc/passwd', 'absolute-path'],
    ['~/.ssh/id_rsa', 'absolute-path'],
    ['C:/Users/x/secret.txt', 'absolute-path'],
    ['sources\\..\\..\\.ssh\\id_rsa', 'backslash'],
    ['sources/../.env.local', 'relative-segment'],
    ['sources/./plan.md', 'relative-segment'],
    ['sources//plan.md', 'relative-segment'],
    ['../sources/plan.md', 'relative-segment'],
    ['docs/plan.md', 'outside-sources'],
    ['.ontology-atlas/llm-audit.jsonl', 'outside-sources'],
    ['sources', 'outside-sources'],
    ['sources/', 'not-a-file'],
  ])('refuses %s as %s', (path, problem) => {
    expect(sourcePathProblem(path)).toBe(problem);
  });

  it('refuses a NUL byte before anything else looks at the string', () => {
    expect(sourcePathProblem('sources/plan.md\u0000/../../etc/passwd')).toBe('control-character');
  });

  it('refuses a non-string', () => {
    expect(sourcePathProblem(undefined)).toBe('empty-path');
    expect(sourcePathProblem({ path: 'sources/x.md' })).toBe('empty-path');
  });
});

describe('decodeSourceText — the cap is stated, never silent', () => {
  it('returns short text whole and says it is whole', () => {
    const decoded = decodeSourceText(bytesOf('one\n\ntwo'), 'md');
    expect(decoded.text).toBe('one\n\ntwo');
    expect(decoded.truncated).toBe(false);
    expect(decoded.totalChars).toBe(8);
  });

  it('stops at the cap and reports both numbers', () => {
    const long = 'x'.repeat(SOURCE_TEXT_CHAR_CAP + 500);
    const decoded = decodeSourceText(bytesOf(long), 'txt');
    expect(decoded.text).toHaveLength(SOURCE_TEXT_CHAR_CAP);
    expect(decoded.totalChars).toBe(SOURCE_TEXT_CHAR_CAP + 500);
    expect(decoded.truncated).toBe(true);
  });

  it('spends an HTML file&apos;s budget on its prose, not its markup', () => {
    const html = `<html><head><style>${'a'.repeat(SOURCE_TEXT_CHAR_CAP)}</style></head><body><p>Real sentence.</p></body></html>`;
    const decoded = decodeSourceText(bytesOf(html), 'html');
    expect(decoded.text).toContain('Real sentence.');
    expect(decoded.truncated).toBe(false);
  });
});

describe('stripHtml', () => {
  it('drops script and style bodies whole rather than untagging them', () => {
    const out = stripHtml('<p>Kept.</p><script>alert("ignore me")</script><style>p{color:red}</style>');
    expect(out).toContain('Kept.');
    expect(out).not.toContain('alert');
    expect(out).not.toContain('color:red');
  });

  it('turns block ends into line breaks so paragraphs survive', () => {
    expect(stripHtml('<p>One.</p><p>Two.</p>')).toBe('One.\nTwo.');
  });

  it('decodes only the entities that change meaning', () => {
    expect(stripHtml('<p>a &amp; b &lt;c&gt;</p>')).toBe('a & b <c>');
  });
});

describe('measureSourceText and numberParagraphs — what a citation is checked against', () => {
  const text = '# Quarter plan\n\nFirst block.\n\nSecond block.\nStill second.';

  it('counts paragraphs, lines and headings', () => {
    const measure = measureSourceText(text);
    expect(measure.paragraphs).toBe(3);
    expect(measure.lines).toBe(6);
    expect(measure.headings).toEqual(['quarter-plan']);
  });

  it('prints the number in front of the paragraph it belongs to', () => {
    expect(numberParagraphs(text)).toBe(
      '[p1] # Quarter plan\n\n[p2] First block.\n\n[p3] Second block.\nStill second.',
    );
  });
});

describe('anchorResolves — the check `validateWikiPage` structurally cannot make', () => {
  const measure = measureSourceText('# Plan\n\nOne.\n\nTwo.');

  it('accepts a paragraph inside the count', () => {
    expect(anchorResolves('p1', measure)).toBe(true);
    expect(anchorResolves('p3', measure)).toBe(true);
  });

  it('refuses a paragraph past the end — the shape-valid citation that opens nothing', () => {
    expect(anchorResolves('p4', measure)).toBe(false);
    expect(anchorResolves('p47', measure)).toBe(false);
    expect(anchorResolves('p0', measure)).toBe(false);
  });

  it('accepts a line and a row inside the count', () => {
    expect(anchorResolves('l5', measure)).toBe(true);
    expect(anchorResolves('r5', measure)).toBe(true);
    expect(anchorResolves('l6', measure)).toBe(false);
  });

  it('accepts a heading that is really there', () => {
    expect(anchorResolves('h:plan', measure)).toBe(true);
    expect(anchorResolves('h:budget', measure)).toBe(false);
  });

  it('refuses a sheet anchor: no format this reader opens has sheets', () => {
    expect(anchorResolves('s1', measure)).toBe(false);
    expect(anchorResolves('s1r2', measure)).toBe(false);
  });
});
