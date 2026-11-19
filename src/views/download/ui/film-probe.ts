import type { Pt, Rect } from '../lib/film-geometry';
import type { FilmLabel } from '../lib/film-map-layout';
import type { FilmScene, FrameRecord } from './film-paint';

/**
 * The film's geometry and frames for end-to-end specs, mounted only under `?e2e`: the final
 * layout of the rest and lit frames as JSON, and a recorder of what each frame drew, so a spec
 * can measure overlaps, margins and continuity without reading pixels.
 */
export interface FilmProbe {
  layout(scene: FilmScene): void;
  frame(T: number, light: number): void;
  cost(ms: number): void;
  readonly recorder: FrameRecord;
  unmount(): void;
}

const round = (v: number) => Math.round(v * 10) / 10;
const FRAME_60 = 1000 / 60;
const rect = (r: Rect) => ({ l: round(r.l), t: round(r.t), r: round(r.r), b: round(r.b) });
const pts = (list: readonly Pt[]) => list.map((p) => [round(p.x), round(p.y)]);
const box = (label: FilmLabel) => ({ key: label.key, id: label.id, role: label.role, text: label.segments.map((s) => s.text).join(''), size: label.size, rect: rect(label.box) });

function layoutJson(scene: FilmScene) {
  const { map } = scene;
  const marks = [...map.marks.values()].map((m) => ({ id: m.id, kind: m.kind, domain: m.domain, x: round(m.x), y: round(m.y), r: round(m.kind === 'project' ? m.r * 1.35 : m.r) }));
  const rest = {
    boxes: [
      ...map.restLabels.map(box),
      /* An arc whose count found no clear spot carries none. */
      ...map.restArcs.flatMap((arc) => {
        const q = arc.numeral;
        if (!q) return [];
        const r = map.sizes.numeralR;
        return [{ key: `numeral:${arc.from}>${arc.to}`, id: null, role: 'numeral', text: String(arc.count), size: map.sizes.fNumeral, rect: rect({ l: q.x - r, t: q.y - r, r: q.x + r, b: q.y + r }) }];
      }),
    ],
    marks,
    lines: map.restArcs.map((arc) => ({ kind: 'arc', from: arc.from, to: arc.to, count: arc.count, pts: pts(arc.pts) })),
  };
  const lit = map.lit
    ? {
        pick: map.lit.pick,
        reach: { needs: map.lit.reach.needs.length, neededBy: map.lit.reach.neededBy.length, relates: map.lit.reach.relates.length },
        boxes: map.lit.labels.map(box),
        marks: marks.map((m) => {
          const dot = map.lit!.ownDots.get(m.id);
          if (dot) return { ...m, x: round(dot.x), y: round(dot.y) };
          if (m.id === map.lit!.pick) return { ...m, r: round(map.lit!.agentR) };
          return m;
        }),
        lines: map.lit.lines.map((line) => ({ kind: line.kind, end: line.end, pts: pts(line.pts) })),
        leader: map.lit.leader ? pts([map.lit.leader.from, map.lit.leader.to]) : null,
        pointer: rect(map.lit.pointerBox),
        agentRing: { x: round(map.marks.get(map.lit.pick)!.x), y: round(map.marks.get(map.lit.pick)!.y), r: round(map.lit.agentR) },
        keys: map.lit.keys,
      }
    : null;
  return {
    w: map.w,
    h: map.h,
    wide: map.sizes.wide,
    safe: map.sizes.safe,
    titleBox: rect(map.titleBox),
    captionBox: rect(map.captionBox),
    pick: map.pick,
    order: map.order,
    clusters: map.clusters.map((c) => ({ id: c.id, x: round(c.x), y: round(c.y), footprint: round(c.footprint), nameBlock: rect(c.nameBlock) })),
    rest,
    lit,
  };
}

interface Delta {
  key: string;
  value: number;
  T: number;
}

export function mountFilmProbe(
  host: HTMLElement | null,
  current: () => FilmScene | null,
  freeze: (T: number | null) => void,
): FilmProbe {
  let json: ReturnType<typeof layoutJson> | null = null;
  let now = new Map<string, [number, number, number]>();
  let last = new Map<string, [number, number, number]>();
  let lastT = -1;
  let lastLight = 1;
  let recording = false;
  const frames: { T: number; light: number; cost: number }[] = [];
  let pendingCost = 0;
  let worstMove: Delta = { key: '', value: 0, T: 0 };
  let worstAlpha: Delta = { key: '', value: 0, T: 0 };
  const recorder: FrameRecord = {
    set(key, x, y, alpha) {
      if (recording) now.set(key, [x, y, alpha]);
    },
  };
  const api = {
    layout: () => json,
    /** Holds the film on film time `T` (ms); null lets it play again. */
    freeze,
    start() {
      recording = true;
      frames.length = 0;
      last = new Map();
      now = new Map();
      worstMove = { key: '', value: 0, T: 0 };
      worstAlpha = { key: '', value: 0, T: 0 };
      lastT = -1;
    },
    stop() {
      recording = false;
      return { frames: [...frames], worstMove, worstAlpha };
    },
    stamps: () => {
      const scene = current();
      return scene ? scene.stamps.size : 0;
    },
  };
  (window as unknown as { __atlasFilm?: typeof api }).__atlasFilm = api;
  host?.setAttribute('data-film-probe', 'ready');
  return {
    recorder,
    layout(scene) {
      json = layoutJson(scene);
    },
    frame(T, light) {
      const scene = current();
      if (!recording || !scene) return;
      frames.push({ T: Math.round(T * 10) / 10, light: Math.round(light * 1000) / 1000, cost: Math.round(pendingCost * 100) / 100 });
      pendingCost = 0;
      /* Across the loop's seam the canvas is dark, and a value may restart there. */
      const seam = light < 0.02 || lastLight < 0.02 || T < lastT;
      if (!seam) {
        for (const [key, [x, y, a]] of now) {
          const before = last.get(key);
          if (!before) continue;
          /* Per 60 Hz frame of film time, so a faster display does not hide a jump. */
          const per = FRAME_60 / Math.max(1, T - lastT);
          const move = Math.hypot(x - before[0], y - before[1]) * per;
          const fade = Math.abs(a - before[2]) * per;
          if (move > worstMove.value) worstMove = { key, value: move, T };
          if (fade > worstAlpha.value) worstAlpha = { key, value: fade, T };
        }
      }
      last = now;
      now = new Map();
      lastT = T;
      lastLight = light;
    },
    cost(ms) {
      pendingCost = ms;
    },
    unmount() {
      delete (window as unknown as { __atlasFilm?: typeof api }).__atlasFilm;
      host?.removeAttribute('data-film-probe');
    },
  };
}
