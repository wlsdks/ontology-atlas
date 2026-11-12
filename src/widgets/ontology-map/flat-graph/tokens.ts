import type { FlatGraphInks, FlatGraphLayoutTokens, FlatGraphPaintTokens, FlatGraphTokens } from "./types";

const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

const LAYOUT_KEYS: readonly (keyof FlatGraphLayoutTokens)[] = [
  "capSpacing", "domainClearance", "clusterGap", "hubClearance", "aspect", "elementPitch", "elementHole", "orphanPitch",
  "flowWeight", "anchorWeight", "anchorReach", "domainIterations", "capabilityIterations", "relaxRounds", "titleDropPx", "titleHalfPx",
];

const PAINT_KEYS: readonly (keyof FlatGraphPaintTokens)[] = [
  "projectDiscPx", "projectCorePx", "projectGlowPx", "domainDiscPx", "domainCorePx", "domainGlowPx", "domainRimPx",
  "capDiscMinPx", "capDiscGainPx", "capDiscMaxPx", "capCoreInsetPx", "capCoreMinPx", "capRimPx", "capGlowPx", "elementDotPx",
  "growthMax", "shrinkMin", "glowAlpha", "coreAlpha", "linkDomainAlpha", "linkCapAlpha", "linkElementAlpha", "linkCapWidthPx",
  "linkElementWidthPx", "lightAlpha", "lightReach", "arcBow", "arcAlphaBase", "arcAlphaGain", "arcAlphaMax", "arcWidthBasePx",
  "arcWidthGain", "arcWidthMaxPx", "arcGlowPx", "arcGlowAlpha", "arcHeadPx", "arcTrimPx", "restBudget", "sinkInk",
  "dotSpacingFromPx", "dotSpacingFullPx", "elementNameSpacingPx", "zoomStepsPerOctave", "projectNamePx", "domainNamePx",
  "captionPx", "capNamePx", "elementNamePx", "nameGapPx", "captionGapPx", "nameHaloPx", "domainNameHaloPx", "namePadPx",
  "restHue", "selectedDiscPx", "selectedRingGapPx", "selectedRingPx", "selectedNamePx", "selectedTitleGapPx", "frameMarginPx", "selectedDiscGapPx", "selectZoomMaxRatio", "backingRadiusPx", "backingPadXPx", "backingPadYPx", "backingAlpha", "backingFeatherPx", "lineBow", "lineAlpha", "lineTaperPx",
  "lineTaperGainPx", "lineTaperMaxPx", "lineHairPx", "lineDotPx", "lineDotGapPx", "lineDoubleGapPx",
];

/** CSS custom property names, derived from the keys so a renamed key and its token move together. */
export const FLAT_GRAPH_LAYOUT_VARS = LAYOUT_KEYS.map((key) => ({ key, cssVar: `--map-graph-${kebab(key)}` }));
export const FLAT_GRAPH_PAINT_VARS = PAINT_KEYS.map((key) => ({ key, cssVar: `--map-graph-${kebab(key)}` }));
/** Spelled out: Tailwind emits an `@theme` variable only when a scanned source names it. */
export const DOMAIN_HUE_VARS = [
  "--color-domain-1-rgb", "--color-domain-2-rgb", "--color-domain-3-rgb", "--color-domain-4-rgb",
  "--color-domain-5-rgb", "--color-domain-6-rgb", "--color-domain-7-rgb", "--color-domain-8-rgb",
] as const;

const INK_VARS: readonly { key: Exclude<keyof FlatGraphInks, "hues">; cssVar: string }[] = [
  { key: "project", cssVar: "--map-graph-project" },
  { key: "discFill", cssVar: "--map-graph-disc-fill" },
  { key: "arc", cssVar: "--map-graph-arc" },
  { key: "reach", cssVar: "--map-graph-reach" },
  { key: "nameStrong", cssVar: "--map-graph-name-strong" },
  { key: "name", cssVar: "--map-graph-name" },
  { key: "halo", cssVar: "--map-graph-halo" },
  { key: "warning", cssVar: "--color-status-warning" },
];

function rgbTriple(raw: string): string | null {
  const parts = raw.trim().split(/\s+/).map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const hex = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
  return `#${hex(parts[0]!)}${hex(parts[1]!)}${hex(parts[2]!)}`;
}

export function resolveFlatGraphTokens(get: (cssVar: string) => string): FlatGraphTokens {
  const missing: string[] = [];
  const numbers = <K extends string>(specs: readonly { key: K; cssVar: string }[]) => {
    const out = {} as Record<K, number>;
    for (const { key, cssVar } of specs) {
      const raw = get(cssVar).trim();
      const value = Number(raw);
      if (!raw || !Number.isFinite(value)) missing.push(cssVar);
      out[key] = value;
    }
    return out;
  };
  const layout = numbers(FLAT_GRAPH_LAYOUT_VARS) as FlatGraphLayoutTokens;
  const paint = numbers(FLAT_GRAPH_PAINT_VARS) as FlatGraphPaintTokens;
  const hues = DOMAIN_HUE_VARS.map((cssVar) => {
    const hex = rgbTriple(get(cssVar));
    if (hex === null) missing.push(cssVar);
    return hex ?? "";
  });
  const inks = { hues } as unknown as FlatGraphInks;
  for (const { key, cssVar } of INK_VARS) {
    const ink = get(cssVar).trim();
    if (!ink) missing.push(cssVar);
    inks[key] = ink;
  }
  if (missing.length > 0) throw new Error(`Flat graph token drift: missing/empty ${missing.join(", ")}`);
  return { layout, paint, inks };
}

let cached: { doc: Document; tokens: FlatGraphTokens } | null = null;

export function readFlatGraphTokens(): FlatGraphTokens {
  if (cached && cached.doc === document) return cached.tokens;
  const style = getComputedStyle(document.documentElement);
  const tokens = resolveFlatGraphTokens((v) => style.getPropertyValue(v));
  cached = { doc: document, tokens };
  return tokens;
}
