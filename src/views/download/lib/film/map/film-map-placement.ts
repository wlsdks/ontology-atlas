import { DEG, bowedPoints, circleIntoRect, dist, distanceToRect, grow, inside, normalizeAngle, overlaps, trim, type Pt, type Rect } from '../film-geometry';
import { fontOf } from './film-map-labels';
import type { FilmCluster, FilmLayoutInput, FilmMark } from './film-map-shapes';
import { filmSizes, litReach, type FilmSizes } from './film-map-sizes';
import { GATE_HALF, dotOffsets, layoutLocalCluster, titleHalfAngle, upReach, type ClusterItem, type LocalCluster } from './film-local-cluster';
import { slotOrder } from './film-slot-order';
import { domainFlows, reachOf } from '../film-vault';

/**
 * A placement's score once it breaks no rule, fills the stage and leaves a clear way for every rest arc.
 * The spec's ellipse stands only at this score; a stage where its ellipse leaves some arc no way
 * around a cluster tries the adapted ellipses before it takes the arc through one.
 */
const CLEAR_FIT = 5999;

interface FilmPlacement {
  marks: Map<string, FilmMark>;
  clusters: FilmCluster[];
}

/** Where the domains stand, the marks of every concept, and the room the later passes keep clear. */
export interface FilmClusterPlacement {
  S: FilmSizes;
  capRadius: (elements: number) => number;
  pick: string | null;
  titleBox: Rect;
  captionBox: Rect;
  bounds: Rect;
  order: string[];
  flows: ReturnType<typeof domainFlows>;
  arcBows: number[];
  locals: Map<string, LocalCluster>;
  marks: Map<string, FilmMark>;
  clusters: FilmCluster[];
}

export function placeFilmClusters(input: FilmLayoutInput): FilmClusterPlacement {
  const { vault, w, h, measure, sans, tokens } = input;
  let S = filmSizes(w, h, tokens);
  const capRadius = (e: number) =>
    Math.min(tokens.capDiscMaxPx, tokens.capDiscMinPx + tokens.capDiscGainPx * Math.sqrt(e)) * S.K;
  const pick = input.pick && vault.byId.get(input.pick)?.domain ? input.pick : null;
  const pickDomain = pick ? vault.byId.get(pick)!.domain : null;
  const titleBox = grow(input.title, 16);
  const captionBox = grow(input.caption, 24);
  const bounds: Rect = { l: S.safe, t: S.safe, r: w - S.safe, b: h - S.safe };
  const mapTop = Math.max(S.safe, titleBox.b);
  const mapBottom = S.wide ? h - S.safe : captionBox.t - 76;
  const order = slotOrder(vault, pickDomain);
  const flows = domainFlows(vault).slice(0, 6);
  const arcBows = S.wide ? [0.16, 0.26, 0.36, 0.46, 0.06, 0.1, 0.12, 0.2] : [0.2, 0.34, 0.48, 0.1, 0.14, 0.26];
  /*
   * The spec's ellipse first (a phone also tries its tilts toward a two-by-two grid). A stage it
   * cannot hold, short or narrow and tall, then draws the clusters tighter and tries other tilts,
   * measuring the top cluster by its marks and letting the ellipse widen, before anything collides.
   */
  const attempts: { fit: number; tiltDeg: number; adapt: boolean }[] = S.wide
    ? [
        { fit: 1, tiltDeg: -10, adapt: false },
        ...[1, 0.9, 0.8, 0.72, 0.64, 0.56].flatMap((fit) => [-10, -20, 0, -30, -40].map((tiltDeg) => ({ fit, tiltDeg, adapt: true }))),
      ]
    : [
        ...[-25, -32, -39, -45].map((tiltDeg) => ({ fit: 1, tiltDeg, adapt: false })),
        /* A phone too narrow for two columns stacks the four as a slalom, each a step lower than the last. */
        ...[-25, -39, -52, -60, -68].map((tiltDeg) => ({ fit: 1, tiltDeg, adapt: true })),
      ];
  type Attempt = (typeof attempts)[number];
  type Placement = { locals: Map<string, LocalCluster>; placed: FilmPlacement; value: number; S: FilmSizes };
  const tryAttempt = ({ fit, tiltDeg, adapt }: Attempt, grain: number): Placement => {
    S = filmSizes(w, h, tokens, fit);
    const tilt = tiltDeg * DEG;
    const slotAngle = new Map(order.map((id, i) => [id, -Math.PI / 2 + tilt + (i / Math.max(1, order.length)) * Math.PI * 2]));

    /* An adapted ellipse is stretched so its highest and lowest clusters, not its poles, meet the frame's top and bottom. */
    const sins = order.map((id) => Math.sin(slotAngle.get(id)!));
    const coss = order.map((id) => Math.abs(Math.cos(slotAngle.get(id)!)));
    const sinMin = adapt && order.length > 1 ? Math.min(...sins) : -1;
    const sinMax = adapt && order.length > 1 ? Math.max(...sins) : 1;
    const cosMax = adapt && order.length > 1 ? Math.max(0.2, ...coss) : 1;
    const ellipse = (yTop: number, yBottom: number, rx: number) => {
      const ry = Math.max(0, (yBottom - yTop) / Math.max(0.2, sinMax - sinMin));
      return { cy: yTop - sinMin * ry, ry, rx: rx / cosMax };
    };
    const hubOf = (id: string) => (order.length > 1 ? normalizeAngle((slotAngle.get(id) ?? 0) + Math.PI) : null);
    let locals = new Map(vault.domains.map((d) => [d.id, layoutLocalCluster(input, S, d, capRadius, null, hubOf(d.id))]));
    const reachOfAll = () => Math.max(S.domainR * 2, ...[...locals.values()].map((c) => c.footprint));
    const titleDrop = Math.max(0, ...[...locals.values()].map((c) => c.nameBlock.b));

    const frame = (maxReach: number) => {
      const mapL = S.safe;
      const mapR = w - S.safe;
      /* The top slot's own reach sets the ellipse's top: a lighter top cluster leaves more room between rows. */
      const top = locals.get(adapt ? (order[sins.indexOf(Math.min(...sins))] ?? '') : (order[0] ?? ''));
      const topReach = Math.min(maxReach, top ? (adapt ? upReach(top, S) : top.footprint) : maxReach);
      const yTop = mapTop + topReach + (S.wide ? 4 : 2);
      const yBottom = mapBottom - Math.max(titleDrop + 8, maxReach * (S.wide ? 0.78 : 0.8));
      /* The spec's side margin on a full stage; a narrower one gives it back to the clusters. */
      const side = 96 * S.s * (adapt ? Math.min(1, Math.max(0, (mapR - mapL - 700) / 600)) : 1);
      const rx = S.wide ? Math.min((mapR - mapL) / 2 - maxReach - side, 560 * S.s) : (mapR - mapL) / 2 - maxReach + 6;
      return { cx: (mapL + mapR) / 2 + (S.wide ? 10 * S.s : 0), yTop, yBottom, rx: Math.max(0, rx) };
    };

    if (pick && pickDomain) {
      const base = frame(reachOfAll());
      const { cy, ry, rx: rxe } = ellipse(base.yTop, base.yBottom, base.rx);
      const at = (id: string) => {
        const a = slotAngle.get(id) ?? 0;
        return { x: base.cx + Math.cos(a) * rxe, y: cy + Math.sin(a) * ry };
      };
      const reach = reachOf(vault, pick);
      const tally = new Map<string, number>();
      for (const end of [...reach.needs, ...reach.neededBy, ...reach.relates]) {
        const d = vault.byId.get(end)?.domain;
        if (d && d !== pickDomain) tally.set(d, (tally.get(d) ?? 0) + 1);
      }
      const target = [...tally.entries()].sort((a, b) => b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0]))[0]?.[0];
      const home = at(pickDomain);
      const toward = target ? at(target) : { x: base.cx, y: cy };
      let gate = normalizeAngle(Math.atan2(toward.y - home.y, toward.x - home.x));
      const titleHalf = titleHalfAngle(S, input.locale);
      const lo = Math.PI / 2 - titleHalf - GATE_HALF;
      const hi = Math.PI / 2 + titleHalf + GATE_HALF;
      if (gate > lo && gate < hi) gate = gate - lo < hi - gate ? lo : hi;
      /* The lit pick and its pushed-out dots stay on the stage: the gate turns toward the map's centre until they do. */
      const gateD = S.rings[2] * (S.wide ? 1.42 : 1.3);
      const pickC = vault.byId.get(pick)!;
      const litR = litReach(S, capRadius(pickC.elements.length));
      const inStage = (g: number) => {
        const x = home.x + Math.cos(g) * gateD;
        const y = home.y + Math.sin(g) * gateD;
        return x - litR >= S.safe && x + litR <= w - S.safe && y - litR >= mapTop && y + litR <= mapBottom;
      };
      if (!inStage(gate)) {
        const inName = (g: number) => g > lo && g < hi;
        for (let step = 1; step <= 60; step += 1) {
          const turned = [normalizeAngle(gate + step * 3 * DEG), normalizeAngle(gate - step * 3 * DEG)].find((g) => !inName(g) && inStage(g));
          if (turned !== undefined) {
            gate = turned;
            break;
          }
        }
      }
      const domain = vault.byId.get(pickDomain)!;
      locals = new Map(locals);
      locals.set(pickDomain, layoutLocalCluster(input, S, domain, capRadius, gate, hubOf(pickDomain)));
    }

    const maxReach = reachOfAll();
    const base = frame(maxReach);

    /** Every mark and name block for an ellipse; null when something falls outside the map. */
    const settleGate = (p: Pt, it: ClusterItem, local: LocalCluster, others: { p: Pt; block: Rect }[]) => {
      const litR = litReach(S, it.r);
      const titleHalf = titleHalfAngle(S, input.locale);
      const lo = Math.PI / 2 - titleHalf - GATE_HALF;
      const hi = Math.PI / 2 + titleHalf + GATE_HALF;
      const block: Rect = { l: p.x + local.nameBlock.l, t: p.y + local.nameBlock.t, r: p.x + local.nameBlock.r, b: p.y + local.nameBlock.b };
      const clear = (g: number) => {
        const x = p.x + Math.cos(g) * it.d;
        const y = p.y + Math.sin(g) * it.d;
        if (x - litR < S.safe || x + litR > w - S.safe || y - litR < mapTop || y + litR > mapBottom) return false;
        if (circleIntoRect({ x, y }, litR + 2, block) > 0) return false;
        return others.every((o) => circleIntoRect({ x, y }, litR + 2, o.block) === 0 && dist({ x, y }, o.p) > litR + S.domainR + 6);
      };
      if (clear(it.a)) return it.a;
      for (let step = 1; step <= 60; step += 1) {
        const turned = [normalizeAngle(it.a + step * 3 * DEG), normalizeAngle(it.a - step * 3 * DEG)].find((g) => !(g > lo && g < hi) && clear(g));
        if (turned !== undefined) return turned;
      }
      return it.a;
    };
    const centres = (cx: number, yTop: number, yBottom: number, rx0: number): FilmCluster[] => {
      const { cy, ry, rx } = ellipse(yTop, yBottom, rx0);
      return order.map((id) => {
        const a = slotAngle.get(id)!;
        const p = order.length === 1 ? { x: cx, y: cy } : { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry };
        const local = locals.get(id)!;
        const nb = local.nameBlock;
        return { id, x: p.x, y: p.y, footprint: local.footprint, nameBlock: { l: p.x + nb.l, t: p.y + nb.t, r: p.x + nb.r, b: p.y + nb.b } };
      });
    };
    const place = (cx: number, yTop: number, yBottom: number, rx0: number) => {
      const { cy, ry, rx } = ellipse(yTop, yBottom, rx0);
      const marks = new Map<string, FilmMark>();
      const clusters: FilmCluster[] = [];
      if (vault.project) marks.set(vault.project.id, { id: vault.project.id, kind: 'project', x: cx, y: cy, r: S.projectR, domain: null });
      const at = new Map(
        order.map((id) => {
          const a = slotAngle.get(id)!;
          const p = order.length === 1 ? { x: cx, y: cy } : { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry };
          const nb = locals.get(id)!.nameBlock;
          return [id, { p, block: { l: p.x + nb.l, t: p.y + nb.t, r: p.x + nb.r, b: p.y + nb.b } }] as const;
        }),
      );
      for (const id of order) {
        const local = locals.get(id)!;
        const p = at.get(id)!.p;
        marks.set(id, { id, kind: 'domain', x: p.x, y: p.y, r: S.domainR, domain: id });
        clusters.push({
          id,
          x: p.x,
          y: p.y,
          footprint: local.footprint,
          nameBlock: { l: p.x + local.nameBlock.l, t: p.y + local.nameBlock.t, r: p.x + local.nameBlock.r, b: p.y + local.nameBlock.b },
        });
        for (const it of local.items) {
          const a = it.gate ? settleGate(p, it, local, [...at.entries()].filter(([o]) => o !== id).map(([, v]) => v)) : it.a;
          const q = { x: p.x + Math.cos(a) * it.d, y: p.y + Math.sin(a) * it.d };
          marks.set(it.id, { id: it.id, kind: 'capability', x: q.x, y: q.y, r: it.r, domain: id });
          dotOffsets(it.elements.length, a, it.r, S).forEach((o, k) => {
            const e = it.elements[k]!;
            marks.set(e, { id: e, kind: 'element', x: q.x + o.x, y: q.y + o.y, r: S.elemR, domain: id });
          });
        }
        local.direct.forEach((e, k) => {
          const ea = -Math.PI / 2 + (k - (local.direct.length - 1) / 2) * 0.5;
          const d = S.domainR + S.elemGap + S.elemR * 2;
          marks.set(e, { id: e, kind: 'element', x: p.x + Math.cos(ea) * d, y: p.y + Math.sin(ea) * d, r: S.elemR, domain: id });
        });
      }
      return { marks, clusters };
    };

    const corridor = (placed: ReturnType<typeof place>, from: string, to: string) => {
      const A = placed.clusters.find((c) => c.id === from);
      const B = placed.clusters.find((c) => c.id === to);
      const hub = vault.project ? placed.marks.get(vault.project.id) : undefined;
      if (!A || !B) return true;
      const chord = dist(A, B);
      const nameW = hub && vault.project ? measure(vault.project.label, fontOf(600, S.fProject, sans)) : 0;
      const hubName: Rect | null = hub
        ? { l: hub.x - nameW / 2 - 8, t: hub.y - hub.r * 1.35 - 12 - S.fProject * 1.3, r: hub.x + nameW / 2 + 8, b: hub.y }
        : null;
      const cut = (c: FilmCluster) => Math.min(c.footprint * (S.wide ? 0.9 : 1), chord * 0.38);
      return arcBows.some((mag) =>
        [mag, -mag].some((bow) =>
          trim(bowedPoints(A, B, bow, 48), A, cut(A), B, cut(B)).every(
            (p) =>
              placed.clusters.every((c) => c.id === from || c.id === to || dist(p, c) >= c.footprint + 2) &&
              (!hub || dist(p, hub) >= hub.r * 1.35 + 34) &&
              !(hubName && inside(p, hubName)) &&
              placed.clusters.every((c) => !inside(p, grow(c.nameBlock, 4))) &&
              inside(p, bounds) &&
              !inside(p, captionBox),
          ),
        ),
      );
    };

    const crowded = (placed: ReturnType<typeof place>, a: FilmCluster, b: FilmCluster) => {
      const A: FilmMark[] = [];
      const B: FilmMark[] = [];
      for (const m of placed.marks.values()) {
        if (m.domain === a.id && dist(m, b) < b.footprint + m.r + 8) A.push(m);
        else if (m.domain === b.id && dist(m, a) < a.footprint + m.r + 8) B.push(m);
      }
      for (const p of A) for (const q of B) if (dist(p, q) < p.r + q.r + 8) return true;
      return false;
    };
    const hubW = vault.project ? measure(vault.project.label, fontOf(510, S.fProject, sans)) : 0;

    const blockFaults = (clusters: FilmCluster[], limit = Infinity) => {
      let n = 0;
      const fault = () => {
        n += 1;
        return n >= limit;
      };
      for (let i = 0; i < clusters.length; i += 1) {
        const c = clusters[i]!;
        const nb = c.nameBlock;
        if ((nb.l < S.safe || nb.r > w - S.safe || nb.b > mapBottom || overlaps(nb, captionBox)) && fault()) return n;
        /* A cluster's light centre stays clear of the caption by most of its footprint; its marks clear it entirely. */
        if (S.wide && distanceToRect(c, captionBox) < c.footprint * 0.75 && fault()) return n;
        for (let j = i + 1; j < clusters.length; j += 1) if (overlaps(grow(nb, 4), clusters[j]!.nameBlock) && fault()) return n;
      }
      return n;
    };

    /** How many of the map's other hard rules a placement breaks, counted up to `limit`: 0 is a fit. Cheapest rules first. */
    const faults = (placed: ReturnType<typeof place>, limit = Infinity) => {
      const box: Rect = { l: S.safe, t: mapTop, r: w - S.safe, b: mapBottom };
      let n = 0;
      const fault = () => {
        n += 1;
        return n >= limit;
      };
      const { clusters } = placed;
      const hub = vault.project ? placed.marks.get(vault.project.id) : undefined;
      if (hub) {
        const lift = hub.r * 1.35;
        const above: Rect = { l: hub.x - hubW / 2 - 6, t: hub.y - lift - 12 - S.fProject * 1.24, r: hub.x + hubW / 2 + 6, b: hub.y - lift - 4 };
        const below: Rect = { l: above.l, t: hub.y + lift + 4, r: above.r, b: hub.y + lift + 12 + S.fProject * 1.24 };
        const blocked = (rect: Rect) => {
          if (clusters.some((c) => overlaps(grow(c.nameBlock, 4), rect))) return true;
          for (const m of placed.marks.values()) if (m.id !== hub.id && circleIntoRect(m, m.r + 2, rect) > 0) return true;
          return false;
        };
        if (blocked(above) && blocked(below) && fault()) return n;
      }
      const lifted = pick ? placed.marks.get(pick) : undefined;
      if (lifted) {
        const r = litReach(S, lifted.r);
        if ((lifted.x - r < box.l || lifted.x + r > box.r || lifted.y - r < box.t || lifted.y + r > box.b) && fault()) return n;
        for (const c of clusters) if (circleIntoRect(lifted, r + 2, c.nameBlock) > 0 && fault()) return n;
        if (circleIntoRect(lifted, r + 2, captionBox) > 0 && fault()) return n;
      }
      for (const m of placed.marks.values()) {
        const r = m.kind === 'project' ? m.r * 1.35 : m.r;
        if ((m.x - r < box.l || m.x + r > box.r || m.y - r < box.t || m.y + r > box.b) && fault()) return n;
        if ((circleIntoRect(m, r + 2, captionBox) > 0 || circleIntoRect(m, r + 2, titleBox) > 0) && fault()) return n;
        for (const c of clusters) if (c.id !== m.id && circleIntoRect(m, r + 2, c.nameBlock) > 0 && fault()) return n;
      }
      /* Two clusters may share their outer air, not their marks. */
      if (S.wide) {
        for (let i = 0; i < clusters.length; i += 1)
          for (let j = i + 1; j < clusters.length; j += 1) {
            const c = clusters[i]!;
            const o = clusters[j]!;
            if (dist(c, o) < c.footprint + o.footprint && crowded(placed, c, o) && fault()) return n;
          }
      }
      return n;
    };

    const stageUse = (candidate: ReturnType<typeof place>) => {
      let l = Infinity;
      let r = -Infinity;
      let t = Infinity;
      let b = -Infinity;
      for (const m of candidate.marks.values()) {
        const rr = m.kind === 'project' ? m.r * 1.35 : m.r;
        l = Math.min(l, m.x - rr);
        r = Math.max(r, m.x + rr);
        t = Math.min(t, m.y - rr);
        b = Math.max(b, m.y + rr);
      }
      /* An adapted ellipse keeps a hair of margin over the spec's shares, which the spec's own ellipse meets with room. */
      const m = adapt ? 0.01 : 0;
      return S.wide ? Math.min((r - l) / w / (0.7 + m), (b - t) / h / (0.6 + m)) : (b - t) / Math.max(1, captionBox.t - titleBox.b) / (0.6 + m);
    };
    let placed: ReturnType<typeof place> | null = null;
    let placedUse = -Infinity;
    let placedBroken = Infinity;
    const room = Math.max(0, w - S.safe - (base.cx + base.rx + maxReach));
    for (let cut = 0; cut <= 30; cut += grain) {
      const yBottom = base.yBottom - cut * 12;
      if (yBottom <= base.yTop) break;
      for (let step = S.wide ? (adapt ? -10 : 0) : -15; step <= 15; step += grain) {
        const rx = base.rx * (1 - step * 0.02);
        /* A phone's map stays centred; a wide one may shift right, away from the caption. */
        const slack = S.wide ? room + base.rx - rx : 0;
        /* Shifted as far right as the stage allows first: that is what clears the caption. */
        for (let k = S.wide ? 12 : 0; k >= 0; k -= grain) {
          const x = base.cx + (slack * k) / 12;
          /* A candidate that already breaks more rules than the best so far cannot win: wide takes none that break any. */
          const limit = S.wide ? 1 : placedBroken + 1;
          let broken = blockFaults(centres(x, base.yTop, yBottom, rx), limit);
          if (broken >= limit) continue;
          const candidate = place(x, base.yTop, yBottom, rx);
          broken += faults(candidate, limit - broken);
          if (broken >= limit) continue;
          /* Fewest broken rules, then the stage used, then a clear corridor for every rest arc; ties keep the spec's order. */
          const used = stageUse(candidate);
          const open = -broken * 10000 + (used >= 1 ? 4000 : used * 1000) - cut * 0.01 - Math.abs(step) * 0.001;
          if (open + 2000 <= placedUse) {
            if (S.wide) break;
            continue;
          }
          const clear = flows.every((f) => corridor(candidate, f.from, f.to)) ? 2000 : 0;
          const value = open + clear;
          if (value > placedUse) {
            placed = candidate;
            placedUse = value;
            placedBroken = broken;
          }
          if (S.wide) break;
        }
        /* The first clear ellipse that fills the stage cannot be beaten: every later one gives up more. */
        if (placedUse >= CLEAR_FIT) break;
      }
      if (placedUse >= CLEAR_FIT) break;
    }
    placed ??= place(base.cx, base.yTop, Math.max(base.yTop, base.yBottom), base.rx);
    return { locals, placed, value: placedUse, S };
  };
  let chosen: Placement | null = null;
  let chosenAttempt: Attempt | null = null;
  for (const attempt of attempts) {
    const found = tryAttempt(attempt, attempt.adapt && S.wide ? 4 : 1);
    if (!chosen || found.value > chosen.value) {
      chosen = found;
      chosenAttempt = attempt;
    }
    if (found.value >= CLEAR_FIT) break;
  }
  if (chosenAttempt?.adapt && chosen!.S.wide) {
    const fine = tryAttempt(chosenAttempt, 1);
    if (fine.value >= chosen!.value) chosen = fine;
  }
  const { locals, placed } = chosen!;
  S = chosen!.S;
  const { marks, clusters } = placed;
  return { S, capRadius, pick, titleBox, captionBox, bounds, order, flows, arcBows, locals, marks, clusters };
}
