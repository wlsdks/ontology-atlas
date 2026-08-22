import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { formatDate } from './format-date';

describe('formatDate', () => {
  // Pinning `process.env.TZ` is required to fix the midnight-boundary behaviour
  // in a real user timezone (KST, UTC+9); the default TZ of CI or a laptop
  // cannot be relied on.
  let originalTz: string | undefined;
  beforeAll(() => {
    originalTz = process.env.TZ;
    process.env.TZ = 'Asia/Seoul';
  });
  afterAll(() => {
    process.env.TZ = originalTz;
  });

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

  it('renders a late-night KST timestamp on its local calendar day, not the UTC day it crosses into (P4-③)', () => {
    // 2026-07-21 03:12 KST is 2026-07-20 18:12 UTC; a UTC getter would render
    // this as "07-20".
    expect(formatDate('2026-07-20T18:12:00.000Z')).toBe('2026.07.21');
  });
});
