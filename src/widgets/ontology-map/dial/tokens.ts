import type { DialTokens } from "./types";

type NumericKey = Exclude<keyof DialTokens, "attendedNameInk">;

export const DIAL_TOKEN_SPECS: readonly { key: NumericKey; cssVar: string }[] = [
  { key: "pitch", cssVar: "--map-dial-pitch" },
  { key: "hubClearance", cssVar: "--map-dial-hub-clearance" },
  { key: "orphanPitch", cssVar: "--map-dial-orphan-pitch" },
  { key: "flowRestBase", cssVar: "--map-dial-flow-rest-base" },
  { key: "flowRestGain", cssVar: "--map-dial-flow-rest-gain" },
  { key: "flowRestMax", cssVar: "--map-dial-flow-rest-max" },
  { key: "flowFocusBase", cssVar: "--map-dial-flow-focus-base" },
  { key: "flowFocusGain", cssVar: "--map-dial-flow-focus-gain" },
  { key: "flowFocusMax", cssVar: "--map-dial-flow-focus-max" },
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
  { key: "pinMinPx", cssVar: "--map-dial-pin-min-px" },
  { key: "pinsMax", cssVar: "--map-dial-pins-max" },
  { key: "chordArrival", cssVar: "--map-dial-chord-arrival" },
  { key: "stubGapDeg", cssVar: "--map-dial-stub-gap-deg" },
  { key: "stubMinPx", cssVar: "--map-dial-stub-min-px" },
  { key: "stubMaxPx", cssVar: "--map-dial-stub-max-px" },
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
  { key: "spiralC", cssVar: "--map-dial-spiral-c" },
  { key: "spiralK0", cssVar: "--map-dial-spiral-k0" },
  { key: "elementRoom", cssVar: "--map-dial-element-room" },
  { key: "elementHole", cssVar: "--map-dial-element-hole" },
  { key: "angularGap", cssVar: "--map-dial-angular-gap" },
  { key: "ringGap", cssVar: "--map-dial-ring-gap" },
  { key: "capOnFrom", cssVar: "--map-dial-cap-on-from" },
  { key: "capOnFull", cssVar: "--map-dial-cap-on-full" },
  { key: "elementsAfterCapFrom", cssVar: "--map-dial-elements-after-cap-from" },
  { key: "elementsAfterCapFull", cssVar: "--map-dial-elements-after-cap-full" },
  { key: "elementOnFrom", cssVar: "--map-dial-element-on-from" },
  { key: "elementOnFull", cssVar: "--map-dial-element-on-full" },
  { key: "resolve", cssVar: "--map-dial-resolve" },
  { key: "resolveBudget", cssVar: "--map-dial-resolve-budget" },
  { key: "capName", cssVar: "--map-dial-cap-name" },
  { key: "elementName", cssVar: "--map-dial-element-name" },
  { key: "reachCap", cssVar: "--map-dial-reach-cap" },
  { key: "reachElement", cssVar: "--map-dial-reach-element" },
  { key: "restLinksMin", cssVar: "--map-dial-rest-links-min" },
  { key: "restLinksMax", cssVar: "--map-dial-rest-links-max" },
  { key: "restLinksPerEnd", cssVar: "--map-dial-rest-links-per-end" },
  { key: "perEndCap", cssVar: "--map-dial-per-end-cap" },
  { key: "perEndCapEnds", cssVar: "--map-dial-per-end-cap-ends" },
  { key: "stubFreeShare", cssVar: "--map-dial-stub-free-share" },
  { key: "labelScale", cssVar: "--map-dial-label-scale" },
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

let cached: { doc: Document; theme: string; tokens: DialTokens } | null = null;
let darkQuery: MediaQueryList | null = null;

function themeKey(): string {
  darkQuery ??= typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
  return `${document.documentElement.getAttribute("data-theme") ?? ""}|${darkQuery?.matches ? 1 : 0}`;
}

export function readDialTokens(): DialTokens {
  const theme = themeKey();
  if (cached && cached.doc === document && cached.theme === theme) return cached.tokens;
  const style = getComputedStyle(document.documentElement);
  const tokens = resolveDialTokens((v) => style.getPropertyValue(v));
  cached = { doc: document, theme, tokens };
  return tokens;
}
