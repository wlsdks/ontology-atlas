import { describe, it, expect } from 'vitest';
import { formatDate } from './format-date';

describe('formatDate', () => {
  it('formats ISO date to Korean short form', () => {
    expect(formatDate(new Date('2026-04-12'))).toBe('2026.04.12');
  });

  it('accepts ISO string input', () => {
    expect(formatDate('2026-01-05')).toBe('2026.01.05');
  });

  it('pads single-digit month/day with zero', () => {
    expect(formatDate(new Date('2026-03-07'))).toBe('2026.03.07');
  });

  it('returns empty string for invalid input', () => {
    expect(formatDate('not-a-date')).toBe('');
  });

  it('returns empty string for null/undefined', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate(undefined)).toBe('');
  });
});
