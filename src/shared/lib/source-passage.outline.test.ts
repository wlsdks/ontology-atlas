import { describe, expect, it } from 'vitest';

import { SOURCE_PASSAGE_CASES } from '../../../tests/fixtures/source-passage-cases.mjs';

import {
  READ_SOURCE_DEFAULT_LIMIT,
  readSourceUnits,
  sourceOutline,
  sourceUnits,
} from './source-passage';

/**
 * **What slice U2 added to the reader, and the one thing it may never do.**
 *
 * `sourceOutline` and `sourceUnits` are the two exports the Library's outline section and
 * its source-text search stand on. The failure that would matter is not an empty outline —
 * it is an outline that **states a structure the reader did not find**, because a count or
 * a heading list on that pane reads as a fact about the person's own document. A PDF
 * reporting "0 parts" and a Markdown file reporting headings it never had are the same
 * defect: a number a person would believe.
 *
 * The fixture bytes are the parity table's own, so these assertions and
 * `tests/contract/source-passage-parity.contract.test.ts` describe the same files.
 */

const caseBytes = (path: string) => {
  const found = SOURCE_PASSAGE_CASES.find((entry: { path: string }) => entry.path === path);
  if (!found) throw new Error(`no fixture case for ${path}`);
  return found.bytes as Uint8Array;
};

describe('sourceUnits — the unwindowed split a search needs', () => {
  it('returns every unit of a file longer than the windowed export would hand back', () => {
    const bytes = caseBytes('sources/log.txt');
    const windowed = readSourceUnits(bytes, 'sources/log.txt');
    const whole = sourceUnits(bytes, 'sources/log.txt');

    // The window is the reason this export exists: 260 lines, 200 returned.
    expect(windowed.units).toHaveLength(READ_SOURCE_DEFAULT_LIMIT);
    expect(windowed.truncated).toBe(true);
    expect(whole.units).toHaveLength(260);

    /*
     * The load-bearing case. A phrase past the window would be reported as "no match" by
     * a search built on `readSourceUnits` — a false negative wearing an answer's clothes.
     */
    const lastLine = 'line 260';
    expect(windowed.units.some((unit) => unit.text === lastLine)).toBe(false);
    expect(whole.units.some((unit) => unit.text === lastLine)).toBe(true);
  });

  it('carries the extractor\u2019s own note rather than inventing one', () => {
    const outcome = sourceUnits(caseBytes('sources/site-survey.pdf'), 'sources/site-survey.pdf');
    expect(outcome.units).toHaveLength(0);
    expect(outcome.note).toContain('PDF');
  });
});

describe('sourceOutline — the shape, and never a shape it did not read', () => {
  it('names each worksheet with its row count, in the workbook\u2019s own order', () => {
    const outline = sourceOutline(
      caseBytes('sources/dispute-metrics.xlsx'),
      'sources/dispute-metrics.xlsx',
    );
    expect(outline.format).toBe('xlsx');
    expect(outline.unreadable).toBe(false);
    // Sheet order, not alphabetical: "Quarterly" is sheet 1 and sorts after "Reason codes".
    expect(outline.sheets).toEqual([
      { sheet: 'Quarterly', rows: 3 },
      { sheet: 'Reason codes', rows: 2 },
    ]);
    expect(outline.headings).toEqual([]);
  });

  it('lists a DOCX\u2019s real headings with the anchors a citation could address', () => {
    const outline = sourceOutline(
      caseBytes('sources/dispute-handling-standard.docx'),
      'sources/dispute-handling-standard.docx',
    );
    expect(outline.format).toBe('docx');
    expect(outline.headings.length).toBeGreaterThan(0);
    for (const heading of outline.headings) {
      // Every listed heading is addressable. An outline entry no citation could name
      // would be a structure invented for the screen.
      expect(heading.anchor).toMatch(/^h:/);
      expect(heading.title).not.toBe('');
    }
  });

  it('opens Markdown headings through existing citation line anchors', () => {
    const bytes = caseBytes('sources/settlement-policy.md');
    const outline = sourceOutline(bytes, 'sources/settlement-policy.md');
    const units = sourceUnits(bytes, 'sources/settlement-policy.md').units;
    expect(outline.format).toBe('text');
    expect(outline.headings.map((heading) => heading.title)).toContain('Settlement cycle');
    for (const heading of outline.headings) {
      expect(units.find((unit) => unit.anchor === heading.anchor)?.text).toContain(heading.title);
      expect(heading.anchor).toMatch(/^l\d+$/);
    }
    expect(outline.unitCount).toBe(5);
  });

  it('does not expose frontmatter, fenced examples, or indented code as headings', () => {
    const text = ['---', '# metadata', '---', '# Policy', '', '```md', '## example', '```',
      '    # code', '', '## Settlement cycle ##', '', 'Cards settle T+2.', '', 'Holdback', '--------'].join('\n');
    const outline = sourceOutline(new TextEncoder().encode(text), 'sources/policy.md');
    expect(outline.headings).toEqual([
      { anchor: 'l4', title: 'Policy' },
      { anchor: 'l11', title: 'Settlement cycle' },
      { anchor: 'l15', title: 'Holdback' },
    ]);
    expect(sourceOutline(new TextEncoder().encode(text), 'sources/policy.txt').headings).toEqual([]);
  });

  it('counts records in a CSV, including the one whose quotes span two physical lines', () => {
    const outline = sourceOutline(caseBytes('sources/fee-schedule.csv'), 'sources/fee-schedule.csv');
    expect(outline.format).toBe('csv');
    // Three records from four physical lines — the record is the unit, not the line.
    expect(outline.unitCount).toBe(3);
    expect(outline.unreadable).toBe(false);
  });

  it('reports a PDF as unreadable rather than as a document of zero parts', () => {
    const outline = sourceOutline(caseBytes('sources/site-survey.pdf'), 'sources/site-survey.pdf');
    expect(outline.unreadable).toBe(true);
    expect(outline.unitCount).toBe(0);
    expect(outline.headings).toEqual([]);
    expect(outline.sheets).toEqual([]);
    expect(outline.note).toContain('PDF');
  });

  it('reports a format with no reader the same way, with the extractor\u2019s reason', () => {
    const outline = sourceOutline(caseBytes('sources/photo.heic'), 'sources/photo.heic');
    expect(outline.format).toBe('binary');
    expect(outline.unreadable).toBe(true);
    expect(outline.note).toContain('heic');
  });
});
