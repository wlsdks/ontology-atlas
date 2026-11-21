import {
  DEG,
  angleGap,
  bowedPoints,
  circleIntoRect,
  crossings,
  dist,
  grow,
  inside,
  normalizeAngle,
  overlaps,
  pointAlong,
  polylineLength,
  resample,
  trim,
  type Pt,
  type Rect,
} from '../film-geometry';
import { LABEL_PAD, LabelField, fontOf, makeLabel, type FilmLabel, type InkRole, type LabelRole, type LabelSegment } from './film-map-labels';
import type { FilmClusterPlacement } from './film-map-placement';
import type { FilmArc, FilmCluster, FilmLayoutInput, FilmLit, FilmLitLine, FilmMapLayout, FilmMark } from './film-map-shapes';
import { REST_NAMES_PX } from './film-map-sizes';
import { dotOffsets } from './film-local-cluster';
import { reachOf } from '../film-vault';

const NAME_GAP = 7;
const CROSSING_COST = 4000;
const NUMERAL_SPOTS = [0.5, 0.44, 0.56, 0.38, 0.62, 0.32, 0.68, 0.26, 0.74];

/** The names, arcs and lit lines drawn over a placed map. */
export interface FilmMapAnnotations {
  stems: FilmMapLayout['stems'];
  restArcs: FilmArc[];
  restLabels: FilmLabel[];
  lit: FilmLit | null;
}

export function annotateFilmMap(input: FilmLayoutInput, placement: FilmClusterPlacement): FilmMapAnnotations {
  const { vault, w, measure, sans, mono, tokens, copy } = input;
  const { S, pick, titleBox, captionBox, bounds, order, flows, arcBows, locals, marks, clusters } = placement;
  const clusterOf = new Map(clusters.map((c) => [c.id, c]));

  const stems: FilmMapLayout['stems'] = [];
  for (const id of order) {
    if (vault.project) stems.push({ from: vault.project.id, to: id, alpha: 0.16 });
    for (const it of locals.get(id)!.items) stems.push({ from: id, to: it.id, alpha: 0.24 });
  }

  const blockLabels: FilmLabel[] = [];
  for (const c of clusters) {
    for (const row of locals.get(c.id)!.rows) {
      blockLabels.push(
        makeLabel(measure, `${row.key}:${c.id}`, c.id, row.role, [{ text: row.text, ink: row.role === 'domain' ? 'strong' : 'tertiary' }], row.font, row.size, c.x, c.y + row.dy, 'center'),
      );
    }
  }
  let projectLabel: FilmLabel | null = null;
  let projectAt: ((dy: number) => FilmLabel) | null = null;
  let projectLift = 0;
  const project = vault.project ? marks.get(vault.project.id)! : null;
  if (project) {
    const font = fontOf(510, S.fProject, sans);
    const at = (dy: number) =>
      makeLabel(measure, `project:${project.id}`, project.id, 'project', [{ text: vault.project!.label, ink: 'name' }], font, S.fProject, project.x, project.y + dy, 'center');
    const lift = project.r * 1.35 + 8 + S.fProject * 0.6;
    projectAt = at;
    projectLift = lift;
    const taken = (label: FilmLabel) => {
      const box = grow(label.box, LABEL_PAD);
      return clusters.some((c) => overlaps(box, c.nameBlock)) || [...marks.values()].some((m) => m.id !== project.id && circleIntoRect(m, m.r, box) > 0);
    };
    projectLabel = at(-lift);
    if (taken(projectLabel) && !taken(at(lift))) projectLabel = at(lift);
  }

  const baseField = (lit: boolean) => {
    const field = new LabelField(bounds, [titleBox, captionBox]);
    for (const m of marks.values()) {
      const r = m.kind === 'project' ? m.r * 1.35 + 1.5 : m.r;
      if (lit && m.id === pick) continue;
      field.marks.push({ x: m.x, y: m.y, r });
    }
    for (const c of clusters) field.boxes.push(c.nameBlock);
    if (projectLabel) field.take(projectLabel.box);
    return field;
  };

  const spotsAround = (m: Pt & { r: number }, width: number, size: number, outward: number, extra: number[]) => {
    const out: { x: number; y: number; align: FilmLabel['align'] }[] = [];
    const right = Math.cos(outward) >= 0;
    const side = (toRight: boolean, gap: number, dy: number) => ({ x: toRight ? m.x + gap : m.x - gap, y: m.y + dy, align: toRight ? ('left' as const) : ('right' as const) });
    for (const reach of [m.r + NAME_GAP, ...extra.map((e) => m.r + NAME_GAP + e)]) {
      out.push(side(right, reach, 0));
      out.push({ x: m.x, y: m.y - reach - size * 0.5, align: 'center' });
      out.push({ x: m.x, y: m.y + reach + size * 0.5, align: 'center' });
      for (const sign of [-1, 1]) out.push(side(right, reach * Math.cos(40 * DEG), sign * (reach * Math.sin(40 * DEG) + size * 0.4)));
      out.push(side(!right, reach, 0));
      for (const sign of [-1, 1]) out.push(side(!right, reach * Math.cos(40 * DEG), sign * (reach * Math.sin(40 * DEG) + size * 0.4)));
    }
    void width;
    return out;
  };

  const ringSpots = (m: Pt & { r: number }, size: number, toward: number, extra: number[]) => {
    const out: { x: number; y: number; align: FilmLabel['align']; rank: number }[] = [];
    extra.forEach((e, ring) => {
      const reach = m.r + NAME_GAP + e;
      for (let k = 0; k < 16; k += 1) {
        const a = toward + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8);
        const c = Math.cos(a);
        const sn = Math.sin(a);
        const align: FilmLabel['align'] = c > 0.38 ? 'left' : c < -0.38 ? 'right' : 'center';
        const y = m.y + sn * reach + (align === 'center' ? Math.sign(sn) * size * 0.55 : sn * size * 0.3);
        out.push({ x: m.x + c * reach, y, align, rank: ring * 2 + angleGap(a, toward) });
      }
    });
    return out.sort((p, q) => p.rank - q.rank);
  };

  const tryPlace = (
    field: LabelField,
    key: string,
    id: string,
    role: LabelRole,
    segments: LabelSegment[],
    font: string,
    size: number,
    spots: { x: number; y: number; align: FilmLabel['align'] }[],
  ): FilmLabel | null => {
    for (const spot of spots) {
      const label = makeLabel(measure, key, id, role, segments, font, size, spot.x, spot.y, spot.align);
      if (field.free(label.box)) {
        field.take(label.box);
        return label;
      }
    }
    return null;
  };

  const outwardOf = (id: string) => {
    const m = marks.get(id)!;
    const home = m.domain ? marks.get(m.domain)! : project ?? m;
    return Math.atan2(m.y - home.y, m.x - home.x);
  };

  const ringK = S.K;
  let lit: FilmLit | null = null;
  let pickBlock: Rect | null = null;
  const pickMark = pick ? marks.get(pick)! : null;
  const reach = pick ? reachOf(vault, pick) : null;
  let selectedR = 0;
  let agentR = 0;
  let ownDots = new Map<string, Pt>();
  let pickClear = 0;
  let pickLabels: FilmLabel[] = [];
  let pickSpots: { box: Rect; labels: FilmLabel[] }[] = [];
  if (pick && pickMark && reach) {
    selectedR = Math.max(pickMark.r, tokens.selectedDiscPx * ringK);
    agentR = Math.max(pickMark.r, 11 * ringK) + 11 * ringK;
    const own = vault.byId.get(pick)!.elements;
    const away = outwardOf(pick);
    const offsets = dotOffsets(own.length, away, 0, S, agentR + 5);
    ownDots = new Map(own.map((e, k) => [e, { x: pickMark.x + offsets[k]!.x, y: pickMark.y + offsets[k]!.y }]));
    pickClear = agentR + 5 + S.elemAlt + S.elemR + 2;
    if (S.wide) {
      const nameFont = fontOf(650, S.fPick, sans);
      const reachFont = fontOf(400, S.fReach, sans);
      const reachSegs = copy.reach(reach.needs.length, reach.neededBy.length);
      const label = vault.byId.get(pick)!.label;
      const nameW = measure(label, nameFont);
      const reachW = reachSegs.reduce((sum, seg) => sum + measure(seg.text, reachFont), 0);
      const blockH = S.fPick * 1.24 + 4 + S.fReach * 1.24;
      const endAngles = [...reach.needs, ...reach.neededBy, ...reach.relates]
        .filter((e) => !own.includes(e))
        .map((e) => marks.get(e))
        .filter((m): m is FilmMark => Boolean(m))
        .map((m) => Math.atan2(m.y - pickMark.y, m.x - pickMark.x));
      const homeAway = normalizeAngle(away);
      const gap = pickClear + 10;
      const candidates: { a: number; align: FilmLabel['align'] }[] = [];
      const sideAway = Math.cos(homeAway) >= 0 ? 0 : Math.PI;
      candidates.push({ a: sideAway, align: sideAway === 0 ? 'left' : 'right' });
      candidates.push({ a: -Math.PI / 2, align: 'center' });
      for (const a of [-120, -60, -150, -30, 120, 60, 150, 30]) candidates.push({ a: a * DEG, align: Math.cos(a * DEG) > 0.2 ? 'left' : Math.cos(a * DEG) < -0.2 ? 'right' : 'center' });
      candidates.push({ a: Math.PI - sideAway, align: sideAway === 0 ? 'right' : 'left' });
      candidates.push({ a: Math.PI / 2, align: 'center' });
      const field = baseField(true);
      field.marks.push({ x: pickMark.x, y: pickMark.y, r: pickClear });
      /* Beside the pick first; farther out only as a place to move to when lit lines need the near ones. */
      const scored = [0, 24, 48]
        .flatMap((out) => candidates.map((c) => ({ ...c, out })))
        .map((c, k) => {
          const ax = pickMark.x + Math.cos(c.a) * (gap + c.out);
          const ay = pickMark.y + Math.sin(c.a) * (gap + c.out);
          const width = Math.max(nameW, reachW);
          const l = c.align === 'left' ? ax : c.align === 'right' ? ax - width : ax - width / 2;
          const top = Math.sin(c.a) < -0.3 ? ay - blockH : Math.sin(c.a) > 0.3 ? ay : ay - blockH / 2;
          const box: Rect = { l, t: top, r: l + width, b: top + blockH };
          const lineHit = endAngles.some((e) => angleGap(e, c.a) < 28 * DEG) ? 1 : 0;
          return { c, k, box, ax, top, lineHit };
        })
        .filter((row) => field.free(row.box))
        .sort((a, b) => a.c.out - b.c.out || a.lineHit - b.lineHit || a.k - b.k);
      pickSpots = scored.map((row) => {
        const nameY = row.top + (S.fPick * 1.24) / 2;
        const reachY = row.top + S.fPick * 1.24 + 4 + (S.fReach * 1.24) / 2;
        const ax = row.c.align === 'left' ? row.box.l : row.c.align === 'right' ? row.box.r : (row.box.l + row.box.r) / 2;
        return {
          box: row.box,
          labels: [
            makeLabel(measure, `pick:${pick}`, pick, 'pick', [{ text: label, ink: 'strong' }], nameFont, S.fPick, ax, nameY, row.c.align),
            makeLabel(measure, `reach:${pick}`, pick, 'reach', reachSegs, reachFont, S.fReach, ax, reachY, row.c.align),
          ],
        };
      });
      if (pickSpots[0]) {
        pickBlock = pickSpots[0].box;
        pickLabels = pickSpots[0].labels;
      }
    }
  }

  const restField = baseField(false);
  const restArcs: FilmArc[] = [];
  const sideOf = new Map<string, number>();
  let crossedSoFar = 0;
  const pickZone = pickMark ? { x: pickMark.x, y: pickMark.y, r: pickClear + 8 } : null;
  for (const f of flows) {
    const A = clusterOf.get(f.from);
    const B = clusterOf.get(f.to);
    if (!A || !B) continue;
    const width = Math.min(tokens.lineTaperMaxPx, tokens.lineTaperPx + tokens.lineTaperGainPx * (f.count - 1)) * (S.wide ? 1 : 0.7);
    const reverse = sideOf.get(`${f.to}\n${f.from}`);
    let best: { pts: Pt[]; numeral: Pt | null; cost: number; side: number } | null = null;
    for (const mag of arcBows) {
      for (const sign of [1, -1]) {
        const bow = mag * sign;
        /* Side in the pair's own frame: a reverse direction flips the chord, so it flips the bow. */
        const side = f.from < f.to ? sign : -sign;
        if (reverse !== undefined && side === reverse) continue;
        const chord = dist(A, B);
        const cut = (c: FilmCluster) => Math.min(c.footprint * (S.wide ? 0.9 : 1), chord * 0.38);
        let pts = trim(bowedPoints(A, B, bow, 48), A, cut(A), B, cut(B));
        const hitsMark = (p: Pt) => restField.marks.some((m) => dist(p, m) < m.r + 5) || restField.boxes.some((b) => inside(p, b));
        while (pts.length && hitsMark(pts[0]!)) pts = pts.slice(1);
        while (pts.length && hitsMark(pts[pts.length - 1]!)) pts = pts.slice(0, -1);
        if (pts.length < 4 || polylineLength(pts) < 40) continue;
        let cost = Math.abs(bow) * 30;
        for (const p of pts) {
          for (const c of clusters) {
            if (c.id === f.from || c.id === f.to) continue;
            const into = c.footprint + 2 - dist(p, c);
            if (into > 0) cost += 2000 + into;
          }
          if (project) cost += Math.max(0, project.r * 1.35 + 30 - dist(p, project));
          if (projectLabel && inside(p, grow(projectLabel.box, 4))) cost += 2000;
          else if (projectLabel && inside(p, grow(projectLabel.box, 10))) cost += 200;
          if (pickZone) cost += Math.max(0, pickZone.r - dist(p, pickZone)) * 4;
          if (pickBlock && inside(p, grow(pickBlock, 8))) cost += 400;
          if (hitsMark(p)) cost += 2000;
          if (!inside(p, bounds) || inside(p, captionBox) || inside(p, titleBox)) cost += 2000;
          if (restArcs.some((o) => o.numeral && dist(p, o.numeral) < S.numeralR + 4)) cost += 2000;
        }
        /* One crossing in the whole map is allowed; any more is as bad as a mark hit twice. */
        const crossed = restArcs.reduce((sum, other) => sum + crossings(pts, other.pts), 0);
        if (crossed > 0) cost += crossedSoFar + crossed <= 1 ? 300 : crossed * CROSSING_COST;
        const numeralFree = (q: Pt) =>
          restField.free({ l: q.x - S.numeralR, t: q.y - S.numeralR, r: q.x + S.numeralR, b: q.y + S.numeralR }) &&
          !restArcs.some((o) => (o.numeral && dist(o.numeral, q) < S.numeralR * 2 + 2 * LABEL_PAD + 4) || o.pts.some((p) => dist(p, q) < S.numeralR + 4));
        const numeral = NUMERAL_SPOTS.map((u) => pointAlong(pts, u)).find(numeralFree) ?? null;
        if (!numeral) cost += 1500;
        if (!best || cost < best.cost - 1e-6) best = { pts, numeral, cost, side };
      }
    }
    if (!best) {
      /* Every crossing count is drawn: with no clean route it takes the first bow, trimmed only at its clusters. */
      const sign = reverse === undefined ? 1 : f.from < f.to ? -reverse : reverse;
      const chord = dist(A, B);
      const pts = trim(bowedPoints(A, B, arcBows[0]! * sign, 48), A, Math.min(A.footprint, chord * 0.3), B, Math.min(B.footprint, chord * 0.3));
      best = { pts, numeral: null, cost: Infinity, side: f.from < f.to ? sign : -sign };
    }
    crossedSoFar += restArcs.reduce((sum, other) => sum + crossings(best!.pts, other.pts), 0);
    sideOf.set(`${f.from}\n${f.to}`, best.side);
    restArcs.push({ from: f.from, to: f.to, count: f.count, pts: best.pts, width, numeral: best.numeral });
    if (best.numeral)
      restField.take({ l: best.numeral.x - S.numeralR, t: best.numeral.y - S.numeralR, r: best.numeral.x + S.numeralR, b: best.numeral.y + S.numeralR });
  }
  for (const arc of restArcs) {
    const q = arc.numeral;
    if (q && restArcs.some((o) => o !== arc && o.pts.some((p) => dist(p, q) < S.numeralR + 2))) arc.numeral = null;
  }
  /* A rest arc that must pass where the project's name stands sends the name to the mark's other side, if that side is clear. */
  if (projectLabel && projectAt && project) {
    const crossed = (label: FilmLabel) => restArcs.some((arc) => arc.pts.some((p) => inside(p, grow(label.box, LABEL_PAD))));
    if (crossed(projectLabel)) {
      const other = projectAt(projectLabel.y < project.y ? projectLift : -projectLift);
      const check = new LabelField(bounds, [titleBox, captionBox]);
      for (const m of marks.values()) if (m.id !== project.id) check.marks.push({ x: m.x, y: m.y, r: m.r });
      for (const c of clusters) check.boxes.push(c.nameBlock);
      for (const arc of restArcs)
        if (arc.numeral)
          check.take({ l: arc.numeral.x - S.numeralR, t: arc.numeral.y - S.numeralR, r: arc.numeral.x + S.numeralR, b: arc.numeral.y + S.numeralR });
      if (!crossed(other) && check.free(other.box)) {
        restField.boxes[clusters.length] = grow(other.box, LABEL_PAD);
        projectLabel = other;
      }
    }
  }
  restField.samples = restArcs.flatMap((arc) => resample(arc.pts, 8));

  const restLabels: FilmLabel[] = [...blockLabels];
  if (projectLabel) restLabels.push(projectLabel);
  /* Capability names at rest only where the stage has room for them; a smaller one keeps the domains and the project. */
  if (S.wide && w >= REST_NAMES_PX) {
    const capFont = fontOf(510, S.fCap, sans);
    /* Rest names fade while the pick's block fades in, so they never share its place. */
    if (pickBlock) restField.boxes.push(pickBlock);
    const named = (id: string, ink: InkRole) => {
      const m = marks.get(id)!;
      const c = vault.byId.get(id)!;
      const extra = c.elements.length ? [S.elemGap + S.elemAlt + S.elemR * 2] : [10];
      return tryPlace(restField, `cap:${id}`, id, 'cap', [{ text: c.label, ink }], capFont, S.fCap, spotsAround(m, 0, S.fCap, outwardOf(id), extra));
    };
    if (pick) {
      const label = named(pick, 'name');
      if (label) restLabels.push(label);
    }
    const perCluster = w >= 1600 ? 5 : 3;
    for (const id of order) {
      let shown = 0;
      const caps = locals
        .get(id)!
        .items.filter((it) => it.id !== pick)
        .sort((a, b) => b.elements.length - a.elements.length || (a.id < b.id ? -1 : 1));
      for (const it of caps) {
        if (shown >= perCluster) break;
        const label = named(it.id, 'name');
        if (label) {
          restLabels.push(label);
          shown += 1;
        }
      }
    }
  }

  if (pick && pickMark && reach) {
    const own = new Set(vault.byId.get(pick)!.elements);
    const blocks = clusters.map((c) => c.nameBlock);
    const endsFar = [
      ...reach.needs.filter((e) => !own.has(e)).map((e) => ({ end: e, kind: 'needs' as const })),
      ...reach.neededBy.map((e) => ({ end: e, kind: 'neededBy' as const })),
      ...reach.relates.map((e) => ({ end: e, kind: 'relates' as const })),
    ].filter((row) => marks.has(row.end) && row.end !== pick);
    const endSet = new Set(endsFar.map((row) => row.end));
    /* A lit end left without a free name spot bans the bow of the line passing nearest it, and routes again. */
    const banned = new Map<string, number[]>();
    let attempt: { lines: FilmLitLine[]; litLabels: FilmLabel[]; keys: FilmLit['keys']; leader: FilmLit['leader']; owners: string[]; pointer: Pt; pointerBox: Rect; unnamed: number } | null = null;
    for (let round = 0; round < 8; round += 1) {
      const lines: FilmLitLine[] = [];
      const bowOf = new Map<string, number>();
      const litBows = [0.16, -0.16, 0.24, -0.24, 0.32, -0.32];
      const wider = S.wide ? [0.42, -0.42, 0.52, -0.52, 0.64, -0.64, 0.08, -0.08, 0.8, -0.8] : [0.42, -0.42, 0.52, -0.52, 0.64, -0.64, 0.08, -0.08];
      const usedBows = new Map<string, number[]>();
      for (const row of endsFar) {
        const E = marks.get(row.end)!;
        const endDomain = E.domain ?? '';
        let best: { pts: Pt[]; cost: number; bow: number } | null = null;
        /* Every relation is drawn: when its distinct bows are spent, it takes the cheapest one again. */
        for (const [pool, anyBow] of [[litBows, false], [wider, false], [[...litBows, ...wider], true]] as const) {
          if (anyBow && best) break;
          for (const bow of pool) {
            if (!anyBow && (usedBows.get(endDomain) ?? []).includes(bow)) continue;
            if (!anyBow && banned.get(row.end)?.includes(bow)) continue;
            const pts = trim(bowedPoints(pickMark, E, bow, 48), pickMark, agentR + 2, E, E.r + 5);
            if (pts.length < 3) continue;
            let cost = Math.abs(bow) * 20;
            for (const p of pts) {
              if (blocks.some((b) => inside(p, grow(b, 3)))) cost += 2000;
              if (inside(p, captionBox) || inside(p, titleBox) || !inside(p, bounds)) cost += 2000;
              if (pickBlock && inside(p, grow(pickBlock, 12))) cost += 2000;
              if (projectLabel && inside(p, grow(projectLabel.box, LABEL_PAD))) cost += 300;
              for (const other of endSet) {
                if (other === row.end) continue;
                const o = marks.get(other)!;
                const d = dist(p, o);
                cost += Math.max(0, o.r + 8 - d) * 40 + Math.max(0, o.r + 30 - d) * 6;
              }
              for (const dot of ownDots.values()) cost += Math.max(0, S.elemR + 3 - dist(p, dot)) * 40;
            }
            for (const line of lines) {
              const otherDomain = marks.get(line.end)?.domain;
              if (otherDomain !== endDomain) continue;
              for (const p of pts) {
                if (dist(p, pickMark) < agentR + 24) continue;
                if (line.pts.some((q) => dist(p, q) < 4)) cost += 60;
              }
            }
            if (!best || cost < best.cost - 1e-6) best = { pts, cost, bow };
          }
          if (best && best.cost < 300) break;
        }
        if (!best) {
          /* Every relation is drawn: an end too close for a bow gets a straight line from the ring. */
          const a = Math.atan2(E.y - pickMark.y, E.x - pickMark.x);
          best = {
            pts: [
              { x: pickMark.x + Math.cos(a) * (agentR + 2), y: pickMark.y + Math.sin(a) * (agentR + 2) },
              { x: E.x - Math.cos(a) * (E.r + 3), y: E.y - Math.sin(a) * (E.r + 3) },
            ],
            cost: Infinity,
            bow: 0,
          };
        }
        usedBows.set(endDomain, [...(usedBows.get(endDomain) ?? []), best.bow]);
        bowOf.set(row.end, best.bow);
        lines.push({
          end: row.end,
          kind: row.kind,
          pts: best.pts,
          width: row.kind === 'relates' ? tokens.lineDotPx : tokens.lineTaperPx * (S.wide ? 1 : 0.76),
          towardPick: row.kind === 'neededBy',
        });
      }
      for (const e of reach.ownNeeds) {
        const dot = ownDots.get(e);
        if (!dot) continue;
        const a = Math.atan2(dot.y - pickMark.y, dot.x - pickMark.x);
        const from = { x: pickMark.x + Math.cos(a) * (selectedR + 1), y: pickMark.y + Math.sin(a) * (selectedR + 1) };
        const to = { x: dot.x - Math.cos(a) * (S.elemR + 1), y: dot.y - Math.sin(a) * (S.elemR + 1) };
        lines.push({ end: e, kind: 'own', pts: [from, to], width: 1.2, towardPick: false });
      }

      const owners = [...endSet]
        .map((e) => vault.byId.get(e)!)
        .filter((c) => c.kind === 'element' && c.capability)
        .map((c) => c.capability!)
        .filter((c, i, all) => all.indexOf(c) === i && c !== pick);

      const tipA = 30 * DEG;
      const pointer = { x: pickMark.x + Math.cos(tipA) * selectedR * 0.55, y: pickMark.y + Math.sin(tipA) * selectedR * 0.55 };
      const pointerBox: Rect = { l: pointer.x - 1, t: pointer.y - 1, r: pointer.x + 15, b: pointer.y + 22 };

      let litLabels: FilmLabel[] = [];
      const field = baseField(true);
      /* Lit, the other domains' names and the project's are context: a lit line or the agent's leader never runs through one, it steps aside. */
      const pickHome = vault.byId.get(pick)!.domain;
      /* The pick's own domain is context too once a line must cross it: the pick's block or readout carries the content. */
      const dimmed = (label: FilmLabel) => label.role === 'project' || label.role === 'domain' || label.role === 'units';
      const hidden = new Set<string>();
      const dimRects = new Set<Rect>(field.boxes.filter((_, k) => k < clusters.length && clusters[k]!.id !== pickHome));
      if (projectLabel) dimRects.add(field.boxes[clusters.length]!);
      field.marks.push({ x: pickMark.x, y: pickMark.y, r: pickClear });
      for (const dot of ownDots.values()) field.marks.push({ x: dot.x, y: dot.y, r: S.elemR });
      field.boxes.push(grow(pointerBox, 0));
      field.samples = lines.flatMap((line) => resample(line.pts, 8));
      const keys: FilmLit['keys'] = [];
      let leader: FilmLit['leader'] = null;
      const sunkPhone = (label: FilmLabel) => !S.wide && label.role === 'units' && label.id !== vault.byId.get(pick)!.domain;
      litLabels.push(...blockLabels.filter((label) => !sunkPhone(label)));
      if (projectLabel) litLabels.push(projectLabel);
      if (S.wide) {
        /* The pick's block keeps 12 px from every lit line: lines that pass where it was put move it to the next free place. */
        const near = (box: Rect) => field.samples.some((p) => inside(p, grow(box, 12)));
        if (pickBlock && near(pickBlock)) {
          const moved = pickSpots.find((spot) => !near(spot.box));
          if (moved) {
            pickBlock = moved.box;
            pickLabels = moved.labels;
          }
        }
        if (pickBlock) {
          litLabels.push(...pickLabels);
          field.boxes.push(grow(pickBlock, 12 - LABEL_PAD));
        }
        const tagSans = fontOf(510, S.fTag, sans);
        const tagMono = fontOf(400, S.fTag, mono);
        const tagW = Math.max(measure(copy.agent, tagSans), measure(copy.tool, tagMono));
        const rowH = S.fTag * 1.24;
        const tagH = rowH * 2 + 3;
        const tagField = field;
        done: for (const lead of [44, 70]) {
          for (const deg of [-42, -138, -20, -160, 42, 138, 0, 180, -90, 90, -65, -115]) {
            const a = deg * DEG;
            const q = { x: pickMark.x + Math.cos(a) * (agentR + lead), y: pickMark.y + Math.sin(a) * (agentR + lead) };
            const toRight = Math.cos(a) >= -0.01;
            const up = Math.sin(a) < -0.01;
            const l = toRight ? q.x + 6 : q.x - 6 - tagW;
            const t = up ? q.y - tagH : Math.abs(Math.sin(a)) < 0.02 ? q.y - tagH / 2 : q.y;
            const box: Rect = { l, t, r: l + tagW, b: t + tagH };
            const from = { x: pickMark.x + Math.cos(a) * (agentR + 1), y: pickMark.y + Math.sin(a) * (agentR + 1) };
            const leaderPts = resample([from, q], 6);
            if (!tagField.free(box)) continue;
            if (pickBlock && overlaps(box, grow(pickBlock, 12))) continue;
            if (leaderPts.some((p) => tagField.boxes.some((b) => inside(p, b)))) continue;
            const x = toRight ? l : l + tagW;
            const align = toRight ? ('left' as const) : ('right' as const);
            litLabels.push(makeLabel(measure, 'agent', null, 'agent', [{ text: copy.agent, ink: 'agent' }], tagSans, S.fTag, x, t + rowH / 2, align));
            litLabels.push(makeLabel(measure, 'tool', null, 'tool', [{ text: copy.tool, ink: 'secondary' }], tagMono, S.fTag, x, t + rowH + 3 + rowH / 2, align));
            tagField.take(box);
            leader = { from, to: q };
            break done;
          }
        }
        const endFont = fontOf(510, S.fCap, sans);
        const byWeight = [...endsFar].sort((p, q) => Number(marks.get(q.end)!.kind === 'element') - Number(marks.get(p.end)!.kind === 'element'));
        for (const row of byWeight) {
          const m = marks.get(row.end)!;
          const line = lines.find((l) => l.end === row.end);
          const arrive = line ? Math.atan2(m.y - line.pts[line.pts.length - 1]!.y, m.x - line.pts[line.pts.length - 1]!.x) : outwardOf(row.end);
          const spots = ringSpots(m, S.fCap, arrive, m.kind === 'element' ? [0, 6, 12, 18] : [0, 8, 18, 30, 44, 60]);
          const segments = [{ text: vault.byId.get(row.end)!.label, ink: 'strong' as const }];
          let label = tryPlace(field, `end:${row.end}`, row.end, 'end', segments, endFont, S.fCap, spots);
          /* No free spot: the name may stand where only dimmed context names are, which then step aside. */
          if (!label) {
            const kept = [...field.boxes];
            field.boxes.splice(0, field.boxes.length, ...kept.filter((b) => !dimRects.has(b)));
            label = tryPlace(field, `end:${row.end}`, row.end, 'end', segments, endFont, S.fCap, spots);
            const taken = label ? field.boxes.pop()! : null;
            field.boxes.splice(0, field.boxes.length, ...kept);
            if (label && taken) {
              field.boxes.push(taken);
              for (const dim of litLabels) if (dimmed(dim) && overlaps(grow(dim.box, LABEL_PAD), taken)) hidden.add(dim.key);
            }
          }
          if (label) litLabels.push(label);
        }
      } else {
        const x0 = input.caption.l;
        const y2 = captionBox.t - 14;
        const y1 = y2 - 28;
        keys.push({ x: x0 + 6, y: y1, ink: 'project' }, { x: x0 + 6, y: y2, ink: 'agent' });
        const nameFont = fontOf(650, S.fPick, sans);
        const reachFont = fontOf(400, S.fReach, sans);
        const name = makeLabel(measure, `pick:${pick}`, pick, 'pick', [{ text: vault.byId.get(pick)!.label, ink: 'strong' }], nameFont, S.fPick, x0 + 20, y1, 'left');
        const reachLabel = makeLabel(measure, `reach:${pick}`, pick, 'reach', copy.reach(reach.needs.length, reach.neededBy.length), reachFont, S.fReach, name.box.r + 10, y1, 'left');
        const agentFont = fontOf(510, S.fTag, sans);
        const agent = makeLabel(measure, 'agent', null, 'agent', [{ text: copy.agent, ink: 'agent' }], agentFont, S.fTag, x0 + 20, y2, 'left');
        const tool = makeLabel(measure, 'tool', null, 'tool', [{ text: copy.tool, ink: 'secondary' }], fontOf(400, S.fTag, mono), S.fTag, agent.box.r + 10, y2, 'left');
        litLabels.push(name, reachLabel, agent, tool);
      }
      const paths = [...lines.flatMap((line) => resample(line.pts, 3)), ...(leader ? resample([leader.from, leader.to], 3) : [])];
      const blockOf = new Map(clusters.map((c) => [c.id, c.nameBlock]));
      for (const label of litLabels) {
        if (!dimmed(label)) continue;
        const area = label.role === 'project' ? grow(label.box, 3) : blockOf.get(label.id ?? '')!;
        if (paths.some((p) => inside(p, area))) hidden.add(label.key);
      }
      for (const label of litLabels) {
        if (label.role !== 'domain' && label.role !== 'units') continue;
        if (litLabels.some((o) => o.id === label.id && o.role !== label.role && (o.role === 'domain' || o.role === 'units') && hidden.has(o.key)))
          hidden.add(label.key);
      }
      litLabels = litLabels.filter((label) => !hidden.has(label.key));
      const named = new Set(litLabels.filter((l) => l.role === 'end').map((l) => l.id));
      const unnamed = S.wide ? endsFar.filter((row) => !named.has(row.end)) : [];
      if (!attempt || unnamed.length < attempt.unnamed) attempt = { lines, litLabels, keys, leader, owners, pointer, pointerBox, unnamed: unnamed.length };
      if (unnamed.length === 0) break;
      /* The spot that only lines block, by the fewest of them: those lines take another bow next round. */
      const lostEnd = unnamed[0]!.end;
      const lost = marks.get(lostEnd)!;
      const samples = field.samples;
      field.samples = [];
      let ban: FilmLitLine[] | null = null;
      for (const spot of ringSpots(lost, S.fCap, outwardOf(lostEnd), lost.kind === 'element' ? [0, 6, 12, 18] : [0, 8, 18, 30, 44, 60])) {
        const box = makeLabel(measure, 'probe', lostEnd, 'end', [{ text: vault.byId.get(lostEnd)!.label, ink: 'strong' }], fontOf(510, S.fCap, sans), S.fCap, spot.x, spot.y, spot.align).box;
        if (!field.free(box)) continue;
        const pad = grow(box, LABEL_PAD);
        const blockers = lines.filter((l) => resample(l.pts, 8).some((q) => inside(q, pad)));
        if (blockers.some((l) => !bowOf.has(l.end))) continue;
        if (!ban || blockers.length < ban.length) ban = blockers;
      }
      field.samples = samples;
      if (!ban || ban.length === 0) break;
      for (const l of ban) banned.set(l.end, [...(banned.get(l.end) ?? []), bowOf.get(l.end)!]);
    }
    const { lines, litLabels, keys, leader, owners, pointer, pointerBox } = attempt!;
    lit = {
      pick,
      reach,
      selectedR,
      rings: [selectedR + tokens.selectedRingGapPx * ringK, selectedR + 9 * ringK],
      agentR,
      ownDots,
      lines,
      ends: [...endSet, ...reach.ownNeeds],
      owners,
      labels: litLabels,
      leader,
      pointer,
      pointerBox,
      keys,
    };
  }
  return { stems, restArcs, restLabels, lit };
}
