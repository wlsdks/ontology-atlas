import { describe, expect, it } from 'vitest';

import { citesReadLines } from './line-cite';

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
