import { describe, it, expect } from 'vitest';
import { findSimilarNodeByTitle, type SimilarNodeCandidate } from './similar-node-title';

const candidates: SimilarNodeCandidate[] = [
  { slug: 'capabilities/user-auth-flow', title: '사용자 인증 흐름', kind: 'capability' },
  { slug: 'domains/billing', title: '결제', kind: 'domain' },
  { slug: 'elements/auth-token-service', title: 'Auth Token Service', kind: 'element' },
];

describe('findSimilarNodeByTitle', () => {
  it('flags an exact normalized match (case/whitespace-insensitive) of the same kind', () => {
    const match = findSimilarNodeByTitle('  사용자   인증 흐름  ', 'capability', candidates);
    expect(match?.slug).toBe('capabilities/user-auth-flow');
    expect(match?.score).toBe(1);
  });

  it('flags a token-proximity match above the threshold, same kind', () => {
    const match = findSimilarNodeByTitle('사용자 인증 흐름 정리', 'capability', candidates);
    expect(match?.slug).toBe('capabilities/user-auth-flow');
    expect(match?.score).toBeGreaterThanOrEqual(0.6);
  });

  it('does not flag when kind differs, even for an identical title', () => {
    const match = findSimilarNodeByTitle('사용자 인증 흐름', 'element', candidates);
    expect(match).toBeNull();
  });

  it('does not flag dissimilar titles of the same kind', () => {
    const match = findSimilarNodeByTitle('결제 실패 재시도 정책', 'capability', candidates);
    expect(match).toBeNull();
  });

  it('does not flag loosely-related titles below the token-overlap threshold', () => {
    // "인증" 한 토큰만 겹치고 나머지는 갈린다 — 다른 개념(auth-login vs
    // auth-logout 급 오경보) 취급을 피해야 한다.
    const match = findSimilarNodeByTitle('인증 실패 알림', 'capability', candidates);
    expect(match).toBeNull();
  });

  it('excludes the node itself via excludeSlug (editing an existing node)', () => {
    const match = findSimilarNodeByTitle('사용자 인증 흐름', 'capability', candidates, {
      excludeSlug: 'capabilities/user-auth-flow',
    });
    expect(match).toBeNull();
  });

  it('returns null for an empty or whitespace-only title', () => {
    expect(findSimilarNodeByTitle('   ', 'capability', candidates)).toBeNull();
    expect(findSimilarNodeByTitle('', 'capability', candidates)).toBeNull();
  });

  it('respects a custom minScore threshold', () => {
    // 토큰 1/3 겹침(0.33) — 기본 임계(0.6)에선 탈락하지만 낮춘 임계에선 매치.
    const belowDefault = findSimilarNodeByTitle('사용자 데이터 내보내기', 'capability', candidates);
    expect(belowDefault).toBeNull();
    const withLowerThreshold = findSimilarNodeByTitle(
      '사용자 데이터 내보내기',
      'capability',
      candidates,
      { minScore: 0.2 },
    );
    expect(withLowerThreshold?.slug).toBe('capabilities/user-auth-flow');
  });

  it('picks the highest-scoring candidate when multiple match', () => {
    const many: SimilarNodeCandidate[] = [
      { slug: 'a', title: '결제 흐름 개선', kind: 'capability' },
      { slug: 'b', title: '결제 흐름 개선 초안', kind: 'capability' },
    ];
    const match = findSimilarNodeByTitle('결제 흐름 개선', 'capability', many);
    expect(match?.slug).toBe('a');
    expect(match?.score).toBe(1);
  });
});
