import { describe, expect, it } from 'vitest';
import { getOntologyKindLabel } from './labels';

describe('getOntologyKindLabel', () => {
  it('seed kind 6 종 — 한글 라벨 반환', () => {
    expect(getOntologyKindLabel('project')).toBe('프로젝트');
    expect(getOntologyKindLabel('domain')).toBe('도메인');
    expect(getOntologyKindLabel('capability')).toBe('역량');
    expect(getOntologyKindLabel('element')).toBe('요소');
    expect(getOntologyKindLabel('document')).toBe('문서');
    expect(getOntologyKindLabel('unknown')).toBe('미지');
  });

  it('seed 에 없는 kind — raw 문자열 fallback (dead label 방지)', () => {
    expect(getOntologyKindLabel('mythical-kind')).toBe('mythical-kind');
    expect(getOntologyKindLabel('')).toBe('');
  });
});
