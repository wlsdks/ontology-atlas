import type { ReactNode } from 'react';

export type ArrivalPhase = 'rest' | 'arriving' | 'arrived';

import type { SentenceEdge } from '../../model/edge-sentences';
import type { ArchitectureGraph as Graph, GraphBoxShape } from '../../model/graph-layout';
import type { RoleLedger } from '../../model/role-ledger';

/** Which way the chain runs: a seven-role row cannot fit a column, while the same roles laid downward are 148 wide. */
export type FlowAxis = 'across' | 'down';

export interface Placed {
  id: string;
  x: number;
  y: number;
  shape: GraphBoxShape;
}

/** The one empty state of the measured lane: a column on the ladder, a band under an across row. */
export interface EmptyPanel {
  key: string;
  layout: 'column' | 'band';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ArchitectureSketchProps {
  graph: Graph;
  selected: string | null;
  roleInspectorOpen: boolean;
  onSelect: (id: string, trigger: SVGGElement) => void;
  roleLabel: (id: string) => string;
  moduleCountLabel: (count: number) => string;
  conceptCountLabel: (count: number) => string;
  /** `null` where this surface cannot list source at all, so a box says nothing rather than 0. */
  moduleCounts: Readonly<Record<string, number>> | null;
  conceptCounts: Readonly<Record<string, number>>;
  /** Each role's outgoing-edge ledger, or `{}` without a measurement: a box with nothing behind it says nothing. */
  ledgers: Readonly<Record<string, RoleLedger>>;
  /** The profile's own sentence for a role, or null; it takes the line counts had, since a zero count is loud. */
  roleSummary: (id: string) => string | null;
  /** Violated crossings as `from>to`; a violation is never held back and never wears the conforming stroke. */
  violatedPairs: ReadonlySet<string>;
  /** The sentence a stroke states, the same string the dock printed: rule, count, or violation. */
  edgeSentence: (edge: SentenceEdge) => string;
  /** The ledger's first half, already worded by the locale. */
  ledgerStatusLabel: (ledger: RoleLedger) => string;
  ledgerImportsLabel: (count: number) => string;
  /** What the comparison mark says before any source has been observed. */
  deltaUnknownLabel: string;
  contractTrackLabel: string;
  observationTrackLabel: string;
  deltaTrackLabel: string;
  /** The limit of what a delta mark asserts: the delta heading's hover text, never body prose. */
  deltaColumnHint: string;
  /** What a role's own observation face says when only some roles carry a receipt. */
  observationMissingLabel: string;
  /** The single empty state in both measured columns before any inspection. */
  observationEmptyTitle: string;
  observationEmptyBody: string;
  observationEmptyAction?: ReactNode;
  /** Null until the canvas is measured and receipts are read. */
  onObservationEmptyActionSeated?: (seated: boolean | null) => void;
  /** False while receipts are still being read. */
  observationKnown?: boolean;
  /** The arrival plays only when this profile's own column goes from empty to observed. */
  profileKey?: string;
  lowerOnlyRuleLabel: string;
  hiddenRightLabel: (count: number) => string;
  hiddenLeftLabel: (count: number) => string;
  hiddenAboveLabel: (count: number) => string;
  hiddenBelowLabel: (count: number) => string;
}
