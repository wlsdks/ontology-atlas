import { describe, expect, it } from 'vitest';
import {
  EGO_LABEL_DENSE_THRESHOLD,
  computeEgoLabelDensity,
  shouldShowEgoLabel,
} from './label-visibility';

function ring(count: number, hop: 1 | 2) {
  return Array.from({ length: count }, () => ({ hop }));
}

describe('computeEgoLabelDensity', () => {
  it('returns false for both rings when empty', () => {
    expect(computeEgoLabelDensity([])).toEqual({ hop1: false, hop2: false });
  });

  it('returns false when ring sizes are below threshold', () => {
    const neighbors = [...ring(8, 1), ...ring(5, 2)];
    expect(computeEgoLabelDensity(neighbors)).toEqual({ hop1: false, hop2: false });
  });

  it('returns false at exactly threshold (strict greater than)', () => {
    const neighbors = ring(EGO_LABEL_DENSE_THRESHOLD, 1);
    expect(computeEgoLabelDensity(neighbors)).toEqual({ hop1: false, hop2: false });
  });

  it('returns true when hop1 ring exceeds threshold', () => {
    const neighbors = ring(EGO_LABEL_DENSE_THRESHOLD + 1, 1);
    expect(computeEgoLabelDensity(neighbors).hop1).toBe(true);
    expect(computeEgoLabelDensity(neighbors).hop2).toBe(false);
  });

  it('returns true when hop2 ring exceeds threshold independently', () => {
    const neighbors = [...ring(3, 1), ...ring(EGO_LABEL_DENSE_THRESHOLD + 5, 2)];
    expect(computeEgoLabelDensity(neighbors)).toEqual({ hop1: false, hop2: true });
  });

  it('returns both true when both rings exceed threshold', () => {
    const neighbors = [
      ...ring(EGO_LABEL_DENSE_THRESHOLD + 1, 1),
      ...ring(EGO_LABEL_DENSE_THRESHOLD + 1, 2),
    ];
    expect(computeEgoLabelDensity(neighbors)).toEqual({ hop1: true, hop2: true });
  });
});

describe('shouldShowEgoLabel', () => {
  it('always shows label when ring is not dense', () => {
    const density = { hop1: false, hop2: false };
    expect(shouldShowEgoLabel(1, 0, density, null)).toBe(true);
    expect(shouldShowEgoLabel(1, 5, density, null)).toBe(true);
    expect(shouldShowEgoLabel(2, 3, density, 7)).toBe(true);
  });

  it('hides labels in dense ring when none hovered', () => {
    const density = { hop1: true, hop2: false };
    expect(shouldShowEgoLabel(1, 0, density, null)).toBe(false);
    expect(shouldShowEgoLabel(1, 5, density, null)).toBe(false);
    // hop=2 ring not dense, still shows
    expect(shouldShowEgoLabel(2, 3, density, null)).toBe(true);
  });

  it('shows only hovered neighbor label in dense ring', () => {
    const density = { hop1: true, hop2: false };
    expect(shouldShowEgoLabel(1, 4, density, 4)).toBe(true);
    expect(shouldShowEgoLabel(1, 5, density, 4)).toBe(false);
  });

  it('hop=2 dense hides hop=2 labels but keeps hop=1 visible', () => {
    const density = { hop1: false, hop2: true };
    expect(shouldShowEgoLabel(1, 0, density, null)).toBe(true);
    expect(shouldShowEgoLabel(2, 0, density, null)).toBe(false);
    expect(shouldShowEgoLabel(2, 0, density, 0)).toBe(true);
  });

  it('both rings dense — only hovered shown, regardless of hop', () => {
    const density = { hop1: true, hop2: true };
    expect(shouldShowEgoLabel(1, 0, density, null)).toBe(false);
    expect(shouldShowEgoLabel(2, 0, density, null)).toBe(false);
    expect(shouldShowEgoLabel(1, 7, density, 7)).toBe(true);
    expect(shouldShowEgoLabel(2, 12, density, 12)).toBe(true);
  });
});
