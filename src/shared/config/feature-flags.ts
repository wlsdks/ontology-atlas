/**
 * Feature flags — local-first 토글만 (원칙: `.claude/rules/local-first.md`,
 * 서버/빌드 플래그 서비스 도입 금지). 각 플래그는 `localStorage` 키 또는
 * URL 쿼리 파라미터로 켠다. 기본값은 항상 `false` — 신규 표면은 opt-in.
 *
 * `docs/TOPOLOGY-V2-DESIGN.md` §4: `topology-map-v2` 는 `TopologyMapV2`
 * (canvas-2D 단일 렌더 엔진, P2~P6) 로 지도/그래프 두 옛 엔진을
 * 대체하는 strangler 전환의 게이트. P6 에서 기본값 `true` 전환 커밋 하나로
 * 뒤집는다 — 그 전까지는 이 파일이 유일한 on/off 스위치.
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

/**
 * `topology-map-v2` 플래그 — 켜지면 `/topology` 지도·그래프 탭과 프로젝트
 * 상세 이웃 지도가 전부 `TopologyMapV2` (canvas-2D 단일 엔진) 로 렌더된다.
 * `localStorage["atlas:feature:topology-map-v2"] === "true"` 또는
 * URL 쿼리 `?mapEngine=v2` 둘 중 하나만 참이면 켜짐. 기본 `false`.
 *
 * SSR/static export (`output: 'export'`) 빌드 중에는 `window` 가 없으므로
 * 항상 `false` — 클라이언트 hydration 이후에만 의미를 가진다(local-first
 * 원칙: 서버가 플래그를 결정하지 않는다).
 */
export function isTopologyMapV2Enabled(source?: FeatureFlagSource): boolean {
  const search = readLocationSearch(source);
  if (search) {
    try {
      const params = new URLSearchParams(search);
      if (params.get(TOPOLOGY_MAP_V2_QUERY_PARAM) === TOPOLOGY_MAP_V2_QUERY_VALUE) {
        return true;
      }
    } catch {
      // malformed query string — URL 파라미터 무시하고 localStorage 로 폴백.
    }
  }
  return readLocalStorageItem(TOPOLOGY_MAP_V2_STORAGE_KEY, source) === "true";
}
