/**
 * 방위(bearing/relation) × 초점 노드 kind → 그 소켓이 후보로 허용하는 기존 노드
 * kind 집합 (C12 ①). 피커 검색 결과와 발견 표면(추천/둘러보기) BOTH 이 하나의
 * 진실원으로 이 필터를 강제한다 — 예전에는 relation 만 보고(초점 kind 무시)
 * `contains` 후보에 domain 이 섞여 나오는 등 계층에 안 맞는 후보가 노출됐다.
 *
 * 계층(위→아래): project(0) → domain(1) → capability(2) → element(3).
 * 각 방위의 의미에 맞춰 "같은/한 단계 이웃" 창(window)으로 좁힌다:
 *
 *   isA (상위개념/broader)  — 자기와 같거나 한 단계 위(컨테이너) kind
 *     project→∅ · domain→{domain} · capability→{capability,domain} ·
 *     element→{element,capability}
 *   dependsOn (기대는 곳)    — 런타임/행위 의존은 역량·요소로 수렴
 *     (모든 초점)→{capability,element}
 *   contains (담는 것)       — 한 단계 아래(자식) kind
 *     project→{domain} · domain→{capability,element} · capability→{element} ·
 *     element→{element}
 *   relates (비슷한 것)      — 같은 kind + 한 단계 아래(대체/보완) — 컨테이너로
 *     거슬러 올라가지 않는다(비슷함은 상향 포함이 아님)
 *     project→{project} · domain→{domain} · capability→{capability,element} ·
 *     element→{element,capability}
 *
 * `document`/`unknown` 같은 코어 밖 kind 는 어떤 창에도 들지 않아 자연히 제외된다
 * (근거 문서/미해석 stub 을 관계 후보로 밀지 않는다). 항상 Set 을 반환하므로
 * (null 폴백 없음) 피커·발견 표면 두 소비자가 동일 규칙을 적용한다.
 */

import type { StudioRelation } from "./build-studio-item";

type KindSet = ReadonlySet<string>;

const EMPTY: KindSet = new Set();

/** relation → (초점 kind → 허용 kind 집합). 표에 없는 초점 kind 는 빈 집합. */
const MATRIX: Record<StudioRelation, Record<string, KindSet>> = {
  isA: {
    project: EMPTY,
    domain: new Set(["domain"]),
    capability: new Set(["capability", "domain"]),
    element: new Set(["element", "capability"]),
  },
  dependsOn: {
    project: new Set(["capability", "element"]),
    domain: new Set(["capability", "element"]),
    capability: new Set(["capability", "element"]),
    element: new Set(["capability", "element"]),
  },
  contains: {
    project: new Set(["domain"]),
    domain: new Set(["capability", "element"]),
    capability: new Set(["element"]),
    element: new Set(["element"]),
  },
  relates: {
    project: new Set(["project"]),
    domain: new Set(["domain"]),
    capability: new Set(["capability", "element"]),
    element: new Set(["element", "capability"]),
  },
};

/**
 * 이 소켓(방위 + 초점 kind)이 후보로 허용하는 기존 노드 kind 집합. 초점 kind 를
 * 모르면(고립 렌더/테스트) relation 별 합집합으로 폭넓게 허용한다.
 */
export function allowedKindsFor(
  relation: StudioRelation,
  focalKind: string | null | undefined,
): KindSet {
  const perKind = MATRIX[relation];
  if (focalKind && focalKind in perKind) return perKind[focalKind];
  // 초점 kind 미상 → 그 relation 이 어느 초점에서든 허용하는 kind 의 합집합.
  const union = new Set<string>();
  for (const set of Object.values(perKind)) for (const k of set) union.add(k);
  return union;
}

/** 후보 kind 가 이 소켓에 허용되는가 (피커·발견 표면 공용 술어). */
export function kindAllowedFor(
  relation: StudioRelation,
  focalKind: string | null | undefined,
  candidateKind: string,
): boolean {
  return allowedKindsFor(relation, focalKind).has(candidateKind);
}
