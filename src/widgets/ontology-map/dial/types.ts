import type { DirectedDomainFlow } from "../model/containment-tree";

export type DialKind = "project" | "domain" | "capability" | "element";
export type DialEvidence = "current" | "stale" | "unknown";
export interface Point { x: number; y: number }
export interface Box { minX: number; minY: number; maxX: number; maxY: number }
export interface Pad { left: number; right: number; top: number; bottom: number }
export interface DialLabels { units(capabilities: number, elements: number): string; stale(count: number): string; orphans(count: number): string; more(count: number): string }
export interface DialTokens {
  ringMin: number;
  ringSingleRowMax: number;
  rowGap: number;
  pitch: number;
  pitchMin: number;
  pitchMax: number;
  rowsMax: number;
  sectorGap: number;
  chipSlots: number;
  hubClearance: number;
  elementStart: number;
  elementPitch: number;
  orphanGap: number;
  orphanPitch: number;
  orphanRow: number;
  chordHubMargin: number;
  chordDepth: number;
  chordBow: number;
  flowRestBase: number;
  flowRestGain: number;
  flowRestMax: number;
  flowFocusBase: number;
  flowFocusGain: number;
  flowFocusMax: number;
  flowQuietRatio: number;
  flowTaper: number;
  flowSplitPx: number;
  flowHeadBasePx: number;
  flowHeadGain: number;
  flowTrimStartPx: number;
  flowTrimEndPx: number;
  numeralSize: number;
  numeralHaloPx: number;
  numeralGapPx: number;
  restNumbersShare: number;
  restNumbersMin: number;
  restNumbersMax: number;
  restNumberMinCount: number;
  restStrongMin: number;
  restStrongMax: number;
  stubEnterRatio: number;
  stubFullRatio: number;
  namesRatio: number;
  namePitchPx: number;
  pinMinPx: number;
  pinsMax: number;
  chordArrival: number;
  stubGapDeg: number;
  stubMinPx: number;
  stubMaxPx: number;
  stubRingShare: number;
  stubShortShare: number;
  discMinPx: number;
  discMaxPx: number;
  discPitchShare: number;
  discCapShare: number;
  discGlyphPx: number;
  chipMinPx: number;
  chipMaxPx: number;
  hubMinPx: number;
  hubMaxPx: number;
  nameMaxPx: number;
  ledgerRowPx: number;
  ledgerGapPx: number;
  attendedNameInk: string;
}

export interface DialDomain { id: string; label: string; capabilityIds: string[]; directElementIds: string[]; elementCount: number }
export interface DialCapability { id: string; label: string; domainId: string; elementIds: string[]; needsAcross: number; usedAcross: number }
export interface DialCapabilityDependency { from: string; to: string; fromDomain: string; toDomain: string }
export interface DialModel {
  projectId: string | null; projectLabel: string;
  domains: DialDomain[]; domainById: ReadonlyMap<string, DialDomain>; capabilityById: ReadonlyMap<string, DialCapability>;
  domainOf: ReadonlyMap<string, string | null>; capabilityOf: ReadonlyMap<string, string>;
  flows: DirectedDomainFlow[]; flowByKey: ReadonlyMap<string, DirectedDomainFlow>;
  capabilityDependencies: DialCapabilityDependency[]; orphanIds: string[];
}
export interface DialEvidenceView { measured: boolean; stateOf(id: string): DialEvidence; staleByDomain: ReadonlyMap<string, number> }
export interface DialAttention { key: string; domainId: string | null; capabilityId: string | null; needsCaps: ReadonlySet<string>; usedByCaps: ReadonlySet<string>; partnerDomains: ReadonlySet<string>; selected: boolean }

export interface DialPetal { id: string; angle: number; radius: number; row: number; direct: boolean; elementIds: string[] }
export interface DialSector { domainId: string; angle: number; start: number; end: number; chip: Point; rows: number; petals: DialPetal[] }
export interface DialScene { order: string[]; ringRadius: number; outerRadius: number; pitch: number; rowGap: number; hubClearance: number; sectors: DialSector[]; sectorByDomain: ReadonlyMap<string, DialSector>; petalById: ReadonlyMap<string, DialPetal>; orphans: string[]; positions: ReadonlyMap<string, Point>; controls: ReadonlyMap<string, Point>; extent: Box }
export interface DialWorld { model: DialModel; scene: DialScene; overviewPadPx: Pad }
export interface DialWorldInput { labels: DialLabels | null; tokens: DialTokens; measureText: (text: string, font: string) => number; rememberOrder: boolean }

export interface StripMark { flowKey: string; role: "chord" | "stub" | "relates"; ink: number; ax: number; ay: number; cx: number; cy: number; bx: number; by: number; w0: number; w1: number; gapT0: number; gapT1: number; dashed: boolean; headStart: boolean; headEnd: boolean; headSize: number }
export interface DiscMark { id: string; x: number; y: number; r: number; fill: number; rim: number; dashed: boolean; lineWidth: number }
export interface SquareMark { id: string | null; x: number; y: number; half: number; fill: number; rim: number }
export interface TickMark { ink: number; x0: number; y0: number; x1: number; y1: number }
export interface RailMark { ink: number; cx: number; cy: number; r: number; a0: number; a1: number }
export interface GlyphMark { id: string; kind: DialKind; x: number; y: number; r: number; egoState: "center" | "neighbor" | "dim" | "normal"; fill: string | null; stroke: string | null; hovered: boolean; agentFocus: boolean; selectionPulse: { scaleFactor: number; alpha: number } | null; count: string | null; stalePip: boolean }
export type TextRole = "project" | "domain" | "units" | "capability" | "stub" | "ledger" | "more" | "orphans";
export interface TextMark { id: string | null; role: TextRole; text: string; x: number; y: number; align: CanvasTextAlign; font: string; ink: number; box: Box; parts: { text: string; ink: number }[] | null }
export interface NumeralMark { flowKey: string; text: string; x: number; y: number; ink: number; halo: boolean; font: string; box: Box }
export interface LeaderMark { id: string; x0: number; y0: number; x1: number; y1: number; ink: number }
export interface DialMarks { inks: string[]; strips: StripMark[]; discs: DiscMark[]; squares: SquareMark[]; ticks: TickMark[]; rails: RailMark[]; glyphs: GlyphMark[]; texts: TextMark[]; numerals: NumeralMark[]; leaders: LeaderMark[] }
export interface DialPick { id: string; x: number; y: number; r: number }
export interface DialRowPick { id: string; box: Box }
export interface DialChordLight { key: string; sourceDomain: string; targetDomain: string; a: Point; c: Point; b: Point; widthPx: number; chipRadiusPx: number }
export interface DialLightFrame { attentionKey: string; focused: boolean; inkMix: number; chords: DialChordLight[] }

export interface DialOwnershipInput { hasDial: boolean; galaxyOn: boolean; realmActive: boolean; edgeSelected: boolean; edgePreviewed: boolean; trailLensOpen: boolean; spotlightActive: boolean; pathLensActive: boolean; focusedIsElement: boolean }
export interface DialFrameInput {
  ctx: CanvasRenderingContext2D; dial: DialWorld; worldKey: object;
  nodeScreen(id: string): Point | null; toScreen(x: number, y: number): Point; scale: number; labelScale: number; zoomRatio: number;
  viewportWidth: number; viewportHeight: number; freeRect: Box;
  mapTokens: import("../tokens/read-map-tokens").OntologyMapTokens; dialTokens: DialTokens; labels: DialLabels | null; evidence: ReadonlyMap<string, DialEvidence> | null;
  hoveredNodeId: string | null; focusedNodeId: string | null; agentFocusNodeId: string | null;
  selectionPulse: { nodeId: string; scaleFactor: number; alpha: number } | null; appearOf(id: string): number; hubCount: string | null;
  now: number; reducedMotion: boolean; domainAppear: number;
}
export interface DialFrameResult {
  drawnCount: number; tier: "circuit" | "element"; alphas: ReadonlyMap<string, number>; picks: DialPick[]; rows: DialRowPick[];
  labelBoxes: { nodeId: string; text: string; minX: number; minY: number; maxX: number; maxY: number }[];
  light: DialLightFrame; inkMix: number; chordPresence: number; marks: DialMarks;
}
export interface DialProbe {
  owns: boolean; zoomRatio: number; tier: "circuit" | "element"; inkMix: number; domainAppear: number; freeRect: Box;
  flows: { key: string; a: string; b: string; ab: number; ba: number; total: number; relatesOnly: boolean; drawn: boolean; widthPx: number; numeral: string | null }[];
  sectors: { domainId: string; chip: Point; capabilityIds: string[] }[];
  texts: { id: string | null; role: TextRole; text: string; box: Box }[];
  numerals: { flowKey: string; text: string; box: Box }[];
  discs: DialPick[]; strips: { flowKey: string; role: StripMark["role"]; ink: string }[];
  ledger: { domainId: string; shown: number; total: number; more: number; leaderCrossings: number } | null;
  crossings: number; namesCrossed: number; textOverlaps: number;
}
