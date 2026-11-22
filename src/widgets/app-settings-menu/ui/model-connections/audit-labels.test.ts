import { describe, expect, it } from 'vitest';
import { formatAuditTime } from './audit-labels';

describe('formatAuditTime', () => {
  it('prints month.day and the 24-hour time in the local timezone, zero-padded', () => {
    expect(formatAuditTime(new Date(2026, 0, 5, 9, 7).toISOString())).toBe('01.05 09:07');
    expect(formatAuditTime(new Date(2026, 10, 21, 23, 59).toISOString())).toBe('11.21 23:59');
  });

  it('shows the raw text when the value is not a date', () => {
    expect(formatAuditTime('not a time')).toBe('not a time');
  });
});
