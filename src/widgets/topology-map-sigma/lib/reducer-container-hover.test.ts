import { describe, expect, it } from 'vitest';
import { applyContainerHoverPreview } from './reducer-container-hover';
import {
  CONTAINER_HOVER_REVEAL_MS,
  CONTAINER_HOVER_TARGET_SCALE,
} from './reducer-anim';
import type { SigmaNodeAttrs } from './graph-build';

function attrs(overrides: Partial<SigmaNodeAttrs> = {}): SigmaNodeAttrs {
  return {
    x: 0,
    y: 0,
    size: 4,
    label: 'Hub Label',
    color: 'orig',
    borderColor: 'orig',
    outerBorderColor: 'transparent',
    projectSlug: 'p',
    categoryId: 'c',
    isHub: true,
    ownerKey: 'unassigned',
    ...overrides,
  };
}

describe('applyContainerHoverPreview', () => {
  it('hoverStart null → progress 0, size 변동 없음, full dim alpha', () => {
    const out = applyContainerHoverPreview(attrs(), {
      hoverStart: null,
      now: 1000,
    });
    expect(out.size).toBeCloseTo(4); // scale 1
    // alpha lerp 0.32 → 0.92 시작점 = 0.32
    expect(out.color).toBe('rgba(139, 151, 255, 0.320)');
    expect(out.borderColor).toBe('rgba(180, 190, 255, 0.180)');
    expect(out.forceLabel).toBe(false);
    expect(out.zIndex).toBe(8);
  });

  it('hoverStart 도달 (now 동일) → progress 0', () => {
    const out = applyContainerHoverPreview(attrs(), {
      hoverStart: 1000,
      now: 1000,
    });
    expect(out.size).toBeCloseTo(4);
    expect(out.forceLabel).toBe(false);
  });

  it('reveal 완료 (now ≥ hoverStart + revealMs) → progress 1, full scale + full alpha', () => {
    const out = applyContainerHoverPreview(attrs(), {
      hoverStart: 0,
      now: CONTAINER_HOVER_REVEAL_MS,
    });
    expect(out.size).toBeCloseTo(4 * CONTAINER_HOVER_TARGET_SCALE);
    expect(out.color).toBe('rgba(139, 151, 255, 0.920)');
    expect(out.borderColor).toBe('rgba(180, 190, 255, 0.700)');
    expect(out.forceLabel).toBe(true); // progress 1 > 0.6
  });

  it('reveal 중간점 (50%, easeOutCubic = 0.875) → 70% 도달 forceLabel', () => {
    const out = applyContainerHoverPreview(attrs(), {
      hoverStart: 0,
      now: CONTAINER_HOVER_REVEAL_MS / 2,
    });
    // easeOutCubic at 0.5 = 0.875 > 0.6 → forceLabel true
    expect(out.forceLabel).toBe(true);
    // color alpha lerp 0.32 + 0.875 * (0.92 - 0.32) = 0.32 + 0.525 = 0.845
    expect(out.color).toBe('rgba(139, 151, 255, 0.845)');
  });

  it('reveal 30% (easeOutCubic ≈ 0.657) → forceLabel still true (>0.6)', () => {
    const out = applyContainerHoverPreview(attrs(), {
      hoverStart: 0,
      now: CONTAINER_HOVER_REVEAL_MS * 0.3,
    });
    expect(out.forceLabel).toBe(true);
  });

  it('reveal 10% (easeOutCubic ≈ 0.271) → forceLabel false (<0.6)', () => {
    const out = applyContainerHoverPreview(attrs(), {
      hoverStart: 0,
      now: CONTAINER_HOVER_REVEAL_MS * 0.1,
    });
    expect(out.forceLabel).toBe(false);
  });

  it('zIndex 항상 8, label 보존', () => {
    const out = applyContainerHoverPreview(attrs({ label: 'Custom' }), {
      hoverStart: 0,
      now: CONTAINER_HOVER_REVEAL_MS,
    });
    expect(out.zIndex).toBe(8);
    expect(out.label).toBe('Custom');
  });
});
