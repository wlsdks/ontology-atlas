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

export function writeSampleSourcePreference(source: SampleSource): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SAMPLE_SOURCE_KEY, source);
  } catch {
    /* private mode — skip, 세션 동안만 React 상태로 유지 */
  }
}
