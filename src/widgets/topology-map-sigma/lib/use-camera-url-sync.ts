'use client';

import { useEffect } from 'react';
import type Sigma from 'sigma';
import type { SigmaEdgeAttrs, SigmaNodeAttrs } from './graph-build';

const PARAM_KEY = 'cam';
const DEBOUNCE_MS = 600;
const DEFAULT_EPS = 0.01;

/**
 * `?cam=x,y,ratio` 쿼리 값을 카메라 상태로 파싱. 손상/공유 URL 에 안전하도록
 * 유한성 + ratio 양수를 검증한다. ratio 가 0/음수면 Sigma 카메라가 무한 줌/
 * 반전으로 깨지므로 무시(null) — 공유·북마크된 URL 이 망가져도 뷰가 안 깨진다.
 */
export function parseCameraParam(
  cam: string | null,
): { x: number; y: number; ratio: number } | null {
  if (!cam) return null;
  const [xs, ys, rs] = cam.split(',');
  const x = Number(xs);
  const y = Number(ys);
  const ratio = Number(rs);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(ratio)) {
    return null;
  }
  if (ratio <= 0) return null;
  return { x, y, ratio };
}

/**
 * 카메라 상태(`x,y,ratio`) 를 URL `?cam=` 쿼리에 동기화.
 * - mount 시 URL 에 값이 있으면 카메라 setState 로 복원.
 * - 카메라 'updated' 이벤트를 debounce 600ms 로 받아 `history.replaceState` 로
 *   쿼리만 갱신 (라우팅 없이).
 * - default state(0.5/0.5/1) 근처면 파라미터 제거해 URL 깔끔 유지.
 * - **자체 dedupe**: 현재 URL 의 cam 값과 동일하면 replaceState 호출 자체 생략.
 *   d3-force 정착 직전 sub-pixel jitter 가 .toFixed(3) 라운딩에서
 *   0.382 ↔ 0.383 처럼 핑퐁할 때 history 가 무한 갱신되던 문제 차단.
 *   effect 재진입 (StrictMode dev double-mount 등) 시에도 URL 자체와 비교라
 *   상태 영속.
 */
export function useCameraUrlSync(
  sigma: Sigma<SigmaNodeAttrs, SigmaEdgeAttrs> | null,
): void {
  useEffect(() => {
    if (!sigma) return;
    const camera = sigma.getCamera();

    // Pull: URL 의 cam 을 카메라 상태로 1회 복원.
    try {
      const params = new URLSearchParams(window.location.search);
      const parsed = parseCameraParam(params.get(PARAM_KEY));
      if (parsed) {
        camera.setState({ ...parsed, angle: 0 });
      }
    } catch {
      /* URL 파싱 실패 무시 */
    }

    // Push: 카메라 변경 → debounce → URL 갱신.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const writeUrl = () => {
      if (typeof window === 'undefined') return;
      const state = camera.getState();
      const isDefault =
        Math.abs(state.x - 0.5) < DEFAULT_EPS &&
        Math.abs(state.y - 0.5) < DEFAULT_EPS &&
        Math.abs(state.ratio - 1) < DEFAULT_EPS;
      const camValue = isDefault
        ? null
        : [
            state.x.toFixed(3),
            state.y.toFixed(3),
            state.ratio.toFixed(3),
          ].join(',');
      // dedupe vs current URL — 같은 값이면 replaceState 호출 자체 생략.
      const currentParams = new URLSearchParams(window.location.search);
      const currentCam = currentParams.get(PARAM_KEY);
      if (camValue === currentCam) return;
      if (camValue) currentParams.set(PARAM_KEY, camValue);
      else currentParams.delete(PARAM_KEY);
      const next = currentParams.toString();
      const url = next
        ? `${window.location.pathname}?${next}`
        : window.location.pathname;
      window.history.replaceState({}, '', url);
    };
    const onUpdated = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(writeUrl, DEBOUNCE_MS);
    };
    camera.on('updated', onUpdated);
    return () => {
      camera.off('updated', onUpdated);
      if (timer) clearTimeout(timer);
    };
  }, [sigma]);
}
