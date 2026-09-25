/**
 * The hex board's material, read from `app/globals.css` (the `--map-hex-*` block plus the
 * shared inks it borrows). Canvas 2D cannot read CSS variables, so the view resolves them once
 * per paint through `getComputedStyle`; an empty value throws, like the map's own token reader
 * (`read-map-tokens.ts`), so a deleted or mistyped token is never absorbed by a fallback.
 */

export interface HexBoardTokens {
  face: readonly string[];
  faceStale: readonly string[];
  faceDomain: readonly [string, string];
  faceSelected: readonly [string, string];
  faceProject: readonly [string, string];
  riser: string;
  rim: string;
  rimDomain: string;
  rimSelected: string;
  rimUnknown: string;
  hatch: string;
  bevel: readonly [string, string, string];
  plate: string;
  plateFocus: string;
  plateStroke: string;
  moat: string;
  glow: string;
  accent: string;
  canal: string;
  canalHead: string;
  inkMeta: string;
  dimAlpha: number;
  dimFarAlpha: number;
  /** Borrowed: the product's one warning hue marks stale; its text step writes stale words. */
  stale: string;
  staleInk: string;
  /** Borrowed: pale indigo for used-by, the brand indigo for halos, the hub's warm rim. */
  usedBy: string;
  indigo: string;
  indigoBright: string;
  hub: string;
  hubHairline: string;
  ink: string;
  inkHi: string;
  inkDim: string;
  canvas: string;
  /** The map's own ground, so the board sits on the same floor as every other view. */
  ground: string;
}

const VARS = {
  face: ["--map-hex-face-0", "--map-hex-face-1", "--map-hex-face-2", "--map-hex-face-3", "--map-hex-face-4"],
  faceStale: [
    "--map-hex-face-stale-0",
    "--map-hex-face-stale-1",
    "--map-hex-face-stale-2",
    "--map-hex-face-stale-3",
    "--map-hex-face-stale-4",
  ],
  faceDomain: ["--map-hex-face-domain-top", "--map-hex-face-domain-bottom"],
  faceSelected: ["--map-hex-face-selected-top", "--map-hex-face-selected-bottom"],
  faceProject: ["--map-hex-face-project-top", "--map-hex-face-project-bottom"],
  riser: "--map-hex-riser",
  rim: "--map-hex-rim",
  rimDomain: "--map-hex-rim-domain",
  rimSelected: "--map-hex-rim-selected",
  rimUnknown: "--map-hex-rim-unknown",
  hatch: "--map-hex-hatch",
  bevel: ["--map-hex-bevel-light", "--map-hex-bevel-mid", "--map-hex-bevel-shade"],
  plate: "--map-hex-plate",
  plateFocus: "--map-hex-plate-focus",
  plateStroke: "--map-hex-plate-stroke",
  moat: "--map-hex-moat",
  glow: "--map-hex-glow",
  accent: "--map-hex-accent",
  canal: "--map-hex-canal",
  canalHead: "--map-hex-canal-head",
  inkMeta: "--map-hex-ink-meta",
  dimAlpha: "--map-hex-dim-alpha",
  dimFarAlpha: "--map-hex-dim-far-alpha",
  stale: "--color-status-warning",
  staleInk: "--color-amber-source-text-a95",
  usedBy: "--map-edge-selected",
  indigo: "--map-indigo",
  indigoBright: "--map-indigo-bright",
  hub: "--map-amber-hub",
  hubHairline: "--map-project-hairline-inner",
  ink: "--color-text-secondary",
  inkHi: "--color-text-primary",
  inkDim: "--color-text-quaternary",
  canvas: "--color-canvas",
  ground: "--map-canvas-bg-near",
} as const;

class HexBoardTokenError extends Error {
  constructor(readonly missing: readonly string[]) {
    super(`Hex board token drift: missing/empty ${missing.join(", ")}`);
    this.name = "HexBoardTokenError";
  }
}

/** Resolve every token from a `getPropertyValue`; throws when any is empty. */
function resolveHexBoardTokens(get: (cssVar: string) => string): HexBoardTokens {
  const missing: string[] = [];
  const one = (v: string) => {
    const raw = get(v).trim();
    if (!raw) missing.push(v);
    return raw;
  };
  const many = (vs: readonly string[]) => vs.map(one);
  const out = {
    face: many(VARS.face),
    faceStale: many(VARS.faceStale),
    faceDomain: many(VARS.faceDomain) as unknown as [string, string],
    faceSelected: many(VARS.faceSelected) as unknown as [string, string],
    faceProject: many(VARS.faceProject) as unknown as [string, string],
    riser: one(VARS.riser),
    rim: one(VARS.rim),
    rimDomain: one(VARS.rimDomain),
    rimSelected: one(VARS.rimSelected),
    rimUnknown: one(VARS.rimUnknown),
    hatch: one(VARS.hatch),
    bevel: many(VARS.bevel) as unknown as [string, string, string],
    plate: one(VARS.plate),
    plateFocus: one(VARS.plateFocus),
    plateStroke: one(VARS.plateStroke),
    moat: one(VARS.moat),
    glow: one(VARS.glow),
    accent: one(VARS.accent),
    canal: one(VARS.canal),
    canalHead: one(VARS.canalHead),
    inkMeta: one(VARS.inkMeta),
    dimAlpha: Number(one(VARS.dimAlpha)),
    dimFarAlpha: Number(one(VARS.dimFarAlpha)),
    stale: one(VARS.stale),
    staleInk: one(VARS.staleInk),
    usedBy: one(VARS.usedBy),
    indigo: one(VARS.indigo),
    indigoBright: one(VARS.indigoBright),
    hub: one(VARS.hub),
    hubHairline: one(VARS.hubHairline),
    ink: one(VARS.ink),
    inkHi: one(VARS.inkHi),
    inkDim: one(VARS.inkDim),
    canvas: one(VARS.canvas),
    ground: one(VARS.ground),
  };
  if (missing.length) throw new HexBoardTokenError(missing);
  return out;
}

let cached: { key: string; tokens: HexBoardTokens } | null = null;

/** Read from the document, or null outside a browser or when a token is missing (logged once). */
export function readHexBoardTokensOrNull(): HexBoardTokens | null {
  if (typeof window === "undefined") return null;
  const style = getComputedStyle(document.documentElement);
  // One cheap probe decides whether the stylesheet changed since the last full read.
  const key = `${style.getPropertyValue("--map-hex-face-4")}|${style.getPropertyValue("--map-hex-accent")}`;
  if (cached && cached.key === key) return cached.tokens;
  try {
    const tokens = resolveHexBoardTokens((v) => style.getPropertyValue(v));
    cached = { key, tokens };
    return tokens;
  } catch (err) {
    if (err instanceof HexBoardTokenError) console.error("[hex-board]", err.message);
    return null;
  }
}
