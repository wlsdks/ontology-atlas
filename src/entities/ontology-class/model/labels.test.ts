import { describe, expect, it } from 'vitest';
import { getOntologyKindLabel } from './labels';

describe('getOntologyKindLabel', () => {
  it('returns Korean labels for the six seed kinds', () => {
    expect(getOntologyKindLabel('project')).toBe('프로젝트');
    expect(getOntologyKindLabel('domain')).toBe('도메인');
    expect(getOntologyKindLabel('capability')).toBe('역량');
    expect(getOntologyKindLabel('element')).toBe('요소');
    expect(getOntologyKindLabel('document')).toBe('문서');
    expect(getOntologyKindLabel('unknown')).toBe('미지');
  });

  it('falls back to the raw string for other kinds', () => {
    expect(getOntologyKindLabel('mythical-kind')).toBe('mythical-kind');
    expect(getOntologyKindLabel('')).toBe('');
  });
});
