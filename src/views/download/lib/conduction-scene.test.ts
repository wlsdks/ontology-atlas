import { describe, expect, it } from 'vitest';

import { CONDUCTION_ANSWER } from '../model/conduction-cast';
import {
  BLOOM_RISE_MS,
  buildConductionGeometry,
  CONDUCTION_CLOCK,
  CONDUCTION_LOOPS,
  CONDUCTION_WIDE_MIN,
  conductionSchedule,
  conductionStill,
  conductionTiming,
  conductionTracks,
  type ConductionLight,
} from './conduction-scene';

const EASING = { ease: 'ease', exit: 'ease-in', canvas: 'linear', surface: 'linear', control: 'linear' };
const LIGHT: ConductionLight = {
  speed: 1100,
  hopMinMs: 180,
  hopMaxMs: 420,
  tail: 0.35,
  intensity: 0.9,
  bloomTauMs: 280,
  restAlpha: 0.42,
};
const c = CONDUCTION_CLOCK;

function valueAt(frames: Keyframe[], offset: number, property: string): unknown {
  const before = [...frames].reverse().find((frame) => (frame.offset ?? 0) <= offset && property in frame);
  const after = frames.find((frame) => (frame.offset ?? 1) >= offset && property in frame);
  expect(before?.[property], `${property} changes across offset ${offset}`).toEqual(after?.[property]);
  return before?.[property];
}

describe('the conduction clock', () => {
  it('runs the story in causal order: code, ontology, question, answer, proposal, approval, rest', () => {
    for (const layout of ['wide', 'narrow'] as const) {
      const s = conductionSchedule(LIGHT, layout);
      const lastRise = Math.max(...s.riseAt.values()) ;
      const lastConceptRise = Math.max(...[...s.riseAt.entries()].filter(([id]) => /^(capability|element):/.test(id)).map(([, at]) => at));
      expect(lastConceptRise + c.canvasVisual, layout).toBeLessThanOrEqual(c.relations);
      expect(c.domains + c.canvasVisual).toBeLessThanOrEqual(c.domainEdges);
      expect(c.project + c.canvasVisual).toBeLessThanOrEqual(c.projectEdges);
      expect(lastRise).toBe(c.project);
      expect(c.projectEdges + c.base).toBeLessThanOrEqual(c.ask);
      expect(c.ask + c.base).toBeLessThanOrEqual(c.query);
      const egoDone = Math.max(...s.ego.map((hop) => hop.start + hop.hop * (1 + LIGHT.tail)));
      expect(egoDone, layout).toBeLessThanOrEqual(c.reply);
      expect(s.replyArrive + CONDUCTION_ANSWER.length * c.stagger + c.base, layout).toBeLessThanOrEqual(c.propose);
      expect(c.propose + c.settle).toBeLessThanOrEqual(c.approve);
      const lastBloom = s.writeStart + s.writeHop + BLOOM_RISE_MS + LIGHT.bloomTauMs * 3;
      expect(lastBloom, layout).toBeLessThanOrEqual(c.rest);
      expect(c.rest).toBeLessThan(c.clear);
      expect(c.clear + c.fast).toBeLessThanOrEqual(c.loop);
    }
  });

  it('lights every relation the answer touched in the same frame, each within the light clamp', () => {
    for (const layout of ['wide', 'narrow'] as const) {
      const s = conductionSchedule(LIGHT, layout);
      expect(new Set(s.ego.map((hop) => hop.start))).toEqual(new Set([s.arrive]));
      for (const hop of [...s.ego.map((ego) => ego.hop), s.queryHop, s.replyHop, s.writeHop]) {
        expect(hop).toBeGreaterThanOrEqual(LIGHT.hopMinMs);
        expect(hop).toBeLessThanOrEqual(LIGHT.hopMaxMs);
      }
    }
  });

  it('builds three times and ends on the finished frame, whether it opens on that frame or on the build', () => {
    const rest = c.rest / c.loop;
    for (const fromRest of [true, false]) {
      const timing = conductionTiming(fromRest);
      const start = timing.iterationStart ?? 0;
      const end = start + Number(timing.iterations);
      expect(timing.fill).toBe('both');
      expect(start, `fromRest=${fromRest}`).toBeCloseTo(fromRest ? rest : 0, 6);
      expect(end % 1, `fromRest=${fromRest}`).toBeCloseTo(rest, 6);
      const builds = Math.floor(end) - Math.ceil(start) + 1;
      expect(builds, `fromRest=${fromRest}`).toBe(CONDUCTION_LOOPS);
    }
  });
});

describe('conductionTracks', () => {
  const geometries = [buildConductionGeometry(1440 - 400), buildConductionGeometry(358)];
  const rest = c.rest / c.loop;

  it('gives every lane a whole loop whose offsets never run backwards', () => {
    for (const geometry of geometries) {
      for (const [part, lanes] of Object.entries(conductionTracks(geometry, EASING, LIGHT))) {
        for (const frames of lanes) {
          const offsets = frames.map((frame) => frame.offset as number);
          expect(offsets[0], part).toBe(0);
          expect(offsets[offsets.length - 1], part).toBe(1);
          expect(offsets, part).toEqual([...offsets].sort((a, b) => a - b));
        }
      }
    }
  });

  it('rests on the frame a reduced-motion reader sees, so stopping never jumps', () => {
    for (const geometry of geometries) {
      const tracks = conductionTracks(geometry, EASING, LIGHT);
      expect(Object.keys(tracks).length).toBeGreaterThan(60);
      for (const [part, lanes] of Object.entries(tracks)) {
        const still = conductionStill(part, LIGHT.restAlpha);
        for (const frames of lanes) {
          for (const property of Object.keys(frames[0]!).filter((key) => key !== 'offset' && key !== 'easing')) {
            if (property === 'strokeDasharray') continue;
            expect(property in still, `${part} animates ${property}, which the still frame does not set`).toBe(true);
            expect(valueAt(frames, rest, property), `${part} ${property}`).toEqual(still[property]);
          }
        }
      }
    }
  });

  it('clears to an empty stage before each loop starts again, so the seam never jumps', () => {
    const shown = (lanes: Keyframe[][], at: 'first' | 'last') =>
      lanes.every((frames) => {
        const frame = at === 'first' ? frames[0]! : frames[frames.length - 1]!;
        if ('opacity' in frame && Number(frame.opacity) === 0) return false;
        if ('strokeDashoffset' in frame && frame.strokeDashoffset === '1') return false;
        return true;
      });
    for (const geometry of geometries) {
      for (const [part, lanes] of Object.entries(conductionTracks(geometry, EASING, LIGHT))) {
        if (part.startsWith('dim:') || part.startsWith('held:') || part === 'press' || part === 'proposal-pending') continue;
        if (part === 'proposal-reveal' || part === 'check') continue;
        expect(shown(lanes, 'first'), `${part} is visible as the loop starts`).toBe(false);
        expect(shown(lanes, 'last'), `${part} is visible as the loop ends`).toBe(false);
      }
      const tracks = conductionTracks(geometry, EASING, LIGHT);
      for (const container of ['proposal-written', 'proposal']) {
        expect(shown(tracks[container]!, 'last'), `${container} still shows what it reveals`).toBe(false);
      }
    }
  });

  it('keeps one clock at every width of a layout, so a window drag never restarts the story', () => {
    const offsets = (available: number) =>
      Object.fromEntries(
        Object.entries(conductionTracks(buildConductionGeometry(available), EASING, LIGHT)).map(([part, lanes]) => [
          part,
          lanes.map((frames) => frames.map((frame) => frame.offset)),
        ]),
      );
    expect(offsets(CONDUCTION_WIDE_MIN)).toEqual(offsets(1520));
    expect(offsets(300)).toEqual(offsets(CONDUCTION_WIDE_MIN - 1));
  });
});

describe('buildConductionGeometry', () => {
  it('fits every width it is given and keeps the agent beside or below the ontology', () => {
    for (let available = 300; available <= 1520; available += 37) {
      const geometry = buildConductionGeometry(available);
      for (const mark of geometry.marks) {
        expect(mark.x - mark.size / 2, `${available}px ${mark.id}`).toBeGreaterThanOrEqual(0);
        expect(mark.x + mark.size / 2, `${available}px ${mark.id}`).toBeLessThanOrEqual(geometry.planeX1 + 1);
      }
      if (geometry.layout === 'wide') expect(geometry.agent.x).toBeGreaterThan(geometry.planeX1);
      else expect(geometry.agent.y).toBeGreaterThan(Math.max(...geometry.files.map((file) => file.y)));
      expect(geometry.agent.x + geometry.agent.width, `${available}px`).toBeLessThanOrEqual(geometry.width);
    }
  });

  it('never lets two domain names share a line on a wide stage', () => {
    for (let available = CONDUCTION_WIDE_MIN; available <= 1520; available += 41) {
      const geometry = buildConductionGeometry(available);
      const domains = geometry.labels.filter((label) => label.id.startsWith('domain:'));
      const chips = geometry.marks.filter((mark) => mark.kind === 'domain');
      domains.forEach((label, index) => {
        const next = chips[index + 1];
        if (next) expect(label.x + label.maxWidth, `${available}px ${label.id}`).toBeLessThan(next.x - next.size / 2);
      });
    }
  });

  it('raises every capability and element from the file it names, and every domain from its capabilities', () => {
    const geometry = buildConductionGeometry(1120);
    const fileOf = new Map(geometry.files.map((file) => [file.owner, file]));
    for (const mark of geometry.marks) {
      if (mark.kind === 'capability' || mark.kind === 'element') {
        expect(mark.origin.x, mark.id).toBe(fileOf.get(mark.id)!.x);
        expect(mark.origin.y, mark.id).toBeGreaterThan(mark.y);
      } else {
        expect(mark.origin.x, mark.id).toBe(mark.x);
        expect(mark.origin.y, mark.id).toBeGreaterThan(mark.y);
      }
    }
  });
});
