import {
  DOME_NODE_PX,
  DOME_RING_WIDTH_PX,
  domeFogAlpha,
  domeLineWidthFactor,
  type DomeViewKind,
} from "../../model/dome-view";
import { draw as domeRingsDraw } from "../../render/dome-rings";
import { drawStrataStage, hexToRgb } from "../../render/dome-light";
import {
  drawStrataLodChords,
  drawStrataLodSheets,
  type StrataLodChordDraw,
} from "../../render/strata-lod";
import { rollUpStrataDependencies } from "../../model/strata-lod";
import { lerpColorHex } from "../../render/grid";
import type { WorldEdge } from "../topology-world";
import {
  passState,
  ZERO_DOME_FRAME,
  domeEdgeFrameAReused,
  domeEdgeFrameBReused,
  domeEdgeIndexReused,
  domeNodeFrameReused,
  drawnScreenRadiusByIdReused,
  litSectorIdsReused,
  lodChords,
} from "./frame-state";
import { type FrameScope } from "./frame-scope";

const domeEdgeOrderReused: WorldEdge[] = [];
const domeEdgeDepthReused: number[] = [];

const domeRingScreenReused: {
  kind: DomeViewKind;
  a: number;
  points: {
    x: number; y: number; u: number;
  }[];
}[] = [];

const lodChordPool: StrataLodChordDraw[] = [];

let lodContainsInk: {
  hex: string; rgb: readonly [number, number, number];
} | null = null;

let lodDependsInk: {
  hex: string; rgb: readonly [number, number, number];
} | null = null;

export function paintDomeStage(F: FrameScope): void {
  const { tokens, farT, world, domeLight, domeRings, domeRingAlpha, domeTierRaisedKind, ctx, domeOn,
    project, camX, camY, camScale, halfW, halfH, litOn, litFocusRamp, lod, edgeAlphaReused,
    edgeEnds } = F;
  const domeHaloColor = domeOn ? lerpColorHex(tokens.canvasBgNear, tokens.canvasBgFar, farT) : "";
  let edgeDrawOrder: readonly WorldEdge[] = world.edges;
  if (domeOn) {
    const edges = world.edges;
    domeEdgeDepthReused.length = 0;
    domeEdgeIndexReused.length = 0;
    domeEdgeFrameAReused.length = 0;
    domeEdgeFrameBReused.length = 0;
    for (let i = 0; i < edges.length; i += 1) {
      const sourceIndex = edgeEnds.source[i];
      const targetIndex = edgeEnds.target[i];
      const fA = sourceIndex >= 0 ? domeNodeFrameReused[sourceIndex] : ZERO_DOME_FRAME;
      const fB = targetIndex >= 0 ? domeNodeFrameReused[targetIndex] : ZERO_DOME_FRAME;
      domeEdgeFrameAReused.push(fA);
      domeEdgeFrameBReused.push(fB);
      domeEdgeDepthReused.push((fA.u + fB.u) / 2);
      if (edgeAlphaReused[i] > 0.02) domeEdgeIndexReused.push(i);
    }
    domeEdgeIndexReused.sort((x, y) => domeEdgeDepthReused[y] - domeEdgeDepthReused[x]);
    domeEdgeOrderReused.length = 0;
    for (let i = 0; i < domeEdgeIndexReused.length; i += 1) domeEdgeOrderReused.push(edges[domeEdgeIndexReused[i]]);
    edgeDrawOrder = domeEdgeOrderReused;
  }
  if (litOn && domeLight !== null && domeLight.sampleStage !== null) {
    drawStrataStage(
      ctx,
      domeLight.sampleStage(litSectorIdsReused.size > 0 ? litSectorIdsReused : null),
      { kindRgb: domeLight.kindRgb, focusRgb: domeLight.focusRgb },
      project,
      domeFogAlpha,
      1 - 0.55 * litFocusRamp);
  }
  let domeRingsState: Parameters<typeof domeRingsDraw>[1] | null = null;
  let domeRingsTokens: Parameters<typeof domeRingsDraw>[2] | null = null;
  if (domeOn && domeRings !== null && domeRings.length > 0) {
    domeRingsState = {
      rings: (() => {
        for (let i = 0; i < domeRings.length; i += 1) {
          const ring = domeRings[i];
          let out = domeRingScreenReused[i];
          if (!out) {
            out = { kind: ring.kind, a: 0, points: [] };
            domeRingScreenReused[i] = out;
          }
          out.kind = ring.kind;
          out.a = ring.a;
          for (let k = 0; k < ring.points.length; k += 1) {
            const point = ring.points[k];
            const screen = project(point.wx, point.wy);
            const slot = out.points[k];
            if (slot) {
              slot.x = screen.x;
              slot.y = screen.y;
              slot.u = point.u;
            } else {
              out.points[k] = { x: screen.x, y: screen.y, u: point.u };
            }
          }
          out.points.length = ring.points.length;
        }
        domeRingScreenReused.length = domeRings.length;
        return domeRingScreenReused;
      })(),
      baseAlpha: domeRingAlpha,
      baseWidthPx: DOME_RING_WIDTH_PX,
      fog: domeFogAlpha,
      widthFactor: domeLineWidthFactor,
      raisedKind: domeTierRaisedKind,
    };
    domeRingsTokens = {
      stroke: tokens.domeRing,
      strokeRaised: tokens.domeRingRaised,
    };
    domeRingsDraw(ctx, domeRingsState, domeRingsTokens);
  }
  if (lod !== null) {
    if (lodContainsInk === null || lodContainsInk.hex !== tokens.edgeContains) {
      lodContainsInk = { hex: tokens.edgeContains, rgb: hexToRgb(tokens.edgeContains) ?? [128, 128, 140] };
    }
    drawStrataLodSheets(ctx, lod.shapes, lod.shapeCount, lodContainsInk.rgb, domeFogAlpha, 1 - 0.55 * litFocusRamp);
  }
  passState.lodChordsDrawn = 0;
  if (lod !== null && lod.index !== null) {
    const index = lod.index;
    const slots = index.domainIds.length;
    rollUpStrataDependencies(
      lodChords,
      slots,
      index.domainSlotOf,
      world.edges,
      edgeEnds.source,
      edgeEnds.target,
      (i) => passState.lodPresenceReused[i],
      (i) => domeNodeFrameReused[i].a,
      (slot) => lod.ramps[slot] ?? 0);
    let chordCount = 0;
    for (let key = 0; key < slots * slots; key += 1) {
      const count = lodChords.count[key];
      if (count === 0) continue;
      const from = Math.floor(key / slots);
      const to = key - from * slots;
      const lift = Math.max(lod.ramps[from] ?? 0, lod.ramps[to] ?? 0);
      if (lift <= 0.004) continue;
      const ia = index.domains[from].nodeIndex;
      const ib = index.domains[to].nodeIndex;
      if (ia < 0 || ib < 0) continue;
      const fa = domeNodeFrameReused[ia];
      const fb = domeNodeFrameReused[ib];
      const ax = (world.nodes[ia].x + fa.dx - camX) * camScale + halfW;
      const ay = (world.nodes[ia].y + fa.dy - camY) * camScale + halfH;
      const bx = (world.nodes[ib].x + fb.dx - camX) * camScale + halfW;
      const by = (world.nodes[ib].y + fb.dy - camY) * camScale + halfH;
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2;
      const length = Math.hypot(bx - ax, by - ay) || 1;
      const bow = Math.min(length * 0.12, 40);
      let chord = lodChordPool[chordCount];
      if (!chord) {
        chord = { ax: 0, ay: 0, ar: 0, bx: 0, by: 0, br: 0, cx: 0, cy: 0, count: 0, weight: 0, depth: 0, lift: 0 };
        lodChordPool[chordCount] = chord;
      }
      chord.ax = ax;
      chord.ay = ay;
      chord.ar = drawnScreenRadiusByIdReused.get(world.nodes[ia].id) ?? DOME_NODE_PX.domain;
      chord.bx = bx;
      chord.by = by;
      chord.br = drawnScreenRadiusByIdReused.get(world.nodes[ib].id) ?? DOME_NODE_PX.domain;
      chord.cx = mx + (lod.hub.x - mx) * 0.3 - ((by - ay) / length) * bow;
      chord.cy = my + (lod.hub.y - my) * 0.3 + ((bx - ax) / length) * bow;
      chord.count = count;
      chord.weight = lodChords.weight[key];
      chord.depth = (fa.u + fb.u) / 2;
      chord.lift = lift;
      chordCount += 1;
    }
    if (lodDependsInk === null || lodDependsInk.hex !== tokens.edgeDepends) {
      lodDependsInk = { hex: tokens.edgeDepends, rgb: hexToRgb(tokens.edgeDepends) ?? [102, 102, 133] };
    }
    passState.lodChordsDrawn = drawStrataLodChords(ctx, lodChordPool, chordCount, lodDependsInk.rgb, domeFogAlpha, 1 - 0.55 * litFocusRamp);
  } else {
    lodChords.represented = 0;
    lodChords.hidden = 0;
  }
  F.domeHaloColor = domeHaloColor;
  F.edgeDrawOrder = edgeDrawOrder;
}
