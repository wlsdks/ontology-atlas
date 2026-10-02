import type { DialTokens } from "./types";

type NumericKey = Exclude<keyof DialTokens, "attendedNameInk">;

export const DIAL_TOKEN_SPECS: readonly { key: NumericKey; cssVar: string }[] = [
  { key: "ringMin", cssVar: "--map-dial-ring-min" },
  { key: "ringSingleRowMax", cssVar: "--map-dial-ring-single-row-max" },
  { key: "rowGap", cssVar: "--map-dial-row-gap" },
  { key: "pitch", cssVar: "--map-dial-pitch" },
  { key: "pitchMin", cssVar: "--map-dial-pitch-min" },
  { key: "pitchMax", cssVar: "--map-dial-pitch-max" },
  { key: "rowsMax", cssVar: "--map-dial-rows-max" },
  { key: "sectorGap", cssVar: "--map-dial-sector-gap" },
  { key: "chipSlots", cssVar: "--map-dial-chip-slots" },
  { key: "hubClearance", cssVar: "--map-dial-hub-clearance" },
  { key: "elementStart", cssVar: "--map-dial-element-start" },
  { key: "elementPitch", cssVar: "--map-dial-element-pitch" },
  { key: "orphanGap", cssVar: "--map-dial-orphan-gap" },
  { key: "orphanPitch", cssVar: "--map-dial-orphan-pitch" },
  { key: "orphanRow", cssVar: "--map-dial-orphan-row" },
  { key: "chordHubMargin", cssVar: "--map-dial-chord-hub-margin" },
  { key: "chordDepth", cssVar: "--map-dial-chord-depth" },
  { key: "chordBow", cssVar: "--map-dial-chord-bow" },
  { key: "flowRestBase", cssVar: "--map-dial-flow-rest-base" },
  { key: "flowRestGain", cssVar: "--map-dial-flow-rest-gain" },
  { key: "flowRestMax", cssVar: "--map-dial-flow-rest-max" },
  { key: "flowFocusBase", cssVar: "--map-dial-flow-focus-base" },
  { key: "flowFocusGain", cssVar: "--map-dial-flow-focus-gain" },
  { key: "flowFocusMax", cssVar: "--map-dial-flow-focus-max" },
  { key: "flowQuietRatio", cssVar: "--map-dial-flow-quiet-ratio" },
  { key: "flowTaper", cssVar: "--map-dial-flow-taper" },
  { key: "flowSplitPx", cssVar: "--map-dial-flow-split-px" },
  { key: "flowHeadBasePx", cssVar: "--map-dial-flow-head-base-px" },
  { key: "flowHeadGain", cssVar: "--map-dial-flow-head-gain" },
  { key: "flowTrimStartPx", cssVar: "--map-dial-flow-trim-start-px" },
  { key: "flowTrimEndPx", cssVar: "--map-dial-flow-trim-end-px" },
  { key: "numeralSize", cssVar: "--map-dial-numeral-size" },
  { key: "numeralHaloPx", cssVar: "--map-dial-numeral-halo-px" },
  { key: "numeralGapPx", cssVar: "--map-dial-numeral-gap-px" },
  { key: "restNumbersShare", cssVar: "--map-dial-rest-numbers-share" },
  { key: "restNumbersMin", cssVar: "--map-dial-rest-numbers-min" },
  { key: "restNumbersMax", cssVar: "--map-dial-rest-numbers-max" },
  { key: "restNumberMinCount", cssVar: "--map-dial-rest-number-min-count" },
  { key: "restStrongMin", cssVar: "--map-dial-rest-strong-min" },
  { key: "restStrongMax", cssVar: "--map-dial-rest-strong-max" },
  { key: "stubEnterRatio", cssVar: "--map-dial-stub-enter-ratio" },
  { key: "stubFullRatio", cssVar: "--map-dial-stub-full-ratio" },
  { key: "namesRatio", cssVar: "--map-dial-names-ratio" },
  { key: "namePitchPx", cssVar: "--map-dial-name-pitch-px" },
  { key: "pinMinPx", cssVar: "--map-dial-pin-min-px" },
  { key: "pinsMax", cssVar: "--map-dial-pins-max" },
  { key: "chordArrival", cssVar: "--map-dial-chord-arrival" },
  { key: "stubGapDeg", cssVar: "--map-dial-stub-gap-deg" },
  { key: "stubMinPx", cssVar: "--map-dial-stub-min-px" },
  { key: "stubMaxPx", cssVar: "--map-dial-stub-max-px" },
  { key: "stubRingShare", cssVar: "--map-dial-stub-ring-share" },
  { key: "stubShortShare", cssVar: "--map-dial-stub-short-share" },
  { key: "discMinPx", cssVar: "--map-dial-disc-min-px" },
  { key: "discMaxPx", cssVar: "--map-dial-disc-max-px" },
  { key: "discPitchShare", cssVar: "--map-dial-disc-pitch-share" },
  { key: "discCapShare", cssVar: "--map-dial-disc-cap-share" },
  { key: "discGlyphPx", cssVar: "--map-dial-disc-glyph-px" },
  { key: "chipMinPx", cssVar: "--map-dial-chip-min-px" },
  { key: "chipMaxPx", cssVar: "--map-dial-chip-max-px" },
  { key: "hubMinPx", cssVar: "--map-dial-hub-min-px" },
  { key: "hubMaxPx", cssVar: "--map-dial-hub-max-px" },
  { key: "nameMaxPx", cssVar: "--map-dial-name-max-px" },
  { key: "ledgerRowPx", cssVar: "--map-dial-ledger-row-px" },
  { key: "ledgerGapPx", cssVar: "--map-dial-ledger-gap-px" },
];

const ATTENDED_NAME_INK = "--map-panel-text-primary";

export function resolveDialTokens(get: (cssVar: string) => string): DialTokens {
  const missing: string[] = [];
  const out = {} as Record<string, number | string>;
  for (const { key, cssVar } of DIAL_TOKEN_SPECS) {
    const raw = get(cssVar).trim();
    const value = Number(raw);
    if (!raw || !Number.isFinite(value)) missing.push(cssVar);
    out[key] = value;
  }
  const ink = get(ATTENDED_NAME_INK).trim();
  if (!ink) missing.push(ATTENDED_NAME_INK);
  out.attendedNameInk = ink;
  if (missing.length) throw new Error(`Dial token drift: missing/empty ${missing.join(", ")}`);
  return out as unknown as DialTokens;
}

let cached: { doc: Document; tokens: DialTokens } | null = null;

export function readDialTokens(): DialTokens {
  if (cached && cached.doc === document) return cached.tokens;
  const style = getComputedStyle(document.documentElement);
  const tokens = resolveDialTokens((v) => style.getPropertyValue(v));
  cached = { doc: document, tokens };
  return tokens;
}
