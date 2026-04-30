'use client';

import { useEffect } from 'react';
import type Sigma from 'sigma';
import type { SigmaEdgeAttrs, SigmaNodeAttrs } from './graph-build';

const PARAM_KEY = 'cam';
const DEBOUNCE_MS = 400;
const DEFAULT_EPS = 0.01;

/**
 * 카메라 상태(`x,y,ratio`) 를 URL `?cam=` 쿼리에 동기화.
 * - mount 시 URL 에 값이 있으면 카메라 setState 로 복원.
 * - 카메라 'updated' 이벤트를 debounce 400ms 로 받아 `history.replaceState` 로
 *   쿼리만 갱신 (라우팅 없이).
 * - default state(0.5/0.5/1) 근처면 파라미터 제거해 URL 깔끔 유지.
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
      const cam = params.get(PARAM_KEY);
      if (cam) {
        const [xs, ys, rs] = cam.split(',');
        const x = Number(xs);
        const y = Number(ys);
        const r = Number(rs);
        if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(r)) {
          camera.setState({ x, y, ratio: r, angle: 0 });
        }
      }
    } catch {
      /* URL 파싱 실패 무시 */
    }

    // Push: 카메라 변경 → debounce → URL 갱신.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const writeUrl = () => {
      if (typeof window === 'undefined') return;
      const state = camera.getState();
      const params = new URLSearchParams(window.location.search);
      const isDefault =
        Math.abs(state.x - 0.5) < DEFAULT_EPS &&
        Math.abs(state.y - 0.5) < DEFAULT_EPS &&
        Math.abs(state.ratio - 1) < DEFAULT_EPS;
      if (isDefault) {
        params.delete(PARAM_KEY);
      } else {
        params.set(
          PARAM_KEY,
          [
            state.x.toFixed(3),
            state.y.toFixed(3),
            state.ratio.toFixed(3),
          ].join(','),
        );
      }
      const next = params.toString();
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
