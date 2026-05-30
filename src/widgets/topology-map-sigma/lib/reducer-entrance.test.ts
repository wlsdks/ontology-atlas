import { describe, expect, it } from 'vitest';
import { entranceSizeFactor, NODE_ENTRANCE_MS } from './reducer-entrance';

describe('entranceSizeFactor', () => {
  it('reduceMotion → 즉시 full size (1)', () => {
    expect(entranceSizeFactor(0, NODE_ENTRANCE_MS, true)).toBe(1);
    expect(entranceSizeFactor(10, NODE_ENTRANCE_MS, true)).toBe(1);
  });

  it('duration 이상이면 full size (다 자람)', () => {
    expect(entranceSizeFactor(NODE_ENTRANCE_MS)).toBe(1);
    expect(entranceSizeFactor(NODE_ENTRANCE_MS + 1000)).toBe(1);
  });

  it('비유한 age 는 안전하게 1', () => {
    expect(entranceSizeFactor(Number.NaN)).toBe(1);
    expect(entranceSizeFactor(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it('막 등장(age<=0)은 작게 시작하되 0 은 아님', () => {
    const f = entranceSizeFactor(0);
    expect(f).toBeGreaterThan(0);
    expect(f).toBeLessThan(0.2);
    expect(entranceSizeFactor(-50)).toBe(f);
  });

  it('진행 중에는 단조 증가 (작게→크게)', () => {
    const quarter = entranceSizeFactor(NODE_ENTRANCE_MS * 0.25);
    const half = entranceSizeFactor(NODE_ENTRANCE_MS * 0.5);
    const threeQuarter = entranceSizeFactor(NODE_ENTRANCE_MS * 0.75);
    expect(quarter).toBeLessThan(half);
    expect(half).toBeLessThan(threeQuarter);
    expect(threeQuarter).toBeLessThan(1);
    expect(quarter).toBeGreaterThan(entranceSizeFactor(0));
  });

  it('ease-out — 초반이 빠르다(절반 시점에서 이미 절반 이상 자람)', () => {
    expect(entranceSizeFactor(NODE_ENTRANCE_MS * 0.5)).toBeGreaterThan(0.5);
  });
});
