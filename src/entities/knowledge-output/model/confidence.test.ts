import { describe, expect, it } from 'vitest';
import {
  CONFIDENCE_HIGH_THRESHOLD,
  CONFIDENCE_MEDIUM_THRESHOLD,
  clampConfidence,
  getConfidenceTier,
  isAutoApprovable,
  requiresExplicitReview,
} from './confidence';

describe('thresholds', () => {
  it('matches the on-hold spec §6.3 policy (0.85 / 0.60)', () => {
    expect(CONFIDENCE_HIGH_THRESHOLD).toBe(0.85);
    expect(CONFIDENCE_MEDIUM_THRESHOLD).toBe(0.6);
  });
});

describe('clampConfidence', () => {
  it('passes through valid values in [0, 1]', () => {
    expect(clampConfidence(0)).toBe(0);
    expect(clampConfidence(0.5)).toBe(0.5);
    expect(clampConfidence(1)).toBe(1);
  });

  it('clamps finite values below zero to 0', () => {
    expect(clampConfidence(-0.5)).toBe(0);
  });

  it('clamps finite values above one to 1', () => {
    expect(clampConfidence(1.2)).toBe(1);
    expect(clampConfidence(99)).toBe(1);
  });

  it('returns 0 for invalid inputs (non-finite / non-number / NaN)', () => {
    // Infinity / -Infinity 는 LLM 출력에서 발생하면 파싱 오류 → 안전하게 0.
    // 자동 승인 (≥ 0.85) 게이트가 잘못 trigger 되지 않도록 fail-safe.
    expect(clampConfidence(Infinity)).toBe(0);
    expect(clampConfidence(-Infinity)).toBe(0);
    expect(clampConfidence(NaN)).toBe(0);
    expect(clampConfidence('0.5')).toBe(0);
    expect(clampConfidence(null)).toBe(0);
    expect(clampConfidence(undefined)).toBe(0);
    expect(clampConfidence({})).toBe(0);
  });
});

describe('getConfidenceTier', () => {
  it('classifies high tier (≥ 0.85)', () => {
    expect(getConfidenceTier(0.85)).toBe('high');
    expect(getConfidenceTier(0.9)).toBe('high');
    expect(getConfidenceTier(1)).toBe('high');
  });

  it('classifies medium tier (0.60 ~ 0.84)', () => {
    expect(getConfidenceTier(0.6)).toBe('medium');
    expect(getConfidenceTier(0.7)).toBe('medium');
    expect(getConfidenceTier(0.8499)).toBe('medium');
  });

  it('classifies low tier (< 0.60)', () => {
    expect(getConfidenceTier(0.5)).toBe('low');
    expect(getConfidenceTier(0)).toBe('low');
    expect(getConfidenceTier(-1)).toBe('low');
  });
});

describe('isAutoApprovable', () => {
  it('returns true at exactly 0.85 (threshold inclusive)', () => {
    expect(isAutoApprovable(0.85)).toBe(true);
  });

  it('returns true above 0.85', () => {
    expect(isAutoApprovable(0.9)).toBe(true);
  });

  it('returns false below 0.85', () => {
    expect(isAutoApprovable(0.84)).toBe(false);
    expect(isAutoApprovable(0)).toBe(false);
  });
});

describe('requiresExplicitReview', () => {
  it('returns true below 0.60', () => {
    expect(requiresExplicitReview(0.59)).toBe(true);
    expect(requiresExplicitReview(0)).toBe(true);
  });

  it('returns false at exactly 0.60 (threshold inclusive for medium)', () => {
    expect(requiresExplicitReview(0.6)).toBe(false);
  });

  it('returns false above 0.60', () => {
    expect(requiresExplicitReview(0.7)).toBe(false);
    expect(requiresExplicitReview(1)).toBe(false);
  });
});
