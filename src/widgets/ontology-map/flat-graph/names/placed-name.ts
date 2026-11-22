import type { MeasureText } from "../../dial/label-marks";
import type { Box, DialLabels, DialModel, Point } from "../../dial/dial-shapes";
import type { GraphLine } from "../attention";
import type { FlatGraphLayout, FlatGraphPaintTokens } from "../flat-graph-shapes";

export type NameRole = "project" | "domain" | "units" | "orphans" | "capability" | "element" | "reach";

/** One run of a line drawn left-aligned at `dx` from the line's anchor; a digit gets its own cell. */
export interface NamePiece { text: string; dx: number }

/** A name in screen pixels relative to its concept's live position; `box` is relative too. */
export interface PlacedName {
  id: string;
  role: NameRole;
  text: string;
  font: string;
  dx: number;
  dy: number;
  align: CanvasTextAlign;
  box: Box;
  /** Set when the line's figures must align as table columns: canvas text has no `tnum`. */
  pieces?: readonly NamePiece[];
  /** A lit name a lit line crosses on every side it may take: it draws on the canvas ground. */
  backed?: boolean;
  /** A name set a row above or below its concept: it draws a hairline back to the mark. */
  leader?: boolean;
}

export interface NameAdmission {
  step: number;
  names: readonly PlacedName[];
  ids: ReadonlySet<string>;
  /** Which of its candidate sides each capability or element name took, so the step above keeps it there. */
  sides: ReadonlyMap<string, number>;
  /** Where each fanned element's name is anchored, in world units; every other name is anchored at its concept. */
  anchors: ReadonlyMap<string, Point>;
  /** An open star's member's other acceptable sides, best first: where its name goes when its side runs under chrome. */
  alternates: ReadonlyMap<string, readonly PlacedName[]>;
  /**
   * An open star's member's remaining one-line sides without a leader, in its order of tries: those
   * admission ruled out somewhere in its zoom step. The frame takes one only where, as it draws, the
   * side stands inside the free map and clear of every drawn mark and name.
   */
  fallbacks: ReadonlyMap<string, readonly PlacedName[]>;
}

export interface NameInput {
  model: DialModel;
  layout: FlatGraphLayout;
  tokens: FlatGraphPaintTokens;
  labels: DialLabels | null;
  measureText: MeasureText;
  fontFamily: string;
  scale: number;
  growth: number;
  elementLabel(id: string): string | null;
  staleByDomain: ReadonlyMap<string, number> | null;
  lit: ReadonlySet<string> | null;
  focusId: string | null;
  /** Whether the focus is selected: a selected capability is named large, with its reach beneath. */
  selected: boolean;
  /** Concepts a lit picture names ahead of the rest; one drops only where its name would print over another concept's. */
  named: ReadonlySet<string>;
  reach: { needs: number; neededBy: number } | null;
  /** The focus's lines; lit names take a side none of them crosses. */
  lines: readonly GraphLine[];
  /** The concept a connected agent is working on: always named, like the focus. */
  agentFocusId: string | null;
  attentionKey: string;
  /** The concept whose opened star `discRadius` grows, so names admitted beside it are kept apart from names at rest. */
  openStarId?: string | null;
  discRadius(id: string): number;
  elementSpacingPx: number;
  /** The line the project carries under its disc while it has one; names keep off its row. */
  hubCaption: string | null;
  /** The least scale the camera reaches: a zoom step that spans past it is held apart only down to it. */
  zoomFloorScale?: number;
}
