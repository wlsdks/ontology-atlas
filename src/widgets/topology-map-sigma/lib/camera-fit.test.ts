import { describe, expect, it } from 'vitest';
import {
  SELECTED_FOCUS_VIEWPORT_READING_CENTER_Y_RATIO,
  resolveSafeAreaCameraFit,
  resolveSelectedFocusCameraFit,
  resolveSelectedFocusCameraMotionProof,
  resolveSkeletonSafeInsets,
  resolveTopologyUiScale,
} from './camera-fit';

describe('resolveTopologyUiScale — Relief card/chrome scale breakpoints', () => {
  it('14-inch MacBook Pro급 논리폭부터 지도 UI를 한 단계 키운다', () => {
    expect(resolveTopologyUiScale(1280)).toBe(1);
    expect(resolveTopologyUiScale(1511)).toBe(1);
    expect(resolveTopologyUiScale(1512)).toBe(1.12);
    expect(resolveTopologyUiScale(1920)).toBe(1.18);
    expect(resolveTopologyUiScale(2400)).toBe(1.32);
  });
});

describe('resolveSkeletonSafeInsets — chrome inset 단일 진실원', () => {
  it('선택 활성이면 우측 팝오버 폭만큼 inset (ui-scale 배수 동행)', () => {
    // 2560px = ui-scale 1.32 — chrome 이 zoom 으로 커지는 만큼 inset 도 같이.
    expect(resolveSkeletonSafeInsets(2560, true).right).toBeCloseTo(392 * 1.32);
    expect(resolveSkeletonSafeInsets(2560, false).right).toBeCloseTo(48 * 1.32);
    // 1280px 에선 selected relation/card rail 이 compact 라 full right rail 을
    // 예약하면 좌측 HUD 와 합쳐 safe rect 가 너무 좁아진다.
    expect(resolveSkeletonSafeInsets(1280, true).right).toBe(320);
    const compact = resolveSkeletonSafeInsets(1280, true);
    expect(1280 - compact.left - compact.right).toBeGreaterThanOrEqual(360);
  });

  it('소형 뷰포트에선 우측 inset 을 줄여 safe 폭 붕괴 방지', () => {
    const insets = resolveSkeletonSafeInsets(600, true);
    expect(insets.right).toBe(16);
    // safe 폭이 항상 양수.
    expect(600 - insets.left - insets.right).toBeGreaterThan(0);
  });

  it('지도 골격은 compact 좌측 HUD 폭만큼만 노드 배치 안전영역을 둔다', () => {
    expect(resolveSkeletonSafeInsets(1280, false).left).toBeCloseTo(1280 * 0.46);
    expect(resolveSkeletonSafeInsets(1512, false).left).toBeCloseTo(1512 * 0.46);
    expect(resolveSkeletonSafeInsets(1920, false).left).toBeCloseTo(640 * 1.18);
    expect(resolveSkeletonSafeInsets(2560, false).left).toBeCloseTo(640 * 1.32);
  });

  it('선택 전 focus 안내 rail 은 overview HUD 보다 좁은 safe inset 을 쓴다', () => {
    expect(
      resolveSkeletonSafeInsets(1920, false, { compactFocusRail: true }).left,
    ).toBeCloseTo(320 * 1.18);
    expect(
      resolveSkeletonSafeInsets(2560, false, { compactFocusRail: true }).left,
    ).toBeCloseTo(320 * 1.32);
    expect(
      resolveSkeletonSafeInsets(1920, false, { compactFocusRail: true }).left,
    ).toBeLessThan(resolveSkeletonSafeInsets(1920, false).left);
  });

  it('선택 focus rail 이 활성일 때는 좌측 overview HUD 대신 compact rail 폭만 예약한다', () => {
    const insets = resolveSkeletonSafeInsets(1512, true, { selectedFanoutRows: 4 });
    expect(insets.left).toBeLessThanOrEqual(360);
    expect(1512 - insets.left - insets.right).toBeGreaterThanOrEqual(700);

    const compact = resolveSkeletonSafeInsets(1280, true, { selectedFanoutRows: 4 });
    expect(1280 - compact.left - compact.right).toBeGreaterThanOrEqual(520);
  });

  it('선택 포커스 팬은 큰 docked 카드 fan-out 이 잘리지 않도록 더 깊은 top inset 을 둔다', () => {
    expect(resolveSkeletonSafeInsets(1920, true, { selectedFanoutRows: 18 }).top).toBeCloseTo(
      420 * 1.18,
    );
    expect(resolveSkeletonSafeInsets(2560, true, { selectedFanoutRows: 18 }).top).toBeCloseTo(
      420 * 1.32,
    );
    // 호출자가 아직 fan-out 을 넘기지 않는 경우도 기존 보수적 안전값을 유지한다.
    expect(resolveSkeletonSafeInsets(1920, true).top).toBeCloseTo(420 * 1.18);
    expect(resolveSkeletonSafeInsets(2560, true).top).toBeCloseTo(420 * 1.32);
    expect(resolveSkeletonSafeInsets(2560, false).top).toBeCloseTo(176 * 1.32);
  });

  it('선택 포커스 팬이 작으면 과한 하단 이동 없이 fan-out 높이만큼만 top inset 을 둔다', () => {
    expect(resolveSkeletonSafeInsets(1512, true, { selectedFanoutRows: 2 }).top).toBeCloseTo(
      224 * 1.12,
    );
    expect(resolveSkeletonSafeInsets(1920, true, { selectedFanoutRows: 2 }).top).toBeCloseTo(
      224 * 1.18,
    );
    expect(resolveSkeletonSafeInsets(1920, true, { selectedFanoutRows: 10 }).top).toBeCloseTo(
      320 * 1.18,
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
    expect(fit.safeTarget).toEqual({ x: 500, y: 500 });
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

describe('resolveSelectedFocusCameraFit — selected skeleton focus motion', () => {
  const viewport = { width: 1512, height: 917 };
  const insets = resolveSkeletonSafeInsets(viewport.width, true, {
    selectedFanoutRows: 2,
  });

  it('선택 노드가 이미 readable safe center 에 있으면 카메라를 움직이지 않는다', () => {
    const safeTarget = {
      x: insets.left + (viewport.width - insets.left - insets.right) / 2,
      y: insets.top + (viewport.height - insets.top - insets.bottom) / 2,
    };
    expect(
      resolveSelectedFocusCameraFit({
        selectedViewport: safeTarget,
        viewport,
        insets,
        currentRatio: 1,
      }),
    ).toBeNull();
  });

  it('선택 노드가 safe rect 안쪽 가장자리에 있으면 readable safe center 로 보정한다', () => {
    const expectedSafeCenter = {
      x: insets.left + (viewport.width - insets.left - insets.right) / 2,
      y: insets.top + (viewport.height - insets.top - insets.bottom) / 2,
    };
    const fit = resolveSelectedFocusCameraFit({
      selectedViewport: { x: insets.left + 40, y: insets.top + 120 },
      viewport,
      insets,
      currentRatio: 1.1,
    });
    expect(fit).not.toBeNull();
    expect(fit?.targetRatio).toBe(0.8);
    expect(fit?.safeTarget.x).toBeCloseTo(expectedSafeCenter.x);
    expect(fit?.safeTarget.y).toBeCloseTo(expectedSafeCenter.y);
  });

  it('선택 노드가 support panel 밑이면 readable safe center 로 보정한다', () => {
    const expectedSafeCenter = {
      x: insets.left + (viewport.width - insets.left - insets.right) / 2,
      y: insets.top + (viewport.height - insets.top - insets.bottom) / 2,
    };
    const fit = resolveSelectedFocusCameraFit({
      selectedViewport: { x: insets.left - 40, y: insets.top + 120 },
      viewport,
      insets,
      currentRatio: 1.1,
    });
    expect(fit).not.toBeNull();
    expect(fit?.targetRatio).toBe(0.8);
    expect(fit?.safeTarget.x).toBeCloseTo(expectedSafeCenter.x);
    expect(fit?.safeTarget.y).toBeCloseTo(expectedSafeCenter.y);
  });

  it('이미 읽기 배율보다 줌인된 상태에서는 추가 줌아웃 없이 팬만 계산한다', () => {
    const fit = resolveSelectedFocusCameraFit({
      selectedViewport: { x: viewport.width - insets.right + 40, y: insets.top + 120 },
      viewport,
      insets,
      currentRatio: 0.62,
    });
    expect(fit?.targetRatio).toBe(0.62);
    expect(fit?.safeTarget.x).toBeCloseTo(
      insets.left + (viewport.width - insets.left - insets.right) / 2,
    );
  });

  it('선택 클릭 전용 정책은 fixed chrome safe rect 가 아니라 viewport reading center 를 목표로 한다', () => {
    const fit = resolveSelectedFocusCameraFit({
      selectedViewport: { x: insets.left + 40, y: insets.top + 120 },
      viewport,
      insets,
      currentRatio: 1.1,
      targetPolicy: 'viewport-center',
    });
    expect(fit).not.toBeNull();
    expect(fit?.targetRatio).toBe(1.1);
    expect(fit?.safeTarget.x).toBeCloseTo(viewport.width / 2);
    expect(fit?.safeTarget.y).toBeCloseTo(
      viewport.height * SELECTED_FOCUS_VIEWPORT_READING_CENTER_Y_RATIO,
    );
  });

  it('선택 카메라 보정의 의도와 이동 거리를 검증 가능한 proof 로 남긴다', () => {
    const proof = resolveSelectedFocusCameraMotionProof({
      selectedViewport: { x: 100, y: 200 },
      safeTarget: { x: 220, y: 290 },
    });
    expect(proof).toEqual({
      intent: 'selected-focus-safe-rect',
      targetPolicy: 'readable-safe-center',
      selectedViewport: { x: 100, y: 200 },
      safeTarget: { x: 220, y: 290 },
      distancePx: 150,
      targetInsideSafeRect: true,
    });
  });
});
