/**
 * 도메인 slug → tint color resolver. 같은 도메인 노드는 같은 hue 의 좌측 accent +
 * background tint 로 묶여 *시각 그룹* 을 형성한다.
 *
 * Ontology kind 색상(project/domain/capability/element)은 의미 역할을 말하고,
 * domain tint 는 소유/어휘 경계를 말한다. 둘 다 범주형 데이터라 한 hue ramp가
 * 아니라 qualitative palette 를 쓴다.
 */

interface DomainTone {
  hueName: string;
  hue: number;
  accentSaturation: number;
  accentLightness: number;
  bgSaturation: number;
  bgLightness: number;
}

const DOMAIN_TONES: readonly DomainTone[] = [
  {
    hueName: "blue",
    hue: 210,
    accentSaturation: 76,
    accentLightness: 68,
    bgSaturation: 52,
    bgLightness: 46,
  },
  {
    hueName: "violet",
    hue: 268,
    accentSaturation: 78,
    accentLightness: 70,
    bgSaturation: 48,
    bgLightness: 48,
  },
  {
    hueName: "amber",
    hue: 42,
    accentSaturation: 82,
    accentLightness: 66,
    bgSaturation: 52,
    bgLightness: 44,
  },
  {
    hueName: "emerald",
    hue: 152,
    accentSaturation: 70,
    accentLightness: 64,
    bgSaturation: 46,
    bgLightness: 40,
  },
  {
    hueName: "rose",
    hue: 336,
    accentSaturation: 76,
    accentLightness: 68,
    bgSaturation: 48,
    bgLightness: 44,
  },
  {
    hueName: "cyan",
    hue: 188,
    accentSaturation: 74,
    accentLightness: 66,
    bgSaturation: 48,
    bgLightness: 42,
  },
  {
    hueName: "lime",
    hue: 96,
    accentSaturation: 68,
    accentLightness: 64,
    bgSaturation: 44,
    bgLightness: 38,
  },
  {
    hueName: "orange",
    hue: 24,
    accentSaturation: 78,
    accentLightness: 66,
    bgSaturation: 50,
    bgLightness: 42,
  },
];

const DOGFOOD_DOMAIN_TONE_INDEX: Record<string, number> = {
  "ai-agent-partner": 0,
  "mode-aware-adapters": 1,
  "onboarding-ux": 2,
  "ontology-core": 3,
  "vault-local-first": 4,
  views: 6,
};

export interface DomainTint {
  /** 노드 좌측 accent bar 색 (4px). */
  accent: string;
  /** 노드 배경 옅은 tint. */
  bg: string;
  /** 테스트와 legend copy 에서 쓰는 qualitative hue 이름. */
  hueName: string;
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
      hueName: "neutral",
    };
  }
  const tone = DOMAIN_TONES[
    DOGFOOD_DOMAIN_TONE_INDEX[slug] ?? hashSlug(slug) % DOMAIN_TONES.length
  ];
  return {
    accent: `hsla(${tone.hue}, ${tone.accentSaturation}%, ${tone.accentLightness}%, 0.88)`,
    bg: `hsla(${tone.hue}, ${tone.bgSaturation}%, ${tone.bgLightness}%, 0.12)`,
    hueName: tone.hueName,
  };
}
