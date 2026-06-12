import { describe, expect, it } from 'vitest';
import {
  resolveSafeAreaCameraFit,
  resolveSkeletonSafeInsets,
} from './camera-fit';

describe('resolveSkeletonSafeInsets — chrome inset 단일 진실원', () => {
  it('선택 활성이면 우측 팝오버 폭만큼 inset (ui-scale 배수 동행)', () => {
    // 2560px = ui-scale 1.3 — chrome 이 zoom 으로 커지는 만큼 inset 도 같이.
    expect(resolveSkeletonSafeInsets(2560, true).right).toBeCloseTo(392 * 1.3);
    expect(resolveSkeletonSafeInsets(2560, false).right).toBeCloseTo(48 * 1.3);
    // 기준 스케일(<1920px)에선 원값.
    expect(resolveSkeletonSafeInsets(1280, true).right).toBe(392);
  });

  it('소형 뷰포트에선 우측 inset 을 줄여 safe 폭 붕괴 방지', () => {
    const insets = resolveSkeletonSafeInsets(600, true);
    expect(insets.right).toBe(16);
    // safe 폭이 항상 양수.
    expect(600 - insets.left - insets.right).toBeGreaterThan(0);
  });

  it('지도 골격은 좌측 분석 패널과 범례 폭만큼 노드 배치 안전영역을 둔다', () => {
    expect(resolveSkeletonSafeInsets(1280, false).left).toBeCloseTo(1280 * 0.52);
    expect(resolveSkeletonSafeInsets(1920, false).left).toBeCloseTo(760 * 1.15);
    expect(resolveSkeletonSafeInsets(2560, false).left).toBeCloseTo(760 * 1.3);
  });

  it('선택 포커스 팬은 큰 docked 카드 fan-out 이 잘리지 않도록 더 깊은 top inset 을 둔다', () => {
    expect(resolveSkeletonSafeInsets(1920, true, { selectedFanoutRows: 18 }).top).toBeCloseTo(
      420 * 1.15,
    );
    expect(resolveSkeletonSafeInsets(2560, true, { selectedFanoutRows: 18 }).top).toBeCloseTo(
      420 * 1.3,
    );
    // 호출자가 아직 fan-out 을 넘기지 않는 경우도 기존 보수적 안전값을 유지한다.
    expect(resolveSkeletonSafeInsets(1920, true).top).toBeCloseTo(420 * 1.15);
    expect(resolveSkeletonSafeInsets(2560, true).top).toBeCloseTo(420 * 1.3);
    expect(resolveSkeletonSafeInsets(2560, false).top).toBeCloseTo(176 * 1.3);
  });

  it('선택 포커스 팬이 작으면 과한 하단 이동 없이 fan-out 높이만큼만 top inset 을 둔다', () => {
    expect(resolveSkeletonSafeInsets(1920, true, { selectedFanoutRows: 2 }).top).toBeCloseTo(
      176 * 1.15,
    );
    expect(resolveSkeletonSafeInsets(1920, true, { selectedFanoutRows: 10 }).top).toBeCloseTo(
      240 * 1.15,
    );
  });
});

describe('resolveSafeAreaCameraFit — 골격 확장 카메라 fit (chrome 세이프존)', () => {
  const viewport = { width: 1000, height: 800 };

  it('bbox 가 safe rect 보다 크면 ratio 를 늘려(줌아웃) 안에 들어오게 한다', () => {
    const fit = resolveSafeAreaCameraFit({
      bbox: { minX: 0, minY: 0, maxX: 1800, maxY: 600 },
      viewport,
      insets: { top: 100, right: 100, bottom: 100, left: 100 },
    });
    // safeW 800, bboxW 1800 → scale 2.25 (가로가 지배)
    expect(fit.ratioScale).toBeCloseTo(1800 / 800);
  });

  it('bbox 가 safe rect 보다 작으면 줌인하되 과한 줌인은 캡', () => {
    const fit = resolveSafeAreaCameraFit({
      bbox: { minX: 400, minY: 300, maxX: 500, maxY: 360 },
      viewport,
      insets: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    // 100x60 bbox vs 1000x800 → raw scale 0.1 — minZoomInScale(0.55) 로 캡.
    expect(fit.ratioScale).toBe(0.55);
  });

  it('safe rect 중심과 bbox 중심을 돌려준다 (top inset → 중심이 아래로 이동)', () => {
    const fit = resolveSafeAreaCameraFit({
      bbox: { minX: 100, minY: 100, maxX: 300, maxY: 200 },
      viewport,
      insets: { top: 200, right: 0, bottom: 0, left: 0 },
    });
    expect(fit.bboxCenter).toEqual({ x: 200, y: 150 });
    // safe rect = y 200~800 → 중심 y 500.
    expect(fit.safeCenter).toEqual({ x: 500, y: 500 });
  });

  it('degenerate bbox(점 1개)·0 safe rect 에도 유한값', () => {
    const fit = resolveSafeAreaCameraFit({
      bbox: { minX: 10, minY: 10, maxX: 10, maxY: 10 },
      viewport: { width: 10, height: 10 },
      insets: { top: 10, right: 10, bottom: 10, left: 10 },
    });
    expect(Number.isFinite(fit.ratioScale)).toBe(true);
    expect(fit.ratioScale).toBeGreaterThan(0);
  });
});
