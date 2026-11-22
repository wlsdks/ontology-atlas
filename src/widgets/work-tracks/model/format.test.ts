import { describe, expect, it } from 'vitest';

import { clockTime } from './format';

describe('clockTime', () => {
  const now = new Date(2026, 10, 22, 10, 0).getTime();

  it('gives only the clock for a moment earlier today', () => {
    expect(clockTime(new Date(2026, 10, 22, 8, 30).getTime(), now, 'en')).not.toMatch(/Nov/);
  });

  it('names the day for a session that started yesterday', () => {
    expect(clockTime(new Date(2026, 10, 21, 18, 47).getTime(), now, 'en')).toMatch(/Nov 21/);
    expect(clockTime(new Date(2026, 10, 21, 18, 47).getTime(), now, 'ko')).toMatch(/11월 21일/);
  });
});
