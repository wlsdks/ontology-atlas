import { describe, expect, it } from 'vitest';
import {
  entranceSizeFactor,
  NODE_ENTRANCE_MS,
  reconcileFirstSeen,
} from './reducer-entrance';

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

describe('reconcileFirstSeen', () => {
  it('첫 build(initialized=false)는 모든 노드를 이미-자란 상태로 seed, anyNew=false', () => {
    const seen = new Map<string, number>();
    const result = reconcileFirstSeen(seen, ['a', 'b'], 1000, false, 500);
    expect(result.anyNew).toBe(false);
    // now - entranceMs → entranceSizeFactor 가 즉시 1(애니메이션 안 함).
    expect(seen.get('a')).toBe(500);
    expect(seen.get('b')).toBe(500);
  });

  it('init 후 처음 보는 slug 만 now 로 seed + anyNew=true', () => {
    const seen = new Map<string, number>([['a', 0]]);
    const result = reconcileFirstSeen(seen, ['a', 'c'], 2000, true, 500);
    expect(result.anyNew).toBe(true);
    expect(seen.get('a')).toBe(0); // 기존 노드 timestamp 유지
    expect(seen.get('c')).toBe(2000); // 새 노드는 now → grow-in
  });

  it('기존 노드만 다시 보이면 anyNew=false (재등장 애니메이션 안 함)', () => {
    const seen = new Map<string, number>([['a', 0], ['b', 0]]);
    const result = reconcileFirstSeen(seen, ['a', 'b'], 3000, true, 500);
    expect(result.anyNew).toBe(false);
  });

  it('그래프에서 사라진 slug 는 prune (레지스트리 무한 성장 방지)', () => {
    const seen = new Map<string, number>([['a', 0], ['gone', 0]]);
    reconcileFirstSeen(seen, ['a'], 3000, true, 500);
    expect(seen.has('gone')).toBe(false);
    expect(seen.has('a')).toBe(true);
  });

  it('제거→재추가된 slug 는 다시 grow-in (prune 덕에 새 노드로 취급)', () => {
    const seen = new Map<string, number>([['x', 100]]);
    reconcileFirstSeen(seen, [], 2000, true, 500); // x 제거 → prune
    expect(seen.has('x')).toBe(false);
    const result = reconcileFirstSeen(seen, ['x'], 5000, true, 500); // 재추가
    expect(result.anyNew).toBe(true);
    expect(seen.get('x')).toBe(5000);
  });
});
