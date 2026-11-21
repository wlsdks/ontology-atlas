import { FLIGHT, closeUpTravelMs, flightMs, flightStart, litLineStart } from '../../lib/film/film-acts';
import { bowedPoints, polylineLength, subPolyline, type Pt } from '../../lib/film/film-geometry';
import type { FilmLitLine, FilmMapLayout } from '../../lib/film/film-map-shapes';
import type { OpenLayout } from '../../lib/film/film-open';
import type { FilmVault } from '../../lib/film/film-vault';
import { rowOnPhone, type PlacedRow, type WallLayout } from '../../lib/film/film-wall';
import { ribbonPath } from './film-ribbon';
import type { TextStamps } from './text-stamps';

export interface FilmInks {
  ground: string;
  halo: string;
  discFill: string;
  name: string;
  strong: string;
  project: string;
  arc: string;
  reach: string;
  agent: string;
  primary: string;
  secondary: string;
  tertiary: string;
  panel: string;
  border: string;
  borderSoft: string;
  rest: string;
}

interface FlightPlan {
  id: string;
  start: number;
  from: Pt;
  text: string;
  rowAlpha: number;
  side: number;
  dropText: boolean;
  /** How long it flies: longer for a far row, so no frame moves it too far. */
  ms: number;
}

interface LitPlan {
  line: FilmLitLine;
  start: number;
  length: number;
  dots: Pt[];
  path: Path2D | null;
  glint: number;
}

interface ArcPlan {
  index: number;
  start: number;
  path: Path2D;
}

export interface FrameRecord {
  set(key: string, x: number, y: number, alpha: number): void;
}

export interface FilmPaintScene {
  vault: FilmVault;
  map: FilmMapLayout;
  wall: WallLayout;
  open: OpenLayout | null;
  inks: FilmInks;
  stamps: TextStamps;
  sprites: Map<string, HTMLCanvasElement>;
  flights: Map<string, FlightPlan>;
  fragment: Set<string>;
  arcs: ArcPlan[];
  lit: LitPlan[];
  rowOf: Map<string, PlacedRow>;
  slotSide: Map<string, number>;
  /** How long act 3 carries the close-up's marks to the map: longer where they travel far on a small stage. */
  travelMs: number;
  sink: number;
  mono: string;
  record: FrameRecord | null;
}

export function buildFilmPaintScene(
  vault: FilmVault,
  map: FilmMapLayout,
  wall: WallLayout,
  open: OpenLayout | null,
  inks: FilmInks,
  stamps: TextStamps,
  sprites: Map<string, HTMLCanvasElement>,
  { sink, mono }: { sink: number; mono: string },
): FilmPaintScene {
  const pick = map.pick;
  const fragment = new Set<string>();
  if (pick && open) {
    const node = vault.byId.get(pick)!;
    fragment.add(pick);
    if (node.domain) fragment.add(node.domain);
    node.elements.forEach((e) => fragment.add(e));
  }
  const rowOf = new Map<string, PlacedRow>();
  for (const row of wall.rows) if (row.row.id) rowOf.set(row.row.id, row);
  const slotSide = new Map(map.order.map((id, i) => [id, i % 2 ? -1 : 1]));
  const flights = new Map<string, FlightPlan>();
  const plan = (id: string, start: number, kind: 'hub' | 'capability' | 'element') => {
    const row = rowOf.get(id);
    if (!row || !map.marks.has(id)) return;
    let at: Pt = { x: row.x + row.width / 2, y: row.y };
    let rowAlpha = 1;
    if (wall.window) {
      const on = rowOnPhone(wall, row, wall.scrollTo);
      at = { x: row.x + row.width / 2, y: Math.min(wall.window.b, Math.max(wall.window.t, on.y)) };
      rowAlpha = on.alpha;
    }
    const domain = map.marks.get(id)!.domain;
    const to = map.marks.get(id)!;
    const side = domain ? slotSide.get(domain) ?? 1 : 1;
    const path = bowedPoints(at, to, FLIGHT.bow * side, 24);
    flights.set(id, {
      ms: flightMs(polylineLength(path), Math.hypot(map.w, map.h)),
      id,
      start,
      from: at,
      text: row.text,
      rowAlpha,
      side,
      dropText: Boolean(wall.window) && kind === 'element',
    });
  };
  const hubs = [...(vault.project ? [vault.project.id] : []), ...map.order].filter((id) => !fragment.has(id));
  hubs.forEach((id, k) => plan(id, flightStart('hub', k), 'hub'));
  let capRank = 0;
  let elementRank = 0;
  for (const domain of map.order) {
    const caps = vault.capabilities.filter((c) => c.domain === domain && !fragment.has(c.id));
    for (const c of caps) plan(c.id, flightStart('capability', capRank++), 'capability');
  }
  for (const domain of map.order) {
    const caps = vault.capabilities.filter((c) => c.domain === domain);
    const elements = [
      ...caps.flatMap((c) => c.elements),
      ...vault.elements.filter((e) => e.domain === domain && !e.capability).map((e) => e.id),
    ].filter((e) => !fragment.has(e));
    for (const e of elements) plan(e, flightStart('element', elementRank++), 'element');
  }

  const arcs = map.restArcs.map((arc, index) => ({
    index,
    start: FLIGHT.arcFrom + index * FLIGHT.arcStep,
    path: ribbonPath(arc.pts, arc.width, 0, 1, true),
  }));

  const lit: LitPlan[] = [];
  if (map.lit) {
    const counts = { needs: map.lit.lines.filter((l) => l.kind === 'needs').length, neededBy: map.lit.lines.filter((l) => l.kind === 'neededBy').length };
    const rank = { needs: 0, neededBy: 0, relates: 0, own: 0 };
    let glint = 0;
    for (const line of map.lit.lines) {
      const length = polylineLength(line.pts);
      const dots: Pt[] = [];
      if (line.kind === 'relates') {
        const gap = map.sizes.wide ? 6.4 : 5.6;
        for (let d = 0; d <= length; d += gap) dots.push(subPolyline(line.pts, 0, d / length).pop() ?? line.pts[0]!);
      }
      lit.push({
        line,
        start: litLineStart(line.kind, rank[line.kind]++, counts),
        length,
        dots,
        path: line.kind === 'own' || line.kind === 'relates' ? null : ribbonPath(line.pts, line.width, 0, 1, !line.towardPick),
        glint: line.kind === 'own' ? -1 : glint++,
      });
    }
  }
  let travelMs: number = FLIGHT.travelMs;
  if (pick && open) {
    const node = vault.byId.get(pick)!;
    const legs: [Pt, Pt | undefined][] = [
      [open.pick, map.marks.get(pick)],
      [open.domain, node.domain ? map.marks.get(node.domain) : undefined],
      ...open.dots.map((d, k): [Pt, Pt | undefined] => [d, map.marks.get(node.elements[k]!)]),
    ];
    const far = Math.max(0, ...legs.map(([a, b]) => (b ? Math.hypot(b.x - a.x, b.y - a.y) : 0)));
    travelMs = closeUpTravelMs(far, Math.hypot(map.w, map.h));
  }
  return { vault, map, wall, open, inks, stamps, sprites, flights, fragment, arcs, lit, rowOf, slotSide, travelMs, sink, mono, record: null };
}
