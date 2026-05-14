/**
 * 도메인 slug → tint color resolver. 같은 도메인 노드는 같은 hue 의 옅은 좌측
 * accent + background tint 으로 묶여 *시각 그룹* 을 형성. 디자인 헌장 §11 의
 * "단일 인디고" 약속 유지 — 모든 색이 indigo family (hue 220-260) 안에서만
 * saturation / lightness 미세 차이로 구분.
 *
 *  - 결정적 (deterministic): 같은 slug 는 항상 같은 색 (hash 기반)
 *  - 8 hue 사이클 — 8 도메인까지 시각 분리, 9 번째부터 collision OK (인접 hue)
 *  - dark canvas 가독: lightness 60-72, saturation 28-44 — pop 되되 노드 본문 안 가림
 */

/**
 * Indigo family 안에서 8 hue/light 변주.
 * hue 220 (cool blue) ~ 258 (purple-ish indigo) — 디자인 헌장 §11 단일 인디고 약속
 * 안에서 도메인 분간 가능한 최소 폭.
 */
const DOMAIN_HUES = [228, 240, 222, 250, 234, 258, 218, 246];

export interface DomainTint {
  /** 노드 좌측 accent bar 색 (4px). */
  accent: string;
  /** 노드 배경 옅은 tint. */
  bg: string;
}

/**
 * 단순 djb2-ish 문자열 hash. Math.random / Date 의존 X — 결정적.
 */
function hashSlug(slug: string): number {
  let h = 5381;
  for (let i = 0; i < slug.length; i += 1) {
    h = ((h << 5) + h + slug.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * 도메인 slug 가 null 이면 neutral tint (project / vault-readme 용 — 그룹화 안 함).
 */
export function resolveDomainTint(slug: string | null | undefined): DomainTint {
  if (!slug) {
    return {
      accent: "rgba(94, 106, 210, 0.32)",
      bg: "transparent",
    };
  }
  const hue = DOMAIN_HUES[hashSlug(slug) % DOMAIN_HUES.length];
  return {
    accent: `hsla(${hue}, 62%, 70%, 0.85)`,
    bg: `hsla(${hue}, 38%, 58%, 0.08)`,
  };
}
