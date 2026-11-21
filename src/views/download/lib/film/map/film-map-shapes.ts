import type { Pt, Rect } from '../film-geometry';
import type { FilmLabel, LabelSegment, Measure } from './film-map-labels';
import type { FilmMarkTokens, FilmSizes } from './film-map-sizes';
import type { FilmConcept, FilmReach, FilmVault } from '../film-vault';

export interface FilmMark {
  id: string;
  kind: FilmConcept['kind'];
  x: number;
  y: number;
  r: number;
  domain: string | null;
}

export interface FilmCluster {
  id: string;
  x: number;
  y: number;
  footprint: number;
  nameBlock: Rect;
}

export interface FilmArc {
  from: string;
  to: string;
  count: number;
  pts: Pt[];
  width: number;
  /** Where its count stands; null where no clear spot exists on the arc, which then carries none. */
  numeral: Pt | null;
}

export type LitKind = 'needs' | 'neededBy' | 'relates' | 'own';

export interface FilmLitLine {
  end: string;
  kind: LitKind;
  /** From the pick outward, whatever the line's direction; `towardPick` says which way it reads. */
  pts: Pt[];
  width: number;
  towardPick: boolean;
}

export interface FilmLit {
  pick: string;
  reach: FilmReach;
  selectedR: number;
  rings: [number, number];
  agentR: number;
  ownDots: Map<string, Pt>;
  lines: FilmLitLine[];
  ends: string[];
  /** Capabilities that hold an element end: back to 0.6 ink so the dot has an owner. */
  owners: string[];
  labels: FilmLabel[];
  leader: { from: Pt; to: Pt } | null;
  pointer: Pt;
  pointerBox: Rect;
  keys: { x: number; y: number; ink: 'project' | 'agent' }[];
}

export interface FilmMapLayout {
  sizes: FilmSizes;
  w: number;
  h: number;
  titleBox: Rect;
  captionBox: Rect;
  order: string[];
  marks: Map<string, FilmMark>;
  clusters: FilmCluster[];
  stems: { from: string; to: string; alpha: number }[];
  restArcs: FilmArc[];
  restLabels: FilmLabel[];
  lit: FilmLit | null;
  pick: string | null;
  capRadius: (elements: number) => number;
}

export interface FilmCopy {
  units: (capabilities: number, elements: number) => string;
  reach: (needs: number, neededBy: number) => LabelSegment[];
  agent: string;
  tool: string;
}

export interface FilmLayoutInput {
  vault: FilmVault;
  pick: string | null;
  w: number;
  h: number;
  locale: string;
  title: Rect;
  /** The union of every act's headline, act 4's second line and the act bar. */
  caption: Rect;
  measure: Measure;
  sans: string;
  mono: string;
  tokens: FilmMarkTokens;
  copy: FilmCopy;
}
