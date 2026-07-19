import { INDIGO_HIGHLIGHT, indigoRgba } from '@/shared/config/indigo-tokens';

/**
 * DocsVaultFolderTopology 전용 색 계산.
 *
 * Sigma 는 WebGL 캔버스라 alpha 합성이 브라우저/webview 조합에 따라 신뢰할
 * 수 없다 — 저-알파 rgba 를 그대로 넘기면 사실상 안 보이거나 렌더러마다
 * 다르게 보인다 (memory: "WebGL 알파 결함" — dim 은 hidden 또는 불투명 톤만).
 * 그래서 Sigma settings / node·edge attrs 로 넘기는 모든 색은 **불투명**
 * 이어야 한다. 이 모듈은 `--color-*` 토큰을 실제 캔버스 배경 위에
 * alpha-composite 해서 불투명 `rgb()` 문자열로 만든다.
 */

export interface FolderTopologyColors {
  /** Sigma label 색 — 텍스트로서 읽혀야 하므로 이미 불투명인
   *  `--color-text-secondary` 를 그대로 쓴다 (블렌딩 불필요). */
  label: string;
  /** 기본 엣지 톤 — 인디고 틴트, 캔버스 위에서 뚜렷이 보이는 불투명 회색. */
  edgeDefault: string;
  /** hover 로 다른 노드가 강조될 때 나머지 엣지의 dim 톤 — 여전히 보여야 함. */
  edgeDim: string;
  /** hover/selected 엣지 강조 톤. */
  edgeHighlight: string;
  /** hover 로 다른 노드가 강조될 때 나머지 노드의 dim 톤. */
  nodeDim: string;
  /** hover 노드의 border 강조 색 (인디고, 테마 무관 — 브랜드 색은 원래 불투명). */
  hoverBorder: string;
}

interface ParsedColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

function parseColor(input: string): ParsedColor | null {
  const s = input.trim();
  const hexMatch = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map((c) => c + c)
        .join('');
    }
    const num = parseInt(hex, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255, a: 1 };
  }
  const rgbMatch =
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(
      s,
    );
  if (rgbMatch) {
    return {
      r: Number(rgbMatch[1]),
      g: Number(rgbMatch[2]),
      b: Number(rgbMatch[3]),
      a: rgbMatch[4] !== undefined ? Number(rgbMatch[4]) : 1,
    };
  }
  return null;
}

/**
 * `overlay` (alpha 있을 수 있음) 를 불투명 `background` 위에 합성해 불투명
 * `rgb()` 문자열로 반환. 파싱 실패 시 background(있으면) 로 안전하게 폴백.
 */
export function blendOverBackground(overlay: string, background: string): string {
  const fg = parseColor(overlay);
  const bg = parseColor(background);
  if (!fg || !bg) return background || overlay;
  const a = Math.max(0, Math.min(1, fg.a));
  const r = Math.round(fg.r * a + bg.r * (1 - a));
  const g = Math.round(fg.g * a + bg.g * (1 - a));
  const b = Math.round(fg.b * a + bg.b * (1 - a));
  return `rgb(${r}, ${g}, ${b})`;
}

function readVar(
  styles: Pick<CSSStyleDeclaration, 'getPropertyValue'>,
  name: string,
  fallback: string,
): string {
  const value = styles.getPropertyValue(name).trim();
  return value || fallback;
}

let cacheKey: string | null = null;
let cachedColors: FolderTopologyColors | null = null;

/** 테스트 전용 — 모듈 레벨 resolve-cache 리셋. */
export function __resetFolderTopologyColorCache(): void {
  cacheKey = null;
  cachedColors = null;
}

/**
 * 현재 `--color-*` 토큰 기준 Sigma 색 팔레트를 계산. `getComputedStyle` 로
 * 읽은 토큰 조합이 이전 호출과 같으면 캐시된 참조를 그대로 반환 — 매
 * reducer 호출마다 다시 계산하지 않도록 (다크 단일이라 mount 시 1회 호출로
 * 충분, 캐시는 안전망).
 */
export function resolveFolderTopologyColors(
  root: HTMLElement = document.documentElement,
): FolderTopologyColors {
  const styles = getComputedStyle(root);
  const canvas = readVar(styles, '--color-canvas', '#08090a');
  const textSecondary = readVar(styles, '--color-text-secondary', '#d0d6e0');
  const quaternaryHex = readVar(styles, '--color-text-quaternary', '#787c84');

  const key = `${canvas}|${textSecondary}|${quaternaryHex}`;
  if (cachedColors && cacheKey === key) return cachedColors;

  const quaternary = parseColor(quaternaryHex) ?? { r: 120, g: 124, b: 132, a: 1 };
  const neutralInkRgb = `${quaternary.r}, ${quaternary.g}, ${quaternary.b}`;

  const colors: FolderTopologyColors = {
    label: textSecondary,
    edgeDefault: blendOverBackground(indigoRgba('highlight', 0.42), canvas),
    edgeDim: blendOverBackground(`rgba(${neutralInkRgb}, 0.2)`, canvas),
    edgeHighlight: blendOverBackground(indigoRgba('highlight', 0.94), canvas),
    nodeDim: blendOverBackground(`rgba(${neutralInkRgb}, 0.42)`, canvas),
    // 브랜드 인디고는 이미 불투명 hex — 블렌딩 불필요, 테마 무관 단일 색.
    hoverBorder: INDIGO_HIGHLIGHT,
  };

  cacheKey = key;
  cachedColors = colors;
  return colors;
}

/**
 * `slug` 로부터 결정론적 pseudo-random jitter 를 만든다. `Math.random()` 을
 * 대체 — 같은 vault 는 매 마운트마다 같은 배치로 렌더돼야 재현 가능
 * (B2+ deterministic-skeleton 원칙). djb2 계열 해시 → [0,1) 정규화 → 요청
 * spread 로 스케일.
 *
 * @returns `[-spread/2, spread/2)` 범위의 값.
 */
export function hashJitter(seed: string, spread: number): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 33) ^ seed.charCodeAt(i);
  }
  const normalized = (h >>> 0) / 4294967296; // uint32 → [0, 1)
  return (normalized - 0.5) * spread;
}
