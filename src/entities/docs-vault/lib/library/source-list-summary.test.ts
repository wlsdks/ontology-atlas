import { describe, expect, it } from 'vitest';

import { countSourceFormats, formatSourceBytes } from './source-list-summary';

describe('formatSourceBytes', () => {
  it('writes bytes plainly and larger sizes in decimal units with one decimal under 100', () => {
    expect(formatSourceBytes(999)).toBe('999 B');
    expect(formatSourceBytes(1536)).toBe('1.5 KB');
    expect(formatSourceBytes(250_000)).toBe('250 KB');
    expect(formatSourceBytes(3_400_000)).toBe('3.4 MB');
  });

  it('writes a dash for a size that is not a size', () => {
    expect(formatSourceBytes(-1)).toBe('—');
    expect(formatSourceBytes(Number.NaN)).toBe('—');
  });
});

describe('countSourceFormats', () => {
  it('counts formats case-insensitively, most files first and ties by name, extensionless under an empty name', () => {
    const file = (format: string) => ({ path: `sources/x.${format}`, name: 'x', format, bytes: 1, mtime: 1 });
    expect(countSourceFormats([file('md'), file('PDF'), file('pdf'), file(''), file('csv')])).toEqual([
      { format: 'pdf', count: 2 },
      { format: '', count: 1 },
      { format: 'csv', count: 1 },
      { format: 'md', count: 1 },
    ]);
  });
});
