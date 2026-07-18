/**
 * Feature flags — local-first 토글만 (원칙: `.claude/rules/local-first.md`,
 * 서버/빌드 플래그 서비스 도입 금지). 각 플래그는 `localStorage` 키 또는
 * URL 쿼리 파라미터로 켠다. 기본값은 항상 `false` — 신규 표면은 opt-in.
 *
 * `docs/TOPOLOGY-V2-DESIGN.md` §4: `topology-map-v2` 는 `TopologyMapV2`
 * (canvas-2D 단일 렌더 엔진, P2~P6) 로 지도/그래프 두 옛 엔진을
 * 대체하는 strangler 전환의 게이트. **2026-07-18 P6 기본값 전환 완료** —
 * 기본 `true`, `?mapEngine=legacy` / localStorage `"false"` 가 탈출구.
 * 구엔진 물리 삭제가 끝나면 이 플래그 자체를 제거한다.
 */

export interface FeatureFlagSource {
  /** `location.search` 대체값 — 테스트에서 실제 `window.location` 없이 검증. */
  search?: string;
  /** `localStorage.getItem` 대체 — 테스트/SSR 안전. 기본은 실제 `window.localStorage`. */
  getLocalStorageItem?: (key: string) => string | null;
}

const TOPOLOGY_MAP_V2_STORAGE_KEY = "atlas:feature:topology-map-v2";
const TOPOLOGY_MAP_V2_QUERY_PARAM = "mapEngine";
const TOPOLOGY_MAP_V2_QUERY_VALUE = "v2";

function readLocationSearch(source?: FeatureFlagSource): string {
  if (source?.search !== undefined) return source.search;
  if (typeof window === "undefined") return "";
  try {
    return window.location.search;
  } catch {
    return "";
  }
}

function readLocalStorageItem(key: string, source?: FeatureFlagSource): string | null {
  if (source?.getLocalStorageItem) return source.getLocalStorageItem(key);
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    // privacy mode / disabled storage — 조용히 off 로 취급.
    return null;
  }
}

const TOPOLOGY_MAP_V2_QUERY_LEGACY_VALUE = "legacy";

/**
 * `topology-map-v2` 플래그 — **기본 `true`** (P6 기본값 전환, 소유자 지시
 * 2026-07-18 "예전 캔버스 싹 지워줘 — 리로드하면 예전 게 보임"). 켜지면
 * `/topology` 지도·그래프 탭과 프로젝트 상세 이웃 지도가 전부
 * `TopologyMapV2` (canvas-2D 단일 엔진) 로 렌더된다.
 *
 * 우선순위 (탈출구는 구엔진 물리 삭제 전까지의 안전핀):
 * 1. URL 쿼리 `?mapEngine=v2` → 강제 on / `?mapEngine=legacy` → 강제 off
 * 2. `localStorage["atlas:feature:topology-map-v2"]` — `"false"` 면 off,
 *    그 외(미설정·`"true"`) 는 on
 *
 * SSR/static export 프리렌더도 이제 기본 `true` 와 일치한다 — 예전 기본
 * `false` 시절에는 서버 스냅샷(off) → 클라이언트 재확인(on) 순서 때문에
 * 리로드마다 구캔버스가 한 프레임 먼저 마운트되는 플래시가 있었다
 * (소유자 "가끔 리로딩할때 예전게 보임"). 기본 on 이면 첫 렌더부터 v2 라
 * 플래시가 사라진다 (legacy 탈출구 사용자만 반대 방향 플래시를 겪는다 —
 * 안전핀에는 허용).
 */
export function isTopologyMapV2Enabled(source?: FeatureFlagSource): boolean {
  const search = readLocationSearch(source);
  if (search) {
    try {
      const params = new URLSearchParams(search);
      const value = params.get(TOPOLOGY_MAP_V2_QUERY_PARAM);
      if (value === TOPOLOGY_MAP_V2_QUERY_VALUE) return true;
      if (value === TOPOLOGY_MAP_V2_QUERY_LEGACY_VALUE) return false;
    } catch {
      // malformed query string — URL 파라미터 무시하고 localStorage 로 폴백.
    }
  }
  return readLocalStorageItem(TOPOLOGY_MAP_V2_STORAGE_KEY, source) !== "false";
}
