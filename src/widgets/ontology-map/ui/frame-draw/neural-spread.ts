import { neuralSignalProgress, type NeuralGraph } from "../../model/dome-view/neural-cells";
import { impactHopsByIndex, neuralImpact, neuralSpreadAt, neuralSpreadHopMs, type NeuralImpact } from "../../model/dome-view/neural-impact";
import type { NeuralTokens } from "../../tokens/read-neural-tokens";

/**
 * A focus's signal and a selection's spread: when each started, how far it has come, and the impact
 * it lights. Also what the last frame lit, for the map probe.
 */

/** Distances at and past this one light at the far strength. */
const FAR_DISTANCE = 3;
/** 0 for distance 1, 1 for the middle step, 2 for far: a painter batches one stroke per step. */
export const impactStepOf = (distance: number) => (distance <= 1 ? 0 : distance < FAR_DISTANCE ? 1 : 2);
/** A distance in each step of {@link impactStepOf}. */
export const IMPACT_STEP_DISTANCES = [1, FAR_DISTANCE - 1, FAR_DISTANCE] as const;

interface Signal { key: string | null; startMs: number; impact: NeuralImpact | null; hops: number; hopMs: number }
/**
 * The signal plays once per focus: the selection, a hovered concept and a lit relation each keep their
 * own start, so a hover over a cell or an axon returns to the selection without replaying its spread.
 */
const signals: { selected: Signal; hovered: Signal; relation: Signal } = {
  selected: { key: null, startMs: 0, impact: null, hops: 1, hopMs: 0 },
  hovered: { key: null, startMs: 0, impact: null, hops: 1, hopMs: 0 },
  relation: { key: null, startMs: 0, impact: null, hops: 1, hopMs: 0 },
};
let activeSignal: Signal = signals.selected;

/** A selection's impact and each node index's distance in it (−1 outside, 0 the focus), built once per selection. */
let impactCache: { graph: NeuralGraph; nodes: readonly { id: string }[]; impact: NeuralImpact; hopOf: Int32Array } | null = null;

function selectionImpact(graph: NeuralGraph, nodes: readonly { id: string }[], indexOf: ReadonlyMap<string, number>, focusId: string) {
  if (impactCache?.graph === graph && impactCache.nodes === nodes && impactCache.impact.focusId === focusId) return impactCache;
  const impact = neuralImpact(graph, focusId);
  impactCache = { graph, nodes, impact, hopOf: impactHopsByIndex(impact, indexOf, nodes.length) };
  return impactCache;
}

/** The last selection's impact and how far its spread had come, kept while it fades after release. */
const released = { focusId: null as string | null, impact: null as NeuralImpact | null, hopOf: null as Int32Array | null, spread: 0 };

/** What the last frame lit, for the map probe: references only, so a frame allocates nothing for it. */
export const lastLit = {
  focusId: null as string | null,
  selected: false,
  sets: null as { needs: ReadonlySet<string>; usedBy: ReadonlySet<string> } | null,
  impact: null as NeuralImpact | null,
  spread: 0,
  hops: 0,
  liftedCells: 0,
  plateFacts: null as string | null,
  edges: [] as readonly { sourceId: string; targetId: string }[],
  /** The frame's lit list: world edge index and hop, of which `litCount` are this frame's. */
  litEdge: new Int32Array(0) as Int32Array,
  litHop: new Int32Array(0) as Int32Array,
  litCount: 0,
};

/**
 * The focus Neural lit in the last frame, its direct ends, a selection's impact with distances, and
 * each lit axon on screen as its two ends and hop.
 */
export function lastNeuralLit() {
  const axons: { sourceId: string; targetId: string; hop: number }[] = [];
  for (let k = 0; k < lastLit.litCount; k += 1) {
    const edge = lastLit.edges[lastLit.litEdge[k]];
    if (edge) axons.push({ sourceId: edge.sourceId, targetId: edge.targetId, hop: lastLit.litHop[k] });
  }
  return {
    axons,
    focusId: lastLit.focusId,
    selected: lastLit.selected,
    needs: lastLit.sets ? [...lastLit.sets.needs].sort() : [],
    usedBy: lastLit.sets ? [...lastLit.sets.usedBy].sort() : [],
    impact: lastLit.impact ? Object.fromEntries(lastLit.impact.distance) : null,
    spread: lastLit.spread,
    hops: lastLit.hops,
    liftedCells: lastLit.liftedCells,
    plateFacts: lastLit.plateFacts,
  };
}

/** True while a focus's signal or a selection's spread is still on its way, so the frame loop draws until it arrives. */
export function isNeuralSignalTravelling(nowMs: number, reducedMotion: boolean): boolean {
  return activeSignal.key !== null && neuralSpreadAt(nowMs, activeSignal.startMs, activeSignal.hops, activeSignal.hopMs, reducedMotion) < activeSignal.hops;
}

/** A dependent's strength by its distance from the selection. */
export function impactStrength(t: NeuralTokens, distance: number): number {
  return distance <= 1 ? t.impactNear : distance < FAR_DISTANCE ? t.impactMid : t.impactFar;
}

interface SpreadInput {
  graph: NeuralGraph;
  nodes: readonly { id: string }[];
  indexOf: ReadonlyMap<string, number>;
  focusId: string | null;
  focusedNodeId: string | null;
  hoveredNodeId: string | null;
  sets: { needs: ReadonlySet<string>; usedBy: ReadonlySet<string> } | null;
  /** The relations a person points at, which light instead of a concept. */
  litAxons: ReadonlySet<string> | null;
  now: number;
  reducedMotion: boolean;
}

/** This frame's spread, reused across frames. */
const spreadFrame = { impact: null as NeuralImpact | null, hopOf: null as Int32Array | null, spread: 0, travel: 1 };

/**
 * Where this frame's focus signal stands: the selection's impact and hop index, how many hops its
 * spread has travelled, and how far a direct signal has run. Only the selection itself spreads and a
 * hover lights its direct ends; a released selection keeps the picture it had at release while its
 * focus ramp fades out.
 */
export function neuralSpreadFrame(input: SpreadInput, t: NeuralTokens): Readonly<typeof spreadFrame> {
  const { focusId, sets, litAxons, hoveredNodeId, now, reducedMotion } = input;
  const selection = sets !== null && litAxons === null && focusId !== null && focusId === input.focusedNodeId
    ? selectionImpact(input.graph, input.nodes, input.indexOf, focusId) : null;
  const releasing = selection === null && sets !== null && litAxons === null && focusId !== null &&
    focusId !== hoveredNodeId && released.focusId === focusId;
  const impact = selection?.impact ?? (releasing ? released.impact : null);
  const signalKey = litAxons !== null ? [...litAxons].join("\u0001") : focusId;
  const signalSlot = litAxons !== null ? signals.relation
    : focusId !== null && focusId === hoveredNodeId && selection === null ? signals.hovered : signals.selected;
  if (signalSlot !== signals.relation) signals.relation.key = null;
  if (signalSlot === signals.selected) signals.hovered.key = null;
  if (signalKey !== signalSlot.key) {
    signalSlot.key = signalKey;
    signalSlot.startMs = now;
    signalSlot.impact = null;
    signalSlot.hops = 1;
    signalSlot.hopMs = t.signalMs;
  }
  // A selection's focus ramp may light it a frame after its key was set; its spread keeps that start.
  if (impact !== null && signalSlot.impact !== impact) {
    signalSlot.impact = impact;
    signalSlot.hops = Math.max(1, impact.hops);
    signalSlot.hopMs = neuralSpreadHopMs(signalSlot.hops, t.signalMs, t.spreadMs);
  }
  activeSignal = signalSlot;
  const spread = releasing ? released.spread
    : signalKey === null ? signalSlot.hops : neuralSpreadAt(now, signalSlot.startMs, signalSlot.hops, signalSlot.hopMs, reducedMotion);
  if (selection !== null) {
    released.focusId = focusId;
    released.impact = selection.impact;
    released.hopOf = selection.hopOf;
    released.spread = spread;
  } else if (!releasing) released.focusId = null;
  spreadFrame.impact = impact;
  spreadFrame.hopOf = selection?.hopOf ?? (releasing ? released.hopOf : null);
  spreadFrame.spread = spread;
  spreadFrame.travel = releasing || signalKey === null ? 1 : neuralSignalProgress(now, signalSlot.startMs, signalSlot.hopMs, reducedMotion);
  lastLit.focusId = focusId;
  lastLit.selected = selection !== null;
  lastLit.sets = sets;
  lastLit.impact = impact;
  lastLit.spread = spread;
  lastLit.hops = impact?.hops ?? 0;
  lastLit.liftedCells = 0;
  return spreadFrame;
}
