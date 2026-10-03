import { describe, expect, it } from "vitest";

import type { CameraAxes } from "../engine/camera";
import type { LightEmitter, LightHead, LightSourceInput } from "../light/light-sources";
import type { OntologyMapTokens } from "../tokens/read-map-tokens";
import type { TopologyWorld } from "../ui/topology-world";
import { createDialLightSource } from "./light-source";
import type { DialChordLight, DialLightFrame } from "./types";

const WORLD = {} as TopologyWorld;
const CAMERA: CameraAxes = { x: { value: 0, velocity: 0 }, y: { value: 0, velocity: 0 }, scale: { value: 1, velocity: 0 } };
const TOKENS = { lightCorePx: 1.6, lightHaloPx: 6 } as unknown as OntologyMapTokens;
const KINEMATICS = { speed: 1100, hopMinMs: 180, hopMaxMs: 420, pathMaxMs: 1200, tail: 0.35, intensity: 0.9, bloomTauMs: 280 };

function input(now: number): LightSourceInput {
  return {
    now,
    world: WORLD,
    camera: CAMERA,
    width: 800,
    height: 600,
    tokens: TOKENS,
    kinematics: KINEMATICS,
    focusedNodeId: null,
    trailLensActive: false,
    reducedMotion: false,
    revealProgress: 1,
    clusteredIds: new Set(),
    mapLensKind: null as unknown as LightSourceInput["mapLensKind"],
    pathEdgeIds: null,
    pathNodeIds: null,
  };
}

function emitter() {
  const heads: LightHead[] = [];
  const out: LightEmitter = { wantsHeads: true, signal() {}, bloom() {}, signalled() {}, head: (head) => heads.push(head) };
  return { out, heads };
}

const chord = (key: string, sourceDomain: string, targetDomain: string, ax: number, bx: number): DialChordLight => ({
  key,
  sourceDomain,
  targetDomain,
  a: { x: ax, y: 300 },
  c: { x: (ax + bx) / 2, y: 200 },
  b: { x: bx, y: 300 },
  widthPx: 3,
  chipRadiusPx: 10,
});

const CHORDS = [chord("pay>ship", "pay", "ship", 100, 500), chord("cart>pay", "cart", "pay", 600, 100)];

describe("createDialLightSource", () => {
  it("plans nothing on hover", () => {
    const frame: DialLightFrame = { attentionKey: "pay", focused: false, inkMix: 1, chords: CHORDS };
    const source = createDialLightSource(() => frame);
    expect(source.step(input(0), emitter().out)).toBe(false);
    expect(source.plan()).toBeNull();
  });

  it("waits for the ink before planning", () => {
    let frame: DialLightFrame = { attentionKey: "pay", focused: true, inkMix: 0.5, chords: CHORDS };
    const source = createDialLightSource(() => frame);
    source.step(input(0), emitter().out);
    expect(source.plan()).toBeNull();
    frame = { ...frame, inkMix: 1 };
    expect(source.step(input(120), emitter().out)).toBe(true);
    expect(source.plan()?.createdMs).toBe(120);
  });

  it("rides the chord the frame paints now, not the one it planned on", () => {
    let frame: DialLightFrame = { attentionKey: "pay", focused: true, inkMix: 1, chords: [CHORDS[0]!] };
    const source = createDialLightSource(() => frame);
    source.step(input(0), emitter().out);
    frame = { ...frame, chords: [{ ...CHORDS[0]!, a: { x: 100, y: 340 }, c: { x: 300, y: 240 }, b: { x: 500, y: 340 } }] };
    const { out, heads } = emitter();
    source.step(input(80), out);
    expect(heads[0]!.curve).toEqual([100, 340, 300, 240, 500, 340]);
  });

  it("draws no head for a line the frame does not paint, and rides it again when it returns", () => {
    let frame: DialLightFrame = { attentionKey: "pay", focused: true, inkMix: 1, chords: CHORDS };
    const source = createDialLightSource(() => frame);
    source.step(input(0), emitter().out);
    frame = { ...frame, chords: [CHORDS[1]!] };
    const hidden = emitter();
    const signalled: number[][] = [];
    hidden.out.signalled = (a, c, b) => signalled.push([a.x, a.y, c.x, c.y, b.x, b.y]);
    expect(source.step(input(40), hidden.out)).toBe(true);
    expect(hidden.heads.map((h) => h.key)).toEqual(["cart>pay"]);
    expect(signalled).toEqual([[600, 300, 350, 200, 100, 300]]);
    frame = { ...frame, chords: CHORDS };
    const back = emitter();
    source.step(input(60), back.out);
    expect(back.heads.map((h) => h.key).sort()).toEqual(["cart>pay", "pay>ship"]);
  });

  it("sends one signal per chord, departing at its source domain", () => {
    const frame: DialLightFrame = { attentionKey: "pay", focused: true, inkMix: 1, chords: CHORDS };
    const source = createDialLightSource(() => frame);
    const { out, heads } = emitter();
    source.step(input(0), out);
    const signals = source.plan()!.signals;
    expect(signals.map((s) => [s.key, s.fromId, s.toId]).sort()).toEqual([
      ["cart>pay", "cart", "pay"],
      ["pay>ship", "pay", "ship"],
    ]);
    source.step(input(16), out);
    const byKey = new Map(heads.map((head) => [head.key, head]));
    expect(byKey.get("pay>ship")!.curve.slice(0, 2)).toEqual([100, 300]);
    expect(byKey.get("cart>pay")!.curve.slice(0, 2)).toEqual([600, 300]);
  });

  it("replans when the attention key changes", () => {
    let frame: DialLightFrame = { attentionKey: "pay", focused: true, inkMix: 1, chords: CHORDS };
    const source = createDialLightSource(() => frame);
    source.step(input(0), emitter().out);
    const first = source.plan();
    source.step(input(16), emitter().out);
    expect(source.plan()).toBe(first);
    frame = { attentionKey: "ship", focused: true, inkMix: 1, chords: [CHORDS[0]!] };
    source.step(input(32), emitter().out);
    expect(source.plan()).not.toBe(first);
    expect(source.plan()!.anchorId).toBe("ship");
    expect(source.plan()!.signals).toHaveLength(1);
  });

  it("takes an unchanged focus on a new world without replaying its lights", () => {
    let frame: DialLightFrame = { attentionKey: "pay", focused: true, inkMix: 1, chords: CHORDS };
    const source = createDialLightSource(() => frame);
    source.step(input(0), emitter().out);
    expect(source.plan()).not.toBeNull();
    const refreshed = { ...input(2000), world: {} as TopologyWorld };
    const { out, heads } = emitter();
    expect(source.step(refreshed, out)).toBe(false);
    expect(source.plan()).toBeNull();
    expect(source.step({ ...refreshed, now: 2016 }, out)).toBe(false);
    expect(source.plan()).toBeNull();
    expect(heads).toEqual([]);
    frame = { ...frame, attentionKey: "ship" };
    expect(source.step({ ...refreshed, now: 2032 }, out)).toBe(true);
    expect(source.plan()!.anchorId).toBe("ship");
  });

  it("plans a focus that changed with the world", () => {
    let frame: DialLightFrame = { attentionKey: "pay", focused: true, inkMix: 1, chords: CHORDS };
    const source = createDialLightSource(() => frame);
    source.step(input(0), emitter().out);
    frame = { ...frame, attentionKey: "ship" };
    expect(source.step({ ...input(500), world: {} as TopologyWorld }, emitter().out)).toBe(true);
    expect(source.plan()!.anchorId).toBe("ship");
  });

  it("plans nothing when there are no chords", () => {
    const frame: DialLightFrame = { attentionKey: "pay", focused: true, inkMix: 1, chords: [] };
    const source = createDialLightSource(() => frame);
    expect(source.step(input(0), emitter().out)).toBe(false);
    expect(source.plan()).toBeNull();
  });
});
