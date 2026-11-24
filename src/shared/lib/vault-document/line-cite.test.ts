import { describe, expect, it } from 'vitest';

import { citedLineRanges, citesReadLines } from './line-cite';

describe('citedLineRanges', () => {
  it('reads each range with its path, in the order written', () => {
    expect(citedLineRanges('Rounds per line (`src/billing/invoice.ts:L40-L52`), then src/billing/invoice.ts:L7.')).toEqual([
      { path: 'src/billing/invoice.ts', startLine: 40, endLine: 52 },
      { path: 'src/billing/invoice.ts', startLine: 7, endLine: 7 },
    ]);
  });

  it('keeps brackets that belong to the path and sheds a prose bracket around it', () => {
    expect(citedLineRanges('See (app/[locale]/(shop)/page.tsx:L2-L9).')).toEqual([
      { path: 'app/[locale]/(shop)/page.tsx', startLine: 2, endLine: 9 },
    ]);
  });

  it.each([
    ['a reversed range', 'src/a.ts:L9-L3', [{ path: 'src/a.ts', startLine: 3, endLine: 9 }]],
    ['an en dash and a bare end', './src/a.ts:L3–9', [{ path: 'src/a.ts', startLine: 3, endLine: 9 }]],
    ['a repeated range', 'src/a.ts:L3 and src/a.ts:L3', [{ path: 'src/a.ts', startLine: 3, endLine: 3 }]],
    ['line zero', 'src/a.ts:L0', []],
    ['a span past the bound', 'src/a.ts:L1-L401', []],
    ['prose with a colon', 'Note:L1 is not a path.', []],
  ])('handles %s', (_, body, expected) => {
    expect(citedLineRanges(body)).toEqual(expected);
  });
});

describe('citesReadLines', () => {
  it.each([
    'The invoice total rounds per line (`src/billing/invoice.ts:L40-L52`).',
    'Rule: src/billing/invoice.ts:L40 decides it.',
    'See (app/[locale]/(shop)/page.tsx:L2).',
    'Makefile.in:L7 sets the default.',
  ])('finds a line cite in %s', (body) => {
    expect(citesReadLines(body)).toBe(true);
  });

  it.each([
    '## Definition\n\nTurns a cart into an invoice.\n\n## Includes\n\n- src/billing/invoice.ts',
    'Read src/billing/invoice.ts lines 40 to 52.',
    'Note:L1 is not a path.',
    'src/billing/invoice.ts#L40 uses another form.',
    '',
  ])('finds no line cite in %j', (body) => {
    expect(citesReadLines(body)).toBe(false);
  });
});
