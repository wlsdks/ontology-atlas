import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { formatDate } from './format-date';

describe('formatDate', () => {
  // P4-③ 회귀: 실제 사용자 타임존(KST, UTC+9)에서 자정 경계 동작을 고정
  // 검증하려면 process.env.TZ 를 명시로 박아야 한다 — CI/로컬 기본 TZ 에
  // 기대지 않는다.
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
    // 2026-07-21 03:12 KST === 2026-07-20 18:12 UTC — UTC getter 라면
    // "07-20"으로 잘못 표시된다.
    expect(formatDate('2026-07-20T18:12:00.000Z')).toBe('2026.07.21');
  });
});
