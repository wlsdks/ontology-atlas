import type { SigmaNodeAttrs } from './graph-build';

/**
 * SigmaTopology nodeReducer 의 4 가지 overlay flag 분기 (A4-1).
 *
 * 1. **hubs only** — 비허브 노드 전체 hidden (filter)
 * 2. **zoom LOD** — 카메라 ratio > threshold 면 비허브 hidden (5k+ 노드
 *    render 비용 절감)
 * 3. **recent pulse** — recentlyUpdated 노드 size sine 변조 (container
 *    제외)
 * 4. **hub size boost** — 작은 허브 (size < 5) 가 줌인 (ratio < 0.7) 시
 *    최대 2.5x 부스트 (M-1 환공포증 완화 후 클릭 타겟 확보)
 *
 * 1, 2 는 hidden 결과 — caller 가 단순히 그 attrs 반환. 3, 4 는 size
 * 변경만 — caller 가 다음 분기 (focus / context dim 등) 로 진행.
 */

export const HUB_BOOST_RATIO_THRESHOLD = 0.7;
export const HUB_BOOST_MAX_SCALE = 2.5;
export const HUB_BOOST_BASE_BOOST_RATE = 3.5;
export const HUB_SMALL_SIZE_THRESHOLD = 5;
export const PULSE_AMPLITUDE = 0.1;

export interface OverlayFlagsContext {
  hubsOnly: boolean;
  cameraRatio: number;
  /** zoom LOD threshold — minimal 모드 2.4 / 일반 1.8. */
  lodHideRatio: number;
  recentPulseEnabled: boolean;
  /** sine phase (radian). 매 프레임 sin() 으로 size 변조. */
  pulsePhase: number;
}

/**
 * Hidden 결정 — true 면 caller 가 즉시 hidden:true 반환.
 *
 * 분기:
 *   - hubsOnly: 비허브 전체 hidden
 *   - LOD: 카메라 ratio > threshold + 비허브 hidden
 */
export function shouldHideNode(
  attrs: SigmaNodeAttrs,
  ctx: Pick<OverlayFlagsContext, 'hubsOnly' | 'cameraRatio' | 'lodHideRatio'>,
): boolean {
  if (ctx.hubsOnly && !attrs.isHub) return true;
  if (!attrs.isHub && ctx.cameraRatio > ctx.lodHideRatio) return true;
  return false;
}

/**
 * size 변조 — pulse + hub boost. 둘 다 size 만 변경 (color/border 안
 * 건드림). caller 가 결과를 그대로 다음 분기로 넘김.
 *
 * 적용 순서:
 *   1. recent pulse — recentlyUpdated 노드 sine 변조
 *   2. hub boost — 작은 허브 줌인 시 최대 2.5x
 */
export function applyOverlaySize(
  attrs: SigmaNodeAttrs,
  ctx: Pick<
    OverlayFlagsContext,
    'cameraRatio' | 'recentPulseEnabled' | 'pulsePhase'
  >,
): SigmaNodeAttrs {
  let next = attrs;

  // 1) recent pulse
  if (ctx.recentPulseEnabled && next.recentlyUpdated) {
    next = {
      ...next,
      size: next.size * (1 + PULSE_AMPLITUDE * Math.sin(ctx.pulsePhase)),
    };
  }

  // 2) hub size boost — 작은 허브 줌인 부스트
  if (next.isHub && next.size < HUB_SMALL_SIZE_THRESHOLD) {
    if (ctx.cameraRatio < HUB_BOOST_RATIO_THRESHOLD) {
      const boost =
        1 +
        (HUB_BOOST_RATIO_THRESHOLD - ctx.cameraRatio) *
          HUB_BOOST_BASE_BOOST_RATE;
      next = {
        ...next,
        size: next.size * Math.min(HUB_BOOST_MAX_SCALE, boost),
      };
    }
  }

  return next;
}
