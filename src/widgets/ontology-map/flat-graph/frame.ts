import type { DialMarksResult } from "../dial/frame/marks";
import { recordDialFrame } from "../dial/frame/frame";
import type { DialFrameInput, DialFrameResult, DialModel } from "../dial/dial-shapes";
import { cachedGraphAttention, type GraphAttention } from "./attention";
import { restArcs, zoomGrowth } from "./marks";
import { FLAT_MOTION, graphMotionOf, waveDelays } from "./motion";
import type { FlatGraphLayout, FlatGraphTokens } from "./flat-graph-shapes";
import { paintPlan } from "./frame/paint";
import { forgetSettledStars } from "./frame/place";
import { drawnFlowKeys, buildPlan } from "./frame/plan";
import { pool, fillProbeMarks } from "./frame/probe";
import { frameChords, type FramePlan, F } from "./frame/state";

export { lastOpenedDomainStar } from "./frame/place";

const linkProbeCache = new WeakMap<DialModel, DialMarksResult["flows"]["links"]>();

function linkProbes(model: DialModel): DialMarksResult["flows"]["links"] {
  let links = linkProbeCache.get(model);
  if (!links) linkProbeCache.set(model, (links = model.flows.map((f) => ({ key: f.key, u: f.a, v: f.b, uv: f.ab, vu: f.ba, total: f.total, relatesOnly: f.relatesOnly, attended: false }))));
  return links;
}

let deferred: { plan: FramePlan; tokens: FlatGraphTokens; ground: string; warning: string } | null = null;

const UNSETTLED_MIX = 0.999;
const waveCache = new WeakMap<GraphAttention, { layout: FlatGraphLayout; delays: ReadonlyMap<string, number> }>();

/** One attention's wave delays over this layout's positions, kept while the layout stands. */
function wavesOf(attention: GraphAttention, layout: FlatGraphLayout): ReadonlyMap<string, number> {
  const hit = waveCache.get(attention);
  if (hit && hit.layout === layout) return hit.delays;
  const delays = waveDelays(attention, (id) => layout.positions.get(id) ?? layout.itemAt.get(id), FLAT_MOTION.waveMs);
  waveCache.set(attention, { layout, delays });
  return delays;
}

/** Paints the deferred lens-context frame once the classic edges are down. */
export function paintDeferredFlatGraph(ctx: CanvasRenderingContext2D, zoomRatio: number): void {
  if (!deferred) return;
  paintPlan(ctx, deferred.plan, deferred.tokens, deferred.ground, deferred.warning, zoomGrowth(zoomRatio, deferred.tokens.paint));
  deferred = null;
}

/** Flat as an attention-lit graph: same input and result contract as the dial frame it replaces. */
export function paintFlatGraphFrame(input: DialFrameInput, tokens: FlatGraphTokens): DialFrameResult {
  const { model } = input.dial;
  const contextMode = input.contextAlphas !== undefined;
  const focusId = contextMode ? null : input.focusedNodeId ?? input.hoveredNodeId;
  const attention = cachedGraphAttention(model, focusId, !contextMode && input.focusedNodeId !== null);
  const motion = graphMotionOf(input.worldKey, attention);
  const layout = input.dial.scene.graph!;
  motion.advance(attention, input.now, input.reducedMotion, (a) => wavesOf(a, layout));
  const mix = motion.settled ? 1 : Math.min(motion.progress, UNSETTLED_MIX);
  const built = buildPlan(input, tokens, motion);
  forgetSettledStars(input.focusedNodeId);
  const ground = input.mapTokens.canvasBgNear;
  const warning = tokens.inks.warning;
  if (input.deferPaint) deferred = { plan: built.plan, tokens, ground, warning };
  else paintPlan(input.ctx, built.plan, tokens, ground, warning, zoomGrowth(input.zoomRatio, tokens.paint));
  fillProbeMarks(built.plan, tokens, ground);
  const directed = restArcs(model, Number.POSITIVE_INFINITY).length;
  const drawn = drawnFlowKeys.items;
  const result: DialFrameResult = {
    branchScene: undefined,
    branchMembersAnimating: motion.active || F.lagging,
    contextOnly: contextMode,
    drawnCount: built.plan.discs.length + built.plan.domains.length + built.plan.dots.length + built.plan.project.length,
    tier: built.tier, alphas: built.alphas, picks: built.picks, rows: built.rows, labelBoxes: built.labelBoxes,
    light: { attentionKey: attention.key, focused: attention.selected, inkMix: mix, chords: frameChords.items },
    inkMix: mix, chordPresence: built.presence, marks: pool,
  };
  recordDialFrame(input, result, {
    links: linkProbes(model),
    drawn,
    entered: null, resolved: true,
    budget: { shown: built.plan.arcs.length, total: directed, perEndCap: 0 },
    stubs: [],
  }, F.lineKinds);
  return result;
}
