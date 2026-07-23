/**
 * P0 공감형 샘플 vault (2026-07) — vault 미선택(static 모드)일 때 어떤
 * 내장 샘플을 보여줄지 고르는 사용자 선호. 2 값:
 *
 * - **dogfood** (기본) — 이 프로젝트 자신을 설명하는 vault (`docs/ontology/`).
 *   개발자·기존 사용자에게 익숙한 기본값을 유지한다.
 * - **storefront** — 비개발자(기획/마케팅/리더십)가 즉시 알아볼 수 있는
 *   예시 비즈니스("온라인 쇼핑몰", `samples/storefront/`). 첫 화면이 "이
 *   도구가 자기 자신을 설명"하는 문제(공감 실패)의 완화책.
 *
 * vault 가 로드되면(local 모드) 이 선택은 완전히 무시된다 — 사용자 디스크가
 * 항상 우선(`.claude/rules/architecture.md` 단일 진실원 원칙).
 */

export type SampleSource = 'dogfood' | 'storefront';

const SAMPLE_SOURCE_KEY = 'demo:sample-source:v1';

export function readSampleSourcePreference(): SampleSource {
  if (typeof window === 'undefined') return 'dogfood';
  try {
    const raw = window.localStorage.getItem(SAMPLE_SOURCE_KEY);
    return raw === 'storefront' ? 'storefront' : 'dogfood';
  } catch {
    // private mode 등 — 세션 내 기본값(dogfood)으로 안전하게 폴백.
    return 'dogfood';
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

// SSR / hydration 은 localStorage 가 없어 항상 dogfood 기준 — client 스냅샷과
// 첫 렌더가 일치해 mismatch 없음(선택이 storefront 면 hydration 직후 재렌더).
export function getSampleSourceServerSnapshot(): SampleSource {
  return 'dogfood';
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
