/** Neural's numbers and inks; `-Px` are CSS pixels at the front of the cloud. */
export interface NeuralTokens {
  capPx: number; capGainPx: number; elementPx: number; elementGainPx: number; domainPx: number; projectPx: number;
  nucleusShare: number; nucleusAlpha: number; ringGapPx: number; ringPx: number;
  glowReach: number; glowAlpha: number; farAlpha: number; clusterGlowAlpha: number; clusterGlowPadPx: number;
  axonAlpha: number; tractAlpha: number; axonCapPx: number; axonElementPx: number; axonEndPx: number; axonDotPx: number;
  axonBow: number; tractPull: number; tractGain: number;
  veil: number; axonVeil: number; titleVeil: number; zoomGrowMax: number; titlePinPx: number;
  litStartPx: number; litEndPx: number; litAlpha: number; litGlowPx: number; litDotPx: number;
  signalPx: number; signalGlowPx: number; focusRingGapPx: number; focusRingPx: number;
  domainNamePx: number; domainMetaPx: number; domainNameGapPx: number; domainMetaGapPx: number;
  namePx: number; nameGapPx: number; nameHaloPx: number; nameBudget: number; platePadPx: number; plateRadiusPx: number;
  /** A selection's dependents light at these strengths: distance 1, distance 2, and distance 3 and more. */
  impactNear: number; impactMid: number; impactFar: number;
  /** `--motion-expressive`: one signal's travel along a lit axon, and one hop of a selection's spread. */
  signalMs: number;
  /** `--motion-choreography`: the longest a selection's whole spread may take. */
  spreadMs: number;
  inks: {
    strong: string; name: string; arc: string; reach: string; project: string; warning: string; ground: string; halo: string; plate: string;
  };
}

type NumberKey = Exclude<keyof NeuralTokens, "inks" | "signalMs" | "spreadMs">;

const NUMBER_KEYS: readonly NumberKey[] = [
  "capPx", "capGainPx", "elementPx", "elementGainPx", "domainPx", "projectPx", "nucleusShare", "nucleusAlpha", "ringGapPx", "ringPx",
  "glowReach", "glowAlpha", "farAlpha", "clusterGlowAlpha", "clusterGlowPadPx", "axonAlpha", "tractAlpha", "axonCapPx", "axonElementPx",
  "axonEndPx", "axonDotPx", "axonBow", "tractPull", "tractGain", "veil", "axonVeil", "titleVeil", "zoomGrowMax", "titlePinPx", "litStartPx", "litEndPx", "litAlpha", "litGlowPx",
  "litDotPx", "signalPx", "signalGlowPx", "focusRingGapPx", "focusRingPx", "domainNamePx", "domainMetaPx", "domainNameGapPx",
  "domainMetaGapPx", "namePx", "nameGapPx", "nameHaloPx", "nameBudget", "platePadPx", "plateRadiusPx",
  "impactNear", "impactMid", "impactFar",
];

/** `capGainPx` → `--map-neural-cap-gain-px`. */
const cssVarOf = (key: string) => `--map-neural-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

/** Spelled out: Tailwind emits an `@theme` variable only when a scanned source names it. */
const INK_VARS: readonly { key: keyof NeuralTokens["inks"]; cssVar: string }[] = [
  { key: "strong", cssVar: "--map-graph-name-strong" },
  { key: "name", cssVar: "--map-graph-name" },
  { key: "arc", cssVar: "--map-graph-arc" },
  { key: "reach", cssVar: "--map-graph-reach" },
  { key: "project", cssVar: "--map-graph-project" },
  { key: "warning", cssVar: "--color-status-warning" },
  { key: "ground", cssVar: "--map-canvas-bg-near" },
  { key: "halo", cssVar: "--map-graph-halo" },
  { key: "plate", cssVar: "--map-graph-disc-fill" },
];

/**
 * Reads every Neural token from the document; a missing or non-numeric one throws, never falls back.
 * It reads the stylesheet on each call, so a caller reads once per mount.
 */
export function readNeuralTokens(): NeuralTokens {
  const style = getComputedStyle(document.documentElement);
  const missing: string[] = [];
  const numbers = {} as Record<NumberKey, number>;
  for (const key of NUMBER_KEYS) {
    const raw = style.getPropertyValue(cssVarOf(key)).trim();
    const value = Number(raw);
    if (!raw || !Number.isFinite(value)) missing.push(cssVarOf(key));
    numbers[key] = value;
  }
  const inks = {} as NeuralTokens["inks"];
  for (const { key, cssVar } of INK_VARS) {
    const ink = style.getPropertyValue(cssVar).trim();
    if (!ink) missing.push(cssVar);
    inks[key] = ink;
  }
  const durationMs = (cssVar: string) => {
    const raw = style.getPropertyValue(cssVar).trim();
    const ms = raw.endsWith("ms") ? Number(raw.slice(0, -2)) : Number(raw.replace(/s$/, "")) * 1000;
    if (!Number.isFinite(ms) || ms <= 0) missing.push(cssVar);
    return ms;
  };
  const signalMs = durationMs("--motion-expressive");
  const spreadMs = durationMs("--motion-choreography");
  if (missing.length > 0) throw new Error(`Neural tokens missing: ${missing.join(", ")}`);
  return { ...numbers, signalMs, spreadMs, inks };
}
