import { describe, expect, it } from 'vitest';

import { proposalGuards } from './proposal-guards';

const asDate = (epochMs: number) => `date:${epochMs}`;

describe('proposalGuards', () => {
  it('lists only the guards the request carries, in a fixed order', () => {
    const guards = proposalGuards({ expected_into_mtime: 5, name: 'x', confirm: true, expected_mtime: 7 }, asDate);
    expect(guards.map((guard) => guard.key)).toEqual(['confirm', 'expected_mtime', 'expected_into_mtime']);
    expect(proposalGuards({ name: 'x' }, asDate)).toEqual([]);
  });

  it('shows a time guard as a date and keeps the exact number', () => {
    const [guard] = proposalGuards({ expected_mtime: 1700000000000 }, asDate);
    expect(guard.shown).toBe('date:1700000000000');
    expect(guard.exact).toBe('1700000000000');
  });

  it('shows anything that is not a finite time number as plain text', () => {
    const guards = proposalGuards({ confirm: true, expected_mtime: 'soon', expected_into_mtime: Number.NaN }, asDate);
    expect(guards.map((guard) => guard.shown)).toEqual(['true', 'soon', 'null']);
    expect(guards.every((guard) => guard.exact === undefined)).toBe(true);
  });

  it('treats a non-time key as plain text even when its value is a number', () => {
    const [guard] = proposalGuards({ confirm: 12 }, asDate);
    expect(guard.shown).toBe('12');
  });
});
