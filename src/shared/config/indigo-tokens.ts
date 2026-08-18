/**
 * 인디고 단일 진실원 (JS-only).
 *
 * 디자인 헌장 (CLAUDE.md §11) — "단일 인디고 (`#5e6ad2`)" 라는 시스템 약속을
 * 코드에서 흩뿌리지 않게 한 곳에 모음. CSS variable (`--color-indigo-*`) 가
 * 닿지 않는 영역 (Sigma WebGL renderer, Canvas API, OpenGraph 이미지) 에서
 * 같은 hex 를 가져다 쓰도록.
 *
 * Tailwind arbitrary value (`bg-[color:rgba(94,106,210,0.x)]`) 사이트는 이
 * 모듈을 import 하지 않는다 — 빌드 타임 문자열 매칭이라 런타임 const 참조
 * 불가. 그 사이트들은 동일한 RGB triplet (`94,106,210` = `#5e6ad2`) 을 쓰는
 * 한 일관성 보장.
 *
 * 6 variant 의 hue 는 모두 chroma ≤ 8% 검증됨 (LCH 좌표 기준 — `OWNER_TONE_
 * PALETTE` 와 동일 제약). variant 명은 hex 순이 아닌 **용도 (purpose)** 기준:
 *   brand     — canonical 채색 (Linear-base 단일 인디고)
 *   accent    — 강조 텍스트 / strong button
 *   hover     — hover state (좀 더 vivid)
 *   hub       — Sigma 허브 노드 fill (brand 보다 살짝 lighter)
 *   focus     — 포커스 시 1-hop hub 톤
 *   highlight — 선택 노드 / context highlight (가장 lighter)
 */

export const INDIGO_BRAND = "#c14a24";
export const INDIGO_ACCENT = "#f0894e";
export const INDIGO_HOVER = "#f5a06b";
export const INDIGO_HUB = "#c7613f";
export const INDIGO_FOCUS = "#da714e";
export const INDIGO_HIGHLIGHT = "#f27f59";

/**
 * RGB triplet — `rgba()` 합성에 사용. `indigoRgba(variant, alpha)` 헬퍼가
 * 우선이지만, 인라인 합성이 필요할 때를 위해 노출.
 */
export const INDIGO_RGB = {
  brand: "193, 74, 36",
  accent: "240, 137, 78",
  hover: "245, 160, 107",
  hub: "199, 97, 63",
  focus: "218, 113, 78",
  highlight: "242, 127, 89",
} as const;

export type IndigoVariant = keyof typeof INDIGO_RGB;

/**
 * `rgba()` 문자열 합성. Sigma reducer / SVG fill / Canvas paint 등 alpha 가
 * 필요한 사이트에서.
 *
 * @example
 *   indigoRgba("highlight", 0.95) // "rgba(139, 151, 255, 0.95)"
 */
export function indigoRgba(variant: IndigoVariant, alpha: number): string {
  return `rgba(${INDIGO_RGB[variant]}, ${alpha})`;
}
