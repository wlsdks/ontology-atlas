export interface FilmMarkTokens {
  domainDiscPx: number;
  domainCorePx: number;
  domainRimPx: number;
  projectDiscPx: number;
  projectCorePx: number;
  capDiscMinPx: number;
  capDiscGainPx: number;
  capDiscMaxPx: number;
  capRimPx: number;
  capCoreInsetPx: number;
  capCoreMinPx: number;
  elementDotPx: number;
  selectedDiscPx: number;
  selectedRingGapPx: number;
  selectedRingPx: number;
  lineTaperPx: number;
  lineTaperGainPx: number;
  lineTaperMaxPx: number;
  lineDotPx: number;
  lineDotGapPx: number;
  lightAlpha: number;
  lightReach: number;
  restHue: number;
  /** The film's mark growth over the product's sizes (`--map-graph-film-growth`). */
  growth: number;
  /** Ink share kept by unrelated clusters while lit (`--map-graph-film-sink`). */
  sink: number;
}

export interface FilmSizes {
  wide: boolean;
  s: number;
  K: number;
  safe: number;
  domainR: number;
  domainCore: number;
  domainRim: number;
  projectR: number;
  projectCore: number;
  capRim: number;
  elemR: number;
  rings: [number, number, number];
  elemGap: number;
  elemAlt: number;
  fDomain: number;
  fUnits: number;
  fProject: number;
  fCap: number;
  fPick: number;
  fReach: number;
  fTag: number;
  fNumeral: number;
  numeralR: number;
}

export const WIDE_PX = 720;

/** `fit` draws a cluster's rings closer on a stage too small for their full spread; names keep their size. */
export function filmSizes(w: number, h: number, tokens: FilmMarkTokens, fit = 1): FilmSizes {
  const wide = w >= WIDE_PX;
  const s = Math.min(1, Math.max(0.74, Math.min(w / 1920, h / 960)));
  const K = wide ? tokens.growth * s : 0.84;
  const D = wide ? K : 0.8;
  return {
    wide,
    s,
    K,
    safe: wide ? 32 : 16,
    domainR: tokens.domainDiscPx * D,
    domainCore: tokens.domainCorePx * D,
    domainRim: tokens.domainRimPx * D,
    projectR: tokens.projectDiscPx * D,
    projectCore: tokens.projectCorePx * D,
    capRim: tokens.capRimPx * K,
    elemR: wide ? tokens.elementDotPx * K : Math.max(1.5, tokens.elementDotPx * K),
    rings: wide ? [86 * s * fit, 122 * s * fit, 156 * s * fit] : [38, 54, 70],
    elemGap: wide ? 10 * s : 6,
    elemAlt: wide ? 7 * s : 5,
    fDomain: wide ? Math.max(22, 26 * s) : 15,
    fUnits: wide ? 15 : 13,
    fProject: wide ? Math.max(17, 20 * s) : 14,
    fCap: wide ? 15 : 13,
    fPick: wide ? Math.max(18, 21 * s) : 15,
    fReach: wide ? 15 : 13,
    fTag: wide ? 15 : 13,
    fNumeral: wide ? 15 : 13,
    numeralR: wide ? 11 : 10,
  };
}

/** How far a lit capability's agent ring, its element dots and their gap reach from its centre. */
export function litReach(sizes: FilmSizes, markRadius: number): number {
  return Math.max(markRadius, 11 * sizes.K) + 11 * sizes.K + 5 + sizes.elemAlt + sizes.elemR * 2;
}

/** Capabilities are named at rest only on a stage this wide; a smaller one keeps the domains and the project. */
export const REST_NAMES_PX = 1400;
