import { describe, expect, it } from 'vitest';
import {
  HUB_BOOST_MAX_SCALE,
  HUB_BOOST_RATIO_THRESHOLD,
  HUB_SMALL_SIZE_THRESHOLD,
  PULSE_AMPLITUDE,
  applyOverlaySize,
  shouldHideNode,
} from './reducer-overlay-flags';
import type { SigmaNodeAttrs } from './graph-build';

function attrs(overrides: Partial<SigmaNodeAttrs> = {}): SigmaNodeAttrs {
  return {
    x: 0,
    y: 0,
    size: 4,
    label: 'L',
    color: 'orig',
    borderColor: 'orig',
    outerBorderColor: 'transparent',
    projectSlug: 'p',
    categoryId: 'c',
    isHub: false,
    ownerKey: 'unassigned',
    ...overrides,
  };
}

describe('shouldHideNode', () => {
  it('hubsOnly + 비허브 → true', () => {
    expect(
      shouldHideNode(attrs({ isHub: false }), {
        hubsOnly: true,
        cameraRatio: 1,
        lodHideRatio: 1.8,
      }),
    ).toBe(true);
  });

  it('hubsOnly + 허브 → false', () => {
    expect(
      shouldHideNode(attrs({ isHub: true }), {
        hubsOnly: true,
        cameraRatio: 1,
        lodHideRatio: 1.8,
      }),
    ).toBe(false);
  });

  it('LOD: cameraRatio > threshold + 비허브 → true', () => {
    expect(
      shouldHideNode(attrs({ isHub: false }), {
        hubsOnly: false,
        cameraRatio: 2.0,
        lodHideRatio: 1.8,
      }),
    ).toBe(true);
  });

  it('LOD: cameraRatio > threshold + 허브 → false (허브는 항상 visible)', () => {
    expect(
      shouldHideNode(attrs({ isHub: true }), {
        hubsOnly: false,
        cameraRatio: 2.0,
        lodHideRatio: 1.8,
      }),
    ).toBe(false);
  });

  it('LOD: cameraRatio <= threshold + 비허브 → false', () => {
    expect(
      shouldHideNode(attrs({ isHub: false }), {
        hubsOnly: false,
        cameraRatio: 1.5,
        lodHideRatio: 1.8,
      }),
    ).toBe(false);
  });

  it('두 flag 모두 비활성 → false', () => {
    expect(
      shouldHideNode(attrs(), {
        hubsOnly: false,
        cameraRatio: 1.0,
        lodHideRatio: 1.8,
      }),
    ).toBe(false);
  });
});

describe('applyOverlaySize — recent pulse', () => {
  it('pulse off → size 변동 없음', () => {
    const out = applyOverlaySize(
      attrs({ size: 4, recentlyUpdated: true }),
      { cameraRatio: 1, recentPulseEnabled: false, pulsePhase: Math.PI / 2 },
    );
    expect(out.size).toBe(4);
  });

  it('recentlyUpdated 가 false 면 변동 없음', () => {
    const out = applyOverlaySize(
      attrs({ size: 4, recentlyUpdated: false }),
      { cameraRatio: 1, recentPulseEnabled: true, pulsePhase: Math.PI / 2 },
    );
    expect(out.size).toBe(4);
  });

  it('recentlyUpdated + pulse on → sin(phase) * amplitude 만큼 변조', () => {
    const out = applyOverlaySize(
      attrs({ size: 4, recentlyUpdated: true }),
      { cameraRatio: 1, recentPulseEnabled: true, pulsePhase: Math.PI / 2 },
    );
    // sin(π/2) = 1 → factor = 1 + amplitude
    expect(out.size).toBeCloseTo(4 * (1 + PULSE_AMPLITUDE));
  });
});

describe('applyOverlaySize — hub boost', () => {
  it('비허브는 boost 적용 안 됨', () => {
    const out = applyOverlaySize(
      attrs({ isHub: false, size: 4 }),
      { cameraRatio: 0.3, recentPulseEnabled: false, pulsePhase: 0 },
    );
    expect(out.size).toBe(4);
  });

  it('허브 + size >= threshold (5) 면 boost 적용 안 됨', () => {
    const out = applyOverlaySize(
      attrs({ isHub: true, size: HUB_SMALL_SIZE_THRESHOLD + 1 }),
      { cameraRatio: 0.3, recentPulseEnabled: false, pulsePhase: 0 },
    );
    expect(out.size).toBe(HUB_SMALL_SIZE_THRESHOLD + 1);
  });

  it('허브 + size < threshold + cameraRatio >= 0.7 면 boost 적용 안 됨', () => {
    const out = applyOverlaySize(
      attrs({ isHub: true, size: 4 }),
      {
        cameraRatio: HUB_BOOST_RATIO_THRESHOLD,
        recentPulseEnabled: false,
        pulsePhase: 0,
      },
    );
    expect(out.size).toBe(4);
  });

  it('허브 + size 4 + cameraRatio 0.6 → 부드럽게 boost', () => {
    // boost = 1 + (0.7 - 0.6) * 3.5 = 1.35
    const out = applyOverlaySize(
      attrs({ isHub: true, size: 4 }),
      { cameraRatio: 0.6, recentPulseEnabled: false, pulsePhase: 0 },
    );
    expect(out.size).toBeCloseTo(4 * 1.35);
  });

  it('극단 줌인 (cameraRatio 0) → boost 가 max 2.5x 로 cap', () => {
    // boost 가 1 + 0.7 * 3.5 = 3.45 이지만 max 2.5 로 cap
    const out = applyOverlaySize(
      attrs({ isHub: true, size: 4 }),
      { cameraRatio: 0, recentPulseEnabled: false, pulsePhase: 0 },
    );
    expect(out.size).toBeCloseTo(4 * HUB_BOOST_MAX_SCALE);
  });

  it('pulse + hub boost 동시 적용 — pulse 먼저, 그 다음 boost', () => {
    // sin(π/2) = 1 → pulse factor 1.1 → size 4 * 1.1 = 4.4
    // 4.4 < 5 라 boost 도 적용 (cameraRatio 0 → max 2.5x)
    const out = applyOverlaySize(
      attrs({ isHub: true, size: 4, recentlyUpdated: true }),
      { cameraRatio: 0, recentPulseEnabled: true, pulsePhase: Math.PI / 2 },
    );
    expect(out.size).toBeCloseTo(4 * 1.1 * 2.5);
  });
});
