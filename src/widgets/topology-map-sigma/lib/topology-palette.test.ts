import { describe, expect, it } from 'vitest';
import { applyLeafFillSaturate, getTopologyPalette } from './topology-palette';

/**
 * R+ (cycle 47) — DOMAIN_TONE 의 pale rgba 를 light 모드 graphite 으로 시프트
 * 하는 helper. saturate 1 은 no-op, > 1 은 base lightness 감산.
 */
describe('applyLeafFillSaturate', () => {
  it('saturate=1 → 입력 그대로 (no-op)', () => {
    expect(applyLeafFillSaturate('rgba(160, 168, 184, 0.82)', 1)).toBe(
      'rgba(160, 168, 184, 0.82)',
    );
  });

  it('saturate=1.7 → rgb 채널을 1.7 로 나눠 graphite shift', () => {
    // 160/1.7 = 94.1 → 94, 168/1.7 = 98.8 → 99, 184/1.7 = 108.2 → 108
    expect(applyLeafFillSaturate('rgba(160, 168, 184, 0.82)', 1.7)).toBe(
      'rgba(94, 99, 108, 0.82)',
    );
  });

  it('saturate 적용 시 alpha 는 보존', () => {
    const out = applyLeafFillSaturate('rgba(200, 200, 200, 0.5)', 2);
    expect(out).toMatch(/0.5\)$/);
  });

  it('rgb 형식 (alpha 없음) 도 처리 — alpha 1 으로 채워짐', () => {
    expect(applyLeafFillSaturate('rgb(200, 200, 200)', 2)).toBe(
      'rgba(100, 100, 100, 1)',
    );
  });

  it('잘못된 입력은 그대로 반환 (best effort)', () => {
    expect(applyLeafFillSaturate('not-a-color', 2)).toBe('not-a-color');
    expect(applyLeafFillSaturate('', 1.5)).toBe('');
  });
});

describe('getTopologyPalette — dense edge defaults', () => {
  it('keeps dark-mode base edges quiet so large vaults do not turn white', () => {
    const dark = getTopologyPalette('dark');

    expect(dark.edge).toBe('rgba(130, 150, 195, 0.025)');
    expect(dark.edgeContains).toBe('rgba(130, 150, 195, 0.025)');
    expect(dark.edgeDependsOn).toBe('rgba(139, 151, 255, 0.055)');
  });

  it('keeps light-mode edges below foreground contrast while preserving relation tiers', () => {
    const light = getTopologyPalette('light');

    expect(light.edge).toBe('rgba(40, 50, 72, 0.18)');
    expect(light.edgeContains).toBe('rgba(40, 50, 72, 0.12)');
    expect(light.edgeDependsOn).toBe('rgba(60, 76, 200, 0.28)');
  });
});
