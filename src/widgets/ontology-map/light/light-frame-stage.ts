import type { RefObject } from "react";

import type { CameraAxes } from "../engine/camera";
import { edgeRevealProgress, type Point } from "../expressive/edge-reveal";
import type { DomeRuntime } from "../model/dome-view";
import type { TopologyMapLensKind } from "../model/path-lens";
import { hexToRgb } from "../render/dome-light";
import type { OntologyMapTokens } from "../tokens/read-map-tokens";
import type { TopologyWorld } from "../ui/topology-world";
import type { LightBatch, LightLayer } from "./light-layer";
import { installLightProbe, type LightProbe, type LightProbeBloom } from "./light-probe";
import { LIGHT_SOURCES, type LightEmitter, type LightHead, type LightSourceInput } from "./light-sources";
import { clearSignalledLines, type LightKinematics, markSignalledLine, signalledStandDowns } from "./signal-plan";

type LightLayerModule = Pick<typeof import("./light-layer"), "createLightLayer" | "lightBlendMode" | "SIGNAL_STRIDE" | "BLOOM_STRIDE" | "SIGNAL_CAPACITY" | "BLOOM_CAPACITY">;

type LightStageState = "idle" | "pending" | "ready" | "off" | "lost";

interface LightStageRefs {
  reducedMotionRef: RefObject<boolean>;
  egoRevealRef: RefObject<Map<string, number>>;
  galaxyRef: RefObject<boolean>;
  domeRuntimeRef: RefObject<DomeRuntime | null>;
  mapLensKindRef: RefObject<TopologyMapLensKind>;
  pathEdgeIdsRef: RefObject<ReadonlySet<string> | null>;
  spotlightIdsRef: RefObject<ReadonlySet<string> | null>;
}

export interface LightStageDependencies {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  refs: LightStageRefs;
  lightActiveRef: { current: boolean };
  requestFrame: () => void;
}

export interface LightStageOptions {
  search?: string;
  loadLayer?: () => Promise<LightLayerModule>;
  scheduleIdle?: (callback: () => void) => () => void;
}

export interface LightFrameStage {
  prepare(
    now: number,
    tokens: OntologyMapTokens,
    world: TopologyWorld,
    camera: CameraAxes,
    width: number,
    height: number,
    focusedNodeId: string | null,
    trailLensActive: boolean,
    clusteredIds: ReadonlySet<string>,
  ): void;
  render(): void;
  dispose(): void;
}

const EMPTY_IDS: ReadonlySet<string> = new Set();
const INK_FLOATS = 12;

function idleScheduler(callback: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(callback, { timeout: 1000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(callback, 0);
  return () => window.clearTimeout(id);
}

async function loadLightLayer(): Promise<LightLayerModule> {
  const { createLightLayer, lightBlendMode, SIGNAL_STRIDE, BLOOM_STRIDE, SIGNAL_CAPACITY, BLOOM_CAPACITY } = await import("./light-layer");
  return { createLightLayer, lightBlendMode, SIGNAL_STRIDE, BLOOM_STRIDE, SIGNAL_CAPACITY, BLOOM_CAPACITY };
}

function writeInk(token: string, out: Float32Array, slot: number): void {
  const rgb = hexToRgb(token);
  for (let channel = 0; channel < 3; channel += 1) out[slot * 3 + channel] = rgb ? rgb[channel]! / 255 : 0;
}

export function createLightFrameStage(dependencies: LightStageDependencies, options: LightStageOptions = {}): LightFrameStage {
  const { canvasRef, refs, lightActiveRef, requestFrame } = dependencies;
  const params = new URLSearchParams(options.search ?? (typeof window === "undefined" ? "" : window.location.search));
  const forced = params.get("light") === "force";
  const loadLayer = options.loadLayer ?? loadLightLayer;
  const scheduleIdle = options.scheduleIdle ?? idleScheduler;
  const sources = LIGHT_SOURCES.map((create) => create());

  let state: LightStageState = "idle";
  let layerModule: LightLayerModule | null = null;
  let layer: LightLayer | null = null;
  let cancelIdle: (() => void) | null = null;
  let disposed = false;
  let drewLast = false;
  let sourcesQuiet = true;
  let tokensSeen: OntologyMapTokens | null = null;
  let kinematics: LightKinematics | null = null;
  let batch: LightBatch | null = null;
  const inks = new Float32Array(INK_FLOATS);
  const heads: LightHead[] = [];
  const probeBlooms: LightProbeBloom[] = [];
  let frameWidth = 0;
  let frameHeight = 0;
  let frameNow = 0;
  let frameFocus: string | null = null;
  let frameReveal = 1;
  let frameCamera = { x: 0, y: 0, scale: 1 };
  let framePathOpen = false;
  let prepareMs = 0;
  let prepareStart = 0;

  let probe: LightProbe | null = null;
  if (params.has("e2e") && typeof window !== "undefined") {
    probe = installLightProbe({
      state: () => state,
      active: () => lightActiveRef.current,
      plans: () => sources.map((source) => source.plan()),
      heads: () => heads,
    });
  }

  const emitter: LightEmitter = {
    wantsHeads: probe !== null,
    signal(a, c, b, tailStart, drawnEnd, head, strength) {
      if (!batch || !layerModule || batch.signalCount >= layerModule.SIGNAL_CAPACITY) return;
      const at = batch.signalCount * layerModule.SIGNAL_STRIDE;
      const data = batch.signals;
      data[at] = a.x;
      data[at + 1] = a.y;
      data[at + 2] = c.x;
      data[at + 3] = c.y;
      data[at + 4] = b.x;
      data[at + 5] = b.y;
      data[at + 6] = tailStart;
      data[at + 7] = drawnEnd;
      data[at + 8] = head;
      data[at + 9] = kinematics?.tail ?? 0;
      data[at + 10] = strength;
      data[at + 11] = 0;
      batch.signalCount += 1;
    },
    bloom(id, x, y, sigma, haloSigma, haloWeight, strength) {
      if (!batch || !layerModule || batch.bloomCount >= layerModule.BLOOM_CAPACITY) return;
      const at = batch.bloomCount * layerModule.BLOOM_STRIDE;
      const data = batch.blooms;
      data[at] = x;
      data[at + 1] = y;
      data[at + 2] = sigma;
      data[at + 3] = haloSigma;
      data[at + 4] = haloWeight;
      data[at + 5] = strength;
      data[at + 6] = 0;
      data[at + 7] = 0;
      batch.bloomCount += 1;
      if (probe?.recording) probeBlooms.push({ id, strength });
    },
    signalled(a: Point, c: Point, b: Point) {
      markSignalledLine(a, c, b);
    },
    head(head) {
      heads.push(head);
    },
  };

  const quiet = () => {
    if (!sourcesQuiet) {
      for (const source of sources) source.reset();
      sourcesQuiet = true;
    }
    lightActiveRef.current = false;
    if (batch) {
      batch.signalCount = 0;
      batch.bloomCount = 0;
    }
  };

  const release = () => {
    cancelIdle?.();
    cancelIdle = null;
    layer?.dispose();
    layer = null;
    drewLast = false;
  };

  const create = async () => {
    try {
      const loaded = await loadLayer();
      if (disposed || state !== "pending") return;
      const host = canvasRef.current;
      if (!host || refs.reducedMotionRef.current) {
        state = "idle";
        return;
      }
      layer = loaded.createLightLayer(host, {
        forced,
        blend: loaded.lightBlendMode(),
        onLost: () => {
          state = "lost";
          quiet();
        },
        onRestored: () => {
          if (disposed) return;
          state = "ready";
          requestFrame();
        },
      });
      if (!layer) {
        state = "off";
        return;
      }
      layerModule = loaded;
      tokensSeen = null;
      batch = {
        signals: new Float32Array(loaded.SIGNAL_CAPACITY * loaded.SIGNAL_STRIDE),
        signalCount: 0,
        blooms: new Float32Array(loaded.BLOOM_CAPACITY * loaded.BLOOM_STRIDE),
        bloomCount: 0,
        inks,
        corePx: 0,
        haloPx: 0,
      };
      state = "ready";
      requestFrame();
    } catch {
      if (state === "pending") state = "off";
    }
  };

  const schedule = () => {
    state = "pending";
    cancelIdle = scheduleIdle(() => {
      cancelIdle = null;
      void create();
    });
  };

  return {
    prepare(now, tokens, world, camera, width, height, focusedNodeId, trailLensActive, clusteredIds) {
      if (probe) prepareStart = performance.now();
      heads.length = 0;
      probeBlooms.length = 0;
      clearSignalledLines();
      if (batch) {
        batch.signalCount = 0;
        batch.bloomCount = 0;
      }
      frameWidth = width;
      frameHeight = height;
      frameNow = now;
      frameFocus = focusedNodeId;
      frameReveal = 1;
      if (probe) {
        frameCamera = { x: camera.x.value, y: camera.y.value, scale: camera.scale.value };
        framePathOpen = refs.mapLensKindRef.current === "path" && (refs.pathEdgeIdsRef.current?.size ?? 0) > 0;
      }
      const reducedMotion = refs.reducedMotionRef.current;
      if (reducedMotion) {
        if (state !== "idle" && state !== "off") {
          release();
          state = "idle";
        }
        quiet();
        return;
      }
      const dome = refs.domeRuntimeRef.current;
      const flat = dome === null || dome.rampClock <= 0;
      if (state === "idle" && flat && width > 0 && height > 0) schedule();
      if (state !== "ready" || !flat || !batch) {
        quiet();
        return;
      }
      if (tokens !== tokensSeen) {
        tokensSeen = tokens;
        kinematics = {
          speed: tokens.lightSpeed,
          hopMinMs: tokens.lightHopMinMs,
          hopMaxMs: tokens.lightHopMaxMs,
          pathMaxMs: tokens.lightPathMaxMs,
          tail: tokens.lightTail,
          intensity: tokens.lightIntensity,
          bloomTauMs: tokens.lightBloomTau * 1000,
        };
        writeInk(tokens.indigoBright, inks, 0);
        batch.corePx = tokens.lightCorePx;
        batch.haloPx = tokens.lightHaloPx;
      }
      frameReveal =
        focusedNodeId !== null && !trailLensActive
          ? edgeRevealProgress(refs.egoRevealRef.current.get(focusedNodeId) ?? 1, false)
          : 1;
      const input: LightSourceInput = {
        now,
        world,
        camera,
        width,
        height,
        tokens,
        kinematics: kinematics!,
        focusedNodeId,
        trailLensActive,
        reducedMotion,
        revealProgress: frameReveal,
        clusteredIds: refs.galaxyRef.current ? EMPTY_IDS : clusteredIds,
        mapLensKind: refs.mapLensKindRef.current,
        pathEdgeIds: refs.pathEdgeIdsRef.current,
        pathNodeIds: refs.spotlightIdsRef.current,
      };
      let alive = false;
      for (const source of sources) alive = source.step(input, emitter) || alive;
      sourcesQuiet = false;
      lightActiveRef.current = alive;
      if (probe) prepareMs = performance.now() - prepareStart;
    },
    render() {
      const renderStart = probe ? performance.now() : 0;
      let drew = false;
      if (state === "ready" && layer && batch) {
        if (batch.signalCount + batch.bloomCount > 0) {
          layer.draw(frameWidth, frameHeight, batch);
          drewLast = true;
          drew = true;
        } else if (drewLast) {
          layer.clear(frameWidth, frameHeight);
          drewLast = false;
        }
      }
      if (!probe) return;
      const renderMs = performance.now() - renderStart;
      const lightMs = prepareMs + renderMs;
      const planMs = prepareMs;
      prepareMs = 0;
      if (lightActiveRef.current || drew) performance.measure("map-light", { start: renderStart, duration: lightMs });
      probe.afterFrame(
        {
          now: frameNow,
          lightMs,
          prepareMs: planMs,
          renderMs,
          focus: frameFocus,
          reveal: frameReveal,
          standDowns: signalledStandDowns(),
          drew,
          camera: frameCamera,
          width: frameWidth,
          height: frameHeight,
          pathOpen: framePathOpen,
          heads: heads.map((head) => ({ ...head })),
          blooms: probeBlooms.slice(),
        },
        layer,
        canvasRef.current,
      );
    },
    dispose() {
      disposed = true;
      release();
      quiet();
      clearSignalledLines();
      state = "off";
      probe?.dispose();
      probe = null;
    },
  };
}
