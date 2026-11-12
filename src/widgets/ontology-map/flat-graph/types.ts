import type { Box, Point } from "../dial/types";

export interface FlatGraphLayoutTokens {
  capSpacing: number;
  domainClearance: number;
  clusterGap: number;
  hubClearance: number;
  aspect: number;
  elementPitch: number;
  elementHole: number;
  orphanPitch: number;
  flowWeight: number;
  anchorWeight: number;
  anchorReach: number;
  domainIterations: number;
  capabilityIterations: number;
  relaxRounds: number;
  titleDropPx: number;
  titleHalfPx: number;
}

export interface FlatGraphPaintTokens {
  projectDiscPx: number;
  projectCorePx: number;
  projectGlowPx: number;
  domainDiscPx: number;
  domainCorePx: number;
  domainGlowPx: number;
  domainRimPx: number;
  capDiscMinPx: number;
  capDiscGainPx: number;
  capDiscMaxPx: number;
  capCoreInsetPx: number;
  capCoreMinPx: number;
  capRimPx: number;
  capGlowPx: number;
  elementDotPx: number;
  growthMax: number;
  shrinkMin: number;
  glowAlpha: number;
  coreAlpha: number;
  linkDomainAlpha: number;
  linkCapAlpha: number;
  linkElementAlpha: number;
  linkCapWidthPx: number;
  linkElementWidthPx: number;
  lightAlpha: number;
  lightReach: number;
  arcBow: number;
  arcAlphaBase: number;
  arcAlphaGain: number;
  arcAlphaMax: number;
  arcWidthBasePx: number;
  arcWidthGain: number;
  arcWidthMaxPx: number;
  arcGlowPx: number;
  arcGlowAlpha: number;
  arcHeadPx: number;
  arcTrimPx: number;
  restBudget: number;
  sinkInk: number;
  dotSpacingFromPx: number;
  dotSpacingFullPx: number;
  elementNameSpacingPx: number;
  zoomStepsPerOctave: number;
  projectNamePx: number;
  domainNamePx: number;
  captionPx: number;
  capNamePx: number;
  elementNamePx: number;
  nameGapPx: number;
  captionGapPx: number;
  nameHaloPx: number;
  domainNameHaloPx: number;
  namePadPx: number;
  /** Share of a mark's hue at rest; the lit set paints at full hue. */
  restHue: number;
  selectedDiscPx: number;
  selectedRingGapPx: number;
  selectedRingPx: number;
  selectedNamePx: number;
  /** Air between the selected name block and a domain's name. */
  selectedTitleGapPx: number;
  /** Clearance a selection's framing keeps from every edge of the free map, the detail panel included. */
  frameMarginPx: number;
  /** Least air between a selection's ring and its domain disc that a selection's framing zooms in for. */
  selectedDiscGapPx: number;
  /** A backed name's backing: corner radius, padding around the glyphs, the ground's alpha in it, and the blur its edge fades over. */
  backingRadiusPx: number;
  backingPadXPx: number;
  backingPadYPx: number;
  backingAlpha: number;
  backingFeatherPx: number;
  lineBow: number;
  lineAlpha: number;
  lineTaperPx: number;
  lineHairPx: number;
  lineDotPx: number;
  lineDotGapPx: number;
  lineDoubleGapPx: number;
}

export interface FlatGraphInks {
  hues: readonly string[];
  project: string;
  discFill: string;
  arc: string;
  /** The lines from the concepts that need the selection. */
  reach: string;
  nameStrong: string;
  name: string;
  halo: string;
  warning: string;
}

export interface FlatGraphTokens {
  layout: FlatGraphLayoutTokens;
  paint: FlatGraphPaintTokens;
  inks: FlatGraphInks;
}

export interface FlatGraphItem {
  id: string;
  domainId: string;
  direct: boolean;
  elementIds: readonly string[];
}

export interface FlatGraphCluster {
  domainId: string;
  centre: Point;
  footprint: number;
  hue: number;
  items: readonly FlatGraphItem[];
}

export interface FlatGraphLayout {
  positions: ReadonlyMap<string, Point>;
  itemAt: ReadonlyMap<string, Point>;
  clusters: readonly FlatGraphCluster[];
  clusterByDomain: ReadonlyMap<string, FlatGraphCluster>;
  hueByDomain: ReadonlyMap<string, number>;
  orphanIds: readonly string[];
  extent: Box;
}

/** A domain's name and caption block under its disc, in screen px about the domain's centre. */
export interface FlatGraphTitle {
  halfWidthPx: number;
  topPx: number;
  bottomPx: number;
}

/**
 * Where the overview shows the graph: the screen area the fit fills, each domain's title block,
 * and the largest capability disc, so the layout can keep members off the titles at that scale.
 */
export interface FlatGraphFrame {
  areaPx: { width: number; height: number } | null;
  titles: ReadonlyMap<string, FlatGraphTitle>;
  capDiscPx: number;
}

export interface FlatGraphMemory {
  /** The font family the titles were measured in; a layout fitted to one face never pins another. */
  face: string;
  positions: ReadonlyMap<string, Point>;
  signatureByDomain: ReadonlyMap<string, string>;
  hueByDomain: ReadonlyMap<string, number>;
}

export interface FlatGraphPins {
  positions: ReadonlyMap<string, Point>;
  seeds: ReadonlyMap<string, Point>;
  hueByDomain: ReadonlyMap<string, number>;
}
