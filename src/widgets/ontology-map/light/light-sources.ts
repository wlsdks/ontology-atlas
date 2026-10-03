import { isDirectionalRelation } from "@/entities/knowledge-graph";

import { dialLightFrame } from "../dial/frame/frame";
import { createDialLightSource } from "../dial/light-source";
import type { CameraAxes } from "../engine/camera";
import type { Point } from "../expressive/edge-reveal";
import type { TopologyMapLensKind } from "../model/path-lens";
import type { OntologyMapTokens } from "../tokens/read-map-tokens";
import { radiusForKind, type TopologyWorld, type WorldEdge } from "../ui/topology-world";
import {
  bloomAt,
  curveLength,
  curvePoint,
  headFadeAt,
  isPlanAlive,
  type LightKinematics,
  type LightPlan,
  type PathHop,
  planFocusSignal,
  planPathSignal,
  type SignalEdge,
  signalFrame,
  stepPlan,
} from "./signal-plan";

export interface LightSourceInput {
  now: number;
  world: TopologyWorld;
  camera: CameraAxes;
  width: number;
  height: number;
  tokens: OntologyMapTokens;
  kinematics: LightKinematics;
  focusedNodeId: string | null;
  trailLensActive: boolean;
  reducedMotion: boolean;
  revealProgress: number;
  clusteredIds: ReadonlySet<string>;
  mapLensKind: TopologyMapLensKind;
  pathEdgeIds: ReadonlySet<string> | null;
  pathNodeIds: ReadonlySet<string> | null;
}

export interface LightHead {
  source: string;
  key: string;
  t: number;
  x: number;
  y: number;
  arrived: boolean;
  revealBound: boolean;
  departAt: number;
  arriveAt: number;
  curve: [number, number, number, number, number, number];
}

export interface LightEmitter {
  readonly wantsHeads: boolean;
  signal(a: Point, c: Point, b: Point, tailStart: number, drawnEnd: number, head: number, strength: number): void;
  bloom(id: string, x: number, y: number, sigma: number, haloSigma: number, haloWeight: number, strength: number): void;
  signalled(a: Point, c: Point, b: Point): void;
  head(head: LightHead): void;
}

export interface LightSource {
  readonly id: string;
  step(input: LightSourceInput, out: LightEmitter): boolean;
  plan(): LightPlan<unknown> | null;
  reset(): void;
}

const HEAD_HALO_WEIGHT = 0.35;
const HEAD_HALO_SHARE = 0.5;
const BLOOM_SIGMA_PER_RADIUS = 0.85;
const BLOOM_HALO_SPREAD = 2.2;
const BLOOM_HALO_WEIGHT = 0.3;

interface EdgeScreen {
  a: Point;
  c: Point;
  b: Point;
}

function projectEdge(edge: WorldEdge, camera: CameraAxes, width: number, height: number, out: EdgeScreen): EdgeScreen {
  const camX = camera.x.value;
  const camY = camera.y.value;
  const camScale = camera.scale.value;
  const halfW = width / 2;
  const halfH = height / 2;
  out.a.x = (edge.ax - camX) * camScale + halfW;
  out.a.y = (edge.ay - camY) * camScale + halfH;
  out.b.x = (edge.bx - camX) * camScale + halfW;
  out.b.y = (edge.by - camY) * camScale + halfH;
  out.c.x = (edge.controlX - camX) * camScale + halfW;
  out.c.y = (edge.controlY - camY) * camScale + halfH;
  return out;
}

function nodeRadiusPx(world: TopologyWorld, id: string, tokens: OntologyMapTokens, scale: number): number {
  const node = world.nodeById.get(id);
  return node ? radiusForKind(node.kind, tokens) * node.magnitudeScale * scale : 0;
}

function edgeKey(edge: WorldEdge): string {
  return edge.id ?? `${edge.sourceId}>${edge.targetId}:${edge.relationType}`;
}

function signalEdge(edge: WorldEdge, input: LightSourceInput, screen: EdgeScreen): SignalEdge<WorldEdge> {
  projectEdge(edge, input.camera, input.width, input.height, screen);
  const scale = input.camera.scale.value;
  return {
    key: edgeKey(edge),
    edge,
    sourceId: edge.sourceId,
    targetId: edge.targetId,
    directional: isDirectionalRelation(edge.relationType),
    evidenceCount: edge.evidenceCount ?? 0,
    lengthPx: curveLength(screen.a, screen.c, screen.b),
    sourceRadiusPx: nodeRadiusPx(input.world, edge.sourceId, input.tokens, scale),
    targetRadiusPx: nodeRadiusPx(input.world, edge.targetId, input.tokens, scale),
  };
}

function createPlanRunner(id: string) {
  const screen: EdgeScreen = { a: { x: 0, y: 0 }, c: { x: 0, y: 0 }, b: { x: 0, y: 0 } };
  const head: Point = { x: 0, y: 0 };
  const bloomed = new Map<string, number>();

  function emit(plan: LightPlan<WorldEdge>, input: LightSourceInput, reveal: number, out: LightEmitter): void {
    const { kinematics, camera, width, height, tokens, world } = input;
    for (const signal of plan.signals) {
      const frame = signalFrame(signal, input.now, reveal, kinematics);
      if (!frame.started) continue;
      if (signal.bloomId !== null && frame.arrived) {
        const first = bloomed.get(signal.bloomId);
        if (first === undefined || first === signal.arrivedMs) bloomed.set(signal.bloomId, signal.arrivedMs);
      }
      if (frame.done) continue;
      projectEdge(signal.edge, camera, width, height, screen);
      out.signalled(screen.a, screen.c, screen.b);
      const fromA = signal.from === "a";
      const departure = fromA ? screen.a : screen.b;
      const arrival = fromA ? screen.b : screen.a;
      out.signal(departure, screen.c, arrival, frame.tailStart, frame.drawnEnd, frame.head, kinematics.intensity * frame.ignite);
      const t = Math.min(frame.head, frame.drawnEnd);
      curvePoint(departure, screen.c, arrival, t, head);
      const headStrength = frame.arrived ? headFadeAt(input.now - signal.arrivedMs) : 1;
      if (headStrength > 0) {
        out.bloom(`head:${signal.key}`, head.x, head.y, tokens.lightCorePx, tokens.lightHaloPx * HEAD_HALO_SHARE, HEAD_HALO_WEIGHT, kinematics.intensity * frame.ignite * headStrength);
      }
      if (out.wantsHeads) {
        out.head({
          source: id,
          key: signal.key,
          t,
          x: head.x,
          y: head.y,
          arrived: frame.arrived,
          revealBound: signal.revealBound,
          departAt: signal.departAt,
          arriveAt: signal.arriveAt,
          curve: [departure.x, departure.y, screen.c.x, screen.c.y, arrival.x, arrival.y],
        });
      }
    }
    const scale = camera.scale.value;
    for (const [nodeId, arrivedMs] of bloomed) {
      const strength = bloomAt(input.now - arrivedMs, kinematics);
      if (!(strength > 0)) continue;
      const node = world.nodeById.get(nodeId);
      if (!node) continue;
      const sigma = Math.max(tokens.lightHaloPx, nodeRadiusPx(world, nodeId, tokens, scale) * BLOOM_SIGMA_PER_RADIUS);
      out.bloom(
        `node:${nodeId}`,
        (node.x - camera.x.value) * scale + width / 2,
        (node.y - camera.y.value) * scale + height / 2,
        sigma,
        sigma * BLOOM_HALO_SPREAD,
        BLOOM_HALO_WEIGHT,
        strength,
      );
    }
  }

  return {
    reset: () => bloomed.clear(),
    run(plan: LightPlan<WorldEdge> | null, input: LightSourceInput, reveal: number, out: LightEmitter): boolean {
      if (plan === null) return false;
      stepPlan(plan, input.now, reveal);
      emit(plan, input, reveal, out);
      return isPlanAlive(plan, input.now, reveal, input.kinematics);
    },
  };
}

function createFocusSource(): LightSource {
  const runner = createPlanRunner("focus");
  let world: TopologyWorld | null = null;
  let focus: string | null = null;
  let current: LightPlan<WorldEdge> | null = null;

  return {
    id: "focus",
    plan: () => current,
    reset() {
      world = null;
      focus = null;
      current = null;
      runner.reset();
    },
    step(input, out) {
      if (input.world !== world) {
        world = input.world;
        focus = input.focusedNodeId;
        current = null;
        runner.reset();
        return false;
      }
      if (input.focusedNodeId !== focus) {
        focus = input.focusedNodeId;
        runner.reset();
        current = null;
        if (focus !== null && !input.trailLensActive) {
          const candidates: SignalEdge<WorldEdge>[] = [];
          for (const index of input.world.edgeIndexByNode.get(focus) ?? []) {
            const edge = input.world.edges[index];
            if (!edge || input.clusteredIds.has(edge.sourceId) || input.clusteredIds.has(edge.targetId)) continue;
            candidates.push(signalEdge(edge, input, { a: { x: 0, y: 0 }, c: { x: 0, y: 0 }, b: { x: 0, y: 0 } }));
          }
          current = planFocusSignal(focus, candidates, input.now, input.kinematics, input.reducedMotion);
        }
      }
      if (input.trailLensActive || dialLightFrame() !== null) current = null;
      const alive = runner.run(current, input, input.revealProgress, out);
      if (!alive) current = null;
      return alive;
    },
  };
}

function orderedHops(input: LightSourceInput): PathHop<WorldEdge>[] | null {
  const { world, pathEdgeIds, pathNodeIds } = input;
  if (pathEdgeIds === null || pathEdgeIds.size === 0) return null;
  const byId = new Map<string, WorldEdge>();
  for (const edge of world.edges) if (edge.id !== undefined && pathEdgeIds.has(edge.id)) byId.set(edge.id, edge);
  const edges: WorldEdge[] = [];
  for (const id of pathEdgeIds) {
    const edge = byId.get(id);
    if (!edge) return null;
    edges.push(edge);
  }
  const first = edges[0]!;
  const nodes = pathNodeIds ? [...pathNodeIds] : [];
  let at =
    nodes[0] === first.sourceId || nodes[0] === first.targetId
      ? nodes[0]!
      : edges.length > 1 && (first.sourceId === edges[1]!.sourceId || first.sourceId === edges[1]!.targetId)
        ? first.targetId
        : first.sourceId;
  const screen: EdgeScreen = { a: { x: 0, y: 0 }, c: { x: 0, y: 0 }, b: { x: 0, y: 0 } };
  const hops: PathHop<WorldEdge>[] = [];
  for (const edge of edges) {
    if (edge.sourceId !== at && edge.targetId !== at) return null;
    const toId = edge.sourceId === at ? edge.targetId : edge.sourceId;
    hops.push({ ...signalEdge(edge, input, screen), fromId: at, toId });
    at = toId;
  }
  return hops;
}

function createPathSource(): LightSource {
  const runner = createPlanRunner("path");
  let world: TopologyWorld | null = null;
  let lit: string | null = null;
  let edgeSet: ReadonlySet<string> | null = null;
  let edgeSignature: string | null = null;
  let current: LightPlan<WorldEdge> | null = null;

  const signatureOf = (input: LightSourceInput): string | null => {
    if (input.mapLensKind !== "path" || input.pathEdgeIds === null || input.pathEdgeIds.size === 0) return null;
    if (input.pathEdgeIds !== edgeSet) {
      edgeSet = input.pathEdgeIds;
      edgeSignature = [...input.pathEdgeIds].join("|");
    }
    return edgeSignature;
  };

  return {
    id: "path",
    plan: () => current,
    reset() {
      world = null;
      lit = null;
      edgeSet = null;
      edgeSignature = null;
      current = null;
      runner.reset();
    },
    step(input, out) {
      const open = signatureOf(input);
      if (input.world !== world) {
        world = input.world;
        lit = open;
        current = null;
        runner.reset();
        return false;
      }
      if (open === null) {
        lit = null;
        current = null;
      } else if (input.focusedNodeId !== null || input.trailLensActive) {
        lit = open;
        current = null;
      } else if (open !== lit) {
        lit = open;
        runner.reset();
        const hops = orderedHops(input);
        current = hops !== null && hops.length > 0 ? planPathSignal(hops[0]!.fromId, hops, input.now, input.kinematics, input.reducedMotion) : null;
      }
      const alive = runner.run(current, input, 1, out);
      if (!alive) current = null;
      return alive;
    },
  };
}

export const LIGHT_SOURCES: readonly (() => LightSource)[] = [createFocusSource, createPathSource, () => createDialLightSource(dialLightFrame)];
