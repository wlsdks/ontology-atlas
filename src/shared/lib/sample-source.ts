/**
 * P0 공감형 샘플 vault (2026-07) — vault 미선택(static 모드)일 때 어떤
 * 내장 샘플을 보여줄지 고르는 사용자 선호. 2 값:
 *
 * - **storefront** (기본) — 비개발자(기획/마케팅/리더십)도 즉시 알아보는 예시
 *   비즈니스("온라인 쇼핑몰", `samples/storefront/`).
 * - **dogfood** — 이 앱을 만든 코드 자신을 설명하는 vault (`docs/ontology/`).
 *
 * ## 왜 storefront 가 기본인가 (2026-07-26 전환)
 *
 * dogfood 를 첫 화면에 두면 처음 온 사람이 `Dev Route Smoke` ·
 * `Resolve Write Target` · `Clean Next Dev Cache` 같은 이름부터 만난다. 투어가
 * "밝은 점을 눌러 보세요" 라고 안내하는 바로 그 자리다 — 이 도구가 자기와
 * 상관있는 물건인지 판단해야 하는 순간에, 남의 빌드 스크립트를 보게 된다.
 *
 * dogfood 의 설득력은 **존재한다는 사실**에서 온다("우리는 우리 자신을 우리
 * 형식으로 설명한다"). 기본 화면 자리에서 오는 게 아니다. 그래서 증명은 열어
 * 본 사람에게 주고, 이해는 모두에게 준다 — 한 클릭 뒤에 정직한 이름으로 둔다.
 *
 * vault 가 로드되면(local 모드) 이 선택은 완전히 무시된다 — 사용자 디스크가
 * 항상 우선(`.claude/rules/architecture.md` 단일 진실원 원칙).
 */

export type SampleSource = 'dogfood' | 'storefront';

const SAMPLE_SOURCE_KEY = 'demo:sample-source:v1';

export function readSampleSourcePreference(): SampleSource {
  if (typeof window === 'undefined') return 'storefront';
  try {
    const raw = window.localStorage.getItem(SAMPLE_SOURCE_KEY);
    // 명시 선택은 그대로 지킨다 — 기본값이 바뀌었다고 남이 고른 걸 되돌리지
    // 않는다. 저장된 값이 없을 때만(=고른 적 없을 때만) 새 기본값을 준다.
    return raw === 'dogfood' ? 'dogfood' : 'storefront';
  } catch {
    // private mode 등 — 세션 내 기본값으로 안전하게 폴백.
    return 'storefront';
  }
}

// ── 공유 반응 스토어 ──────────────────────────────────────────────
// 이 선호는 여러 컴포넌트가 동시에 소비한다: 첫 실행 카드의 세그먼트
// 컨트롤(쓰기)과 useOntologyInsight(읽기 → 토폴로지/INDEX/census). 각자
// 독립 useState 를 두면 카드에서 바꿔도 지도가 리로드 전까지 안 바뀐다
// (2026-07 실측 결함). 단일 모듈 스토어 + useSyncExternalStore 로 모든
// 소비자가 즉시 재렌더되게 한다. cross-tab storage 이벤트도 반영.
const listeners = new Set<() => void>();
let cachedSnapshot: SampleSource | null = null;

function handleStorageEvent(event: StorageEvent): void {
  if (event.key !== SAMPLE_SOURCE_KEY) return;
  cachedSnapshot = null;
  for (const listener of listeners) listener();
}

/**
 * 캐시만 버린다 — 다음 읽기가 저장소를 다시 본다.
 *
 * 테스트 격리용이다. `localStorage.removeItem` 만 하면 모듈 캐시가 앞 테스트의
 * 값을 들고 있어 격리가 새고, 그 상태로 통과하던 테스트는 **앞 테스트가 남긴
 * 값에 우연히 기대고** 있는 것이다(2026-07-26 기본값 전환에서 실제로 드러났다).
 * 저장소를 지웠으면 캐시도 같이 지운다.
 */
export function resetSampleSourceCacheForTests(): void {
  cachedSnapshot = null;
}

export function subscribeSampleSource(onChange: () => void): () => void {
  if (listeners.size === 0 && typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorageEvent);
  }
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && typeof window !== 'undefined') {
      window.removeEventListener('storage', handleStorageEvent);
    }
  };
}

export function getSampleSourceSnapshot(): SampleSource {
  if (cachedSnapshot == null) cachedSnapshot = readSampleSourcePreference();
  return cachedSnapshot;
}

// SSR / hydration 은 localStorage 가 없어 항상 **기본값** 기준 — 정적 export 로
// 미리 그려진 첫 화면이 곧 처음 온 사람이 보는 화면이라, 기본값과 같아야
// hydration 전후가 흔들리지 않는다(dogfood 를 고른 사람만 직후 재렌더).
export function getSampleSourceServerSnapshot(): SampleSource {
  return 'storefront';
}

export function writeSampleSourcePreference(source: SampleSource): void {
  cachedSnapshot = source;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(SAMPLE_SOURCE_KEY, source);
    } catch {
      /* private mode — skip 저장, 세션 동안 스토어 값으로만 유지 */
    }
  }
  for (const listener of listeners) listener();
}
