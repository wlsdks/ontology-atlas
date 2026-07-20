/**
 * Shared `getTopologyV2Tokens()` wrapper for the UI layer — swallows
 * `TopologyV2TokenError` into a console error + `null` so per-frame/per-event
 * callers can bail out safely on token drift instead of crashing the canvas.
 */

import { getTopologyV2Tokens, TopologyV2TokenError, type TopologyV2Tokens } from "../tokens/read-topology-v2-tokens";

// 재검 마찰 E — 같은 drift 메시지를 프레임마다 반복 출력하지 않는다
// (재마운트 직후 CSS 적용 전의 조기 읽기가 세션당 1,200+회 스팸을 만들던
// 실증). 메시지 단위 1회 로그 — 새 종류의 drift 는 여전히 보인다.
const loggedDriftMessages = new Set<string>();

export function readTopologyV2TokensOrNull(): TopologyV2Tokens | null {
  try {
    return getTopologyV2Tokens();
  } catch (err) {
    if (err instanceof TopologyV2TokenError && !loggedDriftMessages.has(err.message)) {
      loggedDriftMessages.add(err.message);
      console.error("[topology-map-v2] token drift:", err.message);
    }
    return null;
  }
}
