import type { LightEmitter, LightSource } from "../light/light-sources";
import {
  bloomAt,
  curveLength,
  curvePoint,
  headFadeAt,
  isPlanAlive,
  type LightPlan,
  planFocusSignal,
  type SignalEdge,
  signalFrame,
  stepPlan,
} from "../light/signal-plan";
import type { TopologyWorld } from "../ui/topology-world";
import type { DialChordLight, DialLightFrame, Point } from "./types";

const HEAD_HALO_WEIGHT = 0.35;
const HEAD_HALO_SHARE = 0.5;
const BLOOM_SIGMA_PER_RADIUS = 0.85;
const BLOOM_HALO_SPREAD = 2.2;
const BLOOM_HALO_WEIGHT = 0.3;

interface Bloom {
  arrivedMs: number;
  key: string;
  fromA: boolean;
  radiusPx: number;
}

function chordEdge(chord: DialChordLight): SignalEdge<DialChordLight> {
  return {
    key: chord.key,
    edge: chord,
    sourceId: chord.sourceDomain,
    targetId: chord.targetDomain,
    directional: true,
    evidenceCount: 0,
    lengthPx: curveLength(chord.a, chord.c, chord.b),
    sourceRadiusPx: chord.chipRadiusPx,
    targetRadiusPx: chord.chipRadiusPx,
  };
}

export function createDialLightSource(read: () => DialLightFrame | null): LightSource {
  const head: Point = { x: 0, y: 0 };
  const blooms = new Map<string, Bloom>();
  let world: TopologyWorld | null = null;
  let attention: string | null = null;
  let planned = false;
  let current: LightPlan<DialChordLight> | null = null;

  const clear = () => {
    attention = null;
    planned = false;
    current = null;
    blooms.clear();
  };

  return {
    id: "dial",
    readsPaint: true,
    plan: () => current as LightPlan<never> | null,
    reset() {
      world = null;
      clear();
    },
    step(input, out: LightEmitter) {
      if (input.world !== world) {
        world = input.world;
        clear();
      }
      const frame = read();
      if (frame === null || !frame.focused) {
        clear();
        return false;
      }
      if (frame.attentionKey !== attention) {
        clear();
        attention = frame.attentionKey;
      }
      if (!planned && frame.inkMix >= 1) {
        planned = true;
        current = frame.chords.length > 0 ? planFocusSignal(frame.attentionKey, frame.chords.map(chordEdge), input.now, input.kinematics, input.reducedMotion) : null;
      }
      if (current === null) return false;
      const { kinematics, tokens } = input;
      const live = new Map(frame.chords.map((chord) => [chord.key, chord]));
      stepPlan(current, input.now, 1);
      for (const signal of current.signals) {
        const signalAt = signalFrame(signal, input.now, 1, kinematics);
        if (!signalAt.started) continue;
        const chord = live.get(signal.key) ?? signal.edge;
        const fromA = signal.from === "a";
        const departure = fromA ? chord.a : chord.b;
        const arrival = fromA ? chord.b : chord.a;
        if (signal.bloomId !== null && signalAt.arrived && !blooms.has(signal.bloomId)) {
          blooms.set(signal.bloomId, { arrivedMs: signal.arrivedMs, key: signal.key, fromA, radiusPx: chord.chipRadiusPx });
        }
        if (signalAt.done) continue;
        out.signalled(chord.a, chord.c, chord.b);
        out.signal(departure, chord.c, arrival, signalAt.tailStart, signalAt.drawnEnd, signalAt.head, kinematics.intensity * signalAt.ignite);
        const t = Math.min(signalAt.head, signalAt.drawnEnd);
        curvePoint(departure, chord.c, arrival, t, head);
        const headStrength = signalAt.arrived ? headFadeAt(input.now - signal.arrivedMs) : 1;
        if (headStrength > 0) {
          out.bloom(`head:${signal.key}`, head.x, head.y, tokens.lightCorePx, tokens.lightHaloPx * HEAD_HALO_SHARE, HEAD_HALO_WEIGHT, kinematics.intensity * signalAt.ignite * headStrength);
        }
        if (out.wantsHeads) {
          out.head({
            source: "dial",
            key: signal.key,
            t,
            x: head.x,
            y: head.y,
            arrived: signalAt.arrived,
            revealBound: signal.revealBound,
            departAt: signal.departAt,
            arriveAt: signal.arriveAt,
            curve: [departure.x, departure.y, chord.c.x, chord.c.y, arrival.x, arrival.y],
          });
        }
      }
      for (const [domainId, bloom] of blooms) {
        const strength = bloomAt(input.now - bloom.arrivedMs, kinematics);
        if (!(strength > 0)) continue;
        const chord = live.get(bloom.key);
        if (!chord) continue;
        const at = bloom.fromA ? chord.b : chord.a;
        const sigma = Math.max(tokens.lightHaloPx, bloom.radiusPx * BLOOM_SIGMA_PER_RADIUS);
        out.bloom(`node:${domainId}`, at.x, at.y, sigma, sigma * BLOOM_HALO_SPREAD, BLOOM_HALO_WEIGHT, strength);
      }
      const alive = isPlanAlive(current, input.now, 1, kinematics);
      if (!alive) current = null;
      return alive;
    },
  };
}
