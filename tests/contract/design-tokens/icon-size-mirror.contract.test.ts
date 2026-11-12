import { expect, it } from 'vitest';

import { ICON_SIZE } from '../../../src/shared/ui/tokens/icon-size';
import { PROSE_MEASURE_STEPS, PROSE_ZERO_ADVANCE_EM, WIDE_READING_MIN_VIEWPORT_PX } from '../../../src/shared/ui/tokens/reading-measure';
import { readGlobalCss } from '../../../scripts/lib/design/global-css.mjs';

const CSS = readGlobalCss();

function cssNumber(name: string): number {
  const match = CSS.match(new RegExp(`^\\s*${name}\\s*:\\s*([0-9.]+)(px|rem)?;`, 'm'));
  if (!match) throw new Error(`${name} is missing from the stylesheet`);
  return match[2] === 'rem' ? Number(match[1]) * 16 : Number(match[1]);
}

it('the icon ramp in CSS and its JS mirror hold the same values', () => {
  expect(cssNumber('--icon-sm')).toBe(ICON_SIZE.sm);
  expect(cssNumber('--icon-md')).toBe(ICON_SIZE.md);
  expect(cssNumber('--icon-lg')).toBe(ICON_SIZE.lg);
});

it('the reading measure in CSS and its JS mirror hold the same values', () => {
  expect(cssNumber('--measure-prose-steps')).toBe(PROSE_MEASURE_STEPS);
  expect(cssNumber('--measure-zero-advance')).toBe(PROSE_ZERO_ADVANCE_EM);
  expect(CSS).toContain(`min-width: ${WIDE_READING_MIN_VIEWPORT_PX}px`);
});
