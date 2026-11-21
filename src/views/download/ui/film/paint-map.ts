import { FLIGHT, LIT, arcMidpointMs, flight, span } from '../../lib/film/film-acts';
import { bowControl, quadAt, subPolyline } from '../../lib/film/film-geometry';
import { clamp01, easeInOut, easeOut, lerp } from '../../lib/film/film-kit';
import { mix, rgba } from './film-colors';
import { TAU, capMark, disc, domainMark, dot, drawLabel, light, pointer, ring } from './film-marks';
import type { FilmPaintScene } from './film-paint-scene';
import { ribbonPath } from './film-ribbon';

const RIBBON_FADE_PX = 90;

interface MapState {
  t3: number;
  t4: number;
}

function markAt(scene: FilmPaintScene, id: string, st: MapState): { x: number; y: number; light: number } | null {
  const m = scene.map.marks.get(id)!;
  if (scene.fragment.has(id)) return st.t3 < FLIGHT.travelFrom + scene.travelMs ? null : { x: m.x, y: m.y, light: 1 };
  const plan = scene.flights.get(id);
  if (!plan) return { x: m.x, y: m.y, light: 1 };
  if (st.t3 < plan.start) return null;
  const f = flight(st.t3, plan.start, plan.ms);
  if (f.p >= 1) return { x: m.x, y: m.y, light: 1 };
  const c = bowControl(plan.from, m, FLIGHT.bow * plan.side);
  const p = quadAt(plan.from, c, m, f.p);
  return { x: p.x, y: p.y, light: f.mark };
}

function landedAt(scene: FilmPaintScene, id: string): number {
  const plan = scene.flights.get(id);
  if (scene.fragment.has(id)) return FLIGHT.travelFrom + scene.travelMs;
  return plan ? plan.start + plan.ms : 0;
}

export function paintMap(ctx: CanvasRenderingContext2D, scene: FilmPaintScene, st: MapState) {
  const { map, inks, vault } = scene;
  const S = map.sizes;
  const lit = map.lit;
  const t4 = st.t4;
  const pick = map.pick;
  const pickNode = pick ? vault.byId.get(pick)! : null;
  const pickDomain = pickNode?.domain ?? null;
  const selected = lit && t4 >= 0 ? easeOut(span(t4, LIT.selectFrom, LIT.selectMs)) : 0;
  const sinkT = lit && t4 >= 0 ? easeInOut(span(t4, LIT.sinkFrom, LIT.sinkMs)) : 0;
  const sinkShare = 1 - (1 - scene.sink) * sinkT;
  const endLight = new Map<string, number>();
  const litStarts = new Map<string, number>();
  if (lit) {
    for (const plan of scene.lit) {
      const arrive = span(t4, plan.start + LIT.lineMs * 0.7, LIT.endMs);
      endLight.set(plan.line.end, Math.max(endLight.get(plan.line.end) ?? 0, t4 >= 0 ? easeOut(arrive) : 0));
      litStarts.set(plan.line.end, plan.start);
    }
  }
  const ownerLight = new Map<string, number>();
  if (lit) {
    for (const id of lit.owners) {
      const ends = vault.byId.get(id)!.elements.filter((e) => endLight.has(e));
      ownerLight.set(id, Math.max(0, ...ends.map((e) => endLight.get(e)!)));
    }
  }
  const keep = (id: string, domain: string | null) => {
    if (!lit || domain === pickDomain || domain === null) return 1;
    const end = endLight.get(id) ?? 0;
    const owner = ownerLight.get(id) ?? 0;
    const base = sinkShare;
    return Math.max(base, lerp(base, 1, end), lerp(base, 0.6, owner));
  };

  for (const c of map.clusters) {
    const landed = landedAt(scene, c.id);
    const grown = scene.fragment.has(c.id) ? 1 : easeOut(span(st.t3, landed, FLIGHT.poolMs));
    if (grown <= 0.004) continue;
    const at = scene.fragment.has(c.id) ? null : markAt(scene, c.id, st);
    const x = at?.x ?? c.x;
    const y = at?.y ?? c.y;
    const r = c.footprint * 1.8;
    const own = c.id === pickDomain;
    const share = own ? 1 : sinkShare;
    if (scene.fragment.has(c.id) && st.t3 < FLIGHT.travelFrom + scene.travelMs) continue;
    light(ctx, scene.sprites.get(inks.rest), x, y, r, 0.2 * grown * share * (own ? 1 - selected : 1));
    if (own && selected > 0) light(ctx, scene.sprites.get(inks.project), x, y, r, 0.2 * selected);
  }

  const arcLight = lit && t4 >= 0 ? lerp(1, 0.24, sinkT) : 1;
  scene.arcs.forEach((plan) => {
    const arc = map.restArcs[plan.index]!;
    const grown = easeOut(span(st.t3, plan.start, FLIGHT.arcMs));
    if (grown <= 0) return;
    const a = arc.pts[0]!;
    const b = arc.pts[arc.pts.length - 1]!;
    const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    g.addColorStop(0, rgba(inks.rest, 0));
    g.addColorStop(clamp01(RIBBON_FADE_PX / len), rgba(inks.rest, 0.5));
    g.addColorStop(1, rgba(inks.rest, 0.5));
    ctx.globalAlpha = arcLight;
    ctx.fillStyle = g;
    ctx.fill(grown >= 1 ? plan.path : ribbonPath(arc.pts, arc.width, 0, grown, true));
    ctx.globalAlpha = 1;
  });

  ctx.lineWidth = 1;
  for (const stem of map.stems) {
    const A = map.marks.get(stem.from);
    const B = map.marks.get(stem.to);
    if (!A || !B) continue;
    const fromFragment = scene.fragment.has(stem.from) && scene.fragment.has(stem.to);
    if (fromFragment && st.t3 < FLIGHT.travelFrom + scene.travelMs) continue;
    const show = fromFragment ? 1 : easeOut(span(st.t3, FLIGHT.namesFrom, FLIGHT.namesMs));
    if (show <= 0.004) continue;
    const domain = B.domain;
    const own = lit && domain === pickDomain && stem.from !== vault.project?.id;
    const ink = own && selected > 0 ? mix(inks.project, inks.rest, selected) : inks.rest;
    const k = stem.from === vault.project?.id ? (domain === pickDomain ? 1 : sinkShare) : keep(B.id, domain);
    const ax = B.x - A.x;
    const ay = B.y - A.y;
    const d = Math.hypot(ax, ay) || 1;
    const ra = (A.kind === 'project' ? A.r * 1.35 : A.r) + 1;
    const rb = (B.id === pick && selected > 0 ? lerp(B.r, lit!.agentR, selected) : B.r) + 1;
    if (d <= ra + rb) continue;
    ctx.globalAlpha = stem.alpha * show * k;
    ctx.strokeStyle = ink;
    ctx.beginPath();
    ctx.moveTo(A.x + (ax / d) * ra, A.y + (ay / d) * ra);
    ctx.lineTo(B.x - (ax / d) * rb, B.y - (ay / d) * rb);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  if (lit && t4 >= 0) {
    for (const plan of scene.lit) {
      const grown = easeOut(span(t4, plan.start, LIT.lineMs));
      if (grown <= 0) continue;
      const { line } = plan;
      if (line.kind === 'own') {
        const part = subPolyline(line.pts, 0, grown);
        if (part.length < 2) continue;
        ctx.globalAlpha = 0.92;
        ctx.strokeStyle = inks.arc;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(part[0]!.x, part[0]!.y);
        ctx.lineTo(part[part.length - 1]!.x, part[part.length - 1]!.y);
        ctx.stroke();
      } else if (line.kind === 'relates') {
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = inks.strong;
        ctx.beginPath();
        const shown = Math.floor(plan.dots.length * grown);
        for (let i = 0; i < shown; i += 1) {
          const p = plan.dots[i]!;
          ctx.moveTo(p.x + line.width, p.y);
          ctx.arc(p.x, p.y, line.width, 0, TAU);
        }
        ctx.fill();
      } else {
        ctx.globalAlpha = 0.92;
        ctx.fillStyle = line.kind === 'needs' ? inks.arc : inks.reach;
        ctx.fill(grown >= 1 && plan.path ? plan.path : ribbonPath(line.pts, line.width, 0, grown, !line.towardPick));
      }
      ctx.globalAlpha = 1;
      scene.record?.set(`lit:${line.end}`, line.pts[line.pts.length - 1]!.x, line.pts[line.pts.length - 1]!.y, grown);
    }
  }

  const selR = lit ? lerp(map.marks.get(lit.pick)!.r, lit.selectedR, selected) : 0;
  const drawConcept = (id: string) => {
    const m = map.marks.get(id)!;
    const at = markAt(scene, id, st);
    if (!at || at.light <= 0.004) return;
    let x = at.x;
    let y = at.y;
    const k = keep(id, m.domain);
    const end = endLight.get(id) ?? 0;
    let ink = mix(inks.rest, inks.ground, k);
    if (end > 0) ink = mix(inks.strong, ink, end);
    if (lit && id !== pick && m.domain === pickDomain && m.kind === 'domain' && selected > 0) ink = mix(inks.project, inks.rest, selected);
    if (m.kind === 'element') {
      const ownDot = lit?.ownDots.get(id);
      let r = m.r;
      if (ownDot && selected > 0) {
        x = lerp(x, ownDot.x, selected);
        y = lerp(y, ownDot.y, selected);
      }
      if (end > 0) r = lerp(m.r, m.r * 1.4, end);
      ctx.globalAlpha = at.light;
      dot(ctx, x, y, r, end > 0 && lit?.reach.ownNeeds.includes(id) ? mix(inks.arc, ink, end) : ink);
    } else if (m.kind === 'capability') {
      ctx.globalAlpha = at.light;
      if (id === pick && lit) capMark(ctx, scene, x, y, selR, mix(inks.project, ink, selected));
      else capMark(ctx, scene, x, y, m.r, ink);
    } else if (m.kind === 'domain') {
      ctx.globalAlpha = at.light;
      domainMark(ctx, scene, x, y, 1, ink);
    } else {
      ctx.globalAlpha = at.light;
      disc(ctx, x, y, m.r, S.domainRim, S.projectCore, inks.project, inks.discFill);
      ring(ctx, x, y, m.r * 1.35, 1.5, inks.project, at.light);
    }
    ctx.globalAlpha = 1;
    scene.record?.set(id, x, y, at.light);
  };
  for (const m of map.marks.values()) if (m.kind === 'element') drawConcept(m.id);
  for (const m of map.marks.values()) if (m.kind === 'capability') drawConcept(m.id);
  for (const m of map.marks.values()) if (m.kind === 'domain' || m.kind === 'project') drawConcept(m.id);

  if (lit && t4 >= 0) {
    const P = map.marks.get(lit.pick)!;
    const grow = 2 * (S.wide ? S.K : 0.84) * (1 - selected);
    ring(ctx, P.x, P.y, lit.rings[0] + grow, 1.5, inks.project, selected);
    ring(ctx, P.x, P.y, lit.rings[1] + grow, 1.5, inks.project, 0.5 * selected);
    const agent = easeOut(span(t4, LIT.agentFrom, LIT.ringMs));
    ring(ctx, P.x, P.y, lit.agentR + 6 * (S.wide ? S.K : 0.84) * (1 - agent), 1.5, inks.agent, agent);
    if (agent > 0) scene.record?.set('agentRing', P.x, P.y, agent);
    if (lit.leader) {
      const lead = easeOut(span(t4, LIT.leaderFrom, LIT.leaderMs));
      if (lead > 0) {
        const { from, to } = lit.leader;
        ctx.globalAlpha = 0.75;
        ctx.strokeStyle = inks.agent;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(lerp(from.x, to.x, lead), lerp(from.y, to.y, lead));
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.lineCap = 'round';
    for (const plan of scene.lit) {
      if (plan.glint < 0) continue;
      const u = easeInOut(span(t4, LIT.glintFrom + plan.glint * LIT.glintStep, LIT.glintMs));
      if (u <= 0 || u >= 1) continue;
      const part = subPolyline(plan.line.pts, Math.max(0, u - LIT.glintShare), u);
      if (part.length < 2) continue;
      ctx.globalAlpha = 0.9 * (1 - u);
      ctx.strokeStyle = inks.agent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(part[0]!.x, part[0]!.y);
      for (const p of part) ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.lineCap = 'butt';
  }

  scene.arcs.forEach((plan) => {
    const arc = map.restArcs[plan.index]!;
    if (!arc.numeral) return;
    const shown = span(st.t3, plan.start + arcMidpointMs, FLIGHT.numeralMs) * (lit && t4 >= 0 ? 1 - sinkT : 1);
    if (shown <= 0.004) return;
    ctx.globalAlpha = shown;
    ctx.beginPath();
    ctx.arc(arc.numeral.x, arc.numeral.y, S.numeralR, 0, TAU);
    ctx.fillStyle = inks.ground;
    ctx.fill();
    scene.stamps.draw(ctx, String(arc.count), arc.numeral.x, arc.numeral.y + 0.5, `500 ${S.fNumeral}px ${scene.mono}`, inks.name, { align: 'center' });
    ctx.globalAlpha = 1;
    scene.record?.set(`numeral:${arc.from}>${arc.to}`, arc.numeral.x, arc.numeral.y, shown);
  });
  paintNames(ctx, scene, st, sinkT, selected, endLight, litStarts);

  if (lit && t4 >= 0) {
    const u = easeInOut(span(t4, 0, LIT.pointerMs));
    const from = { x: lit.pointer.x + 100, y: lit.pointer.y + 100 };
    const c = { x: lerp(from.x, lit.pointer.x, 0.5) + 18, y: lerp(from.y, lit.pointer.y, 0.5) - 6 };
    const p = quadAt(from, c, lit.pointer, u);
    const alpha = easeOut(span(t4, 0, LIT.pointerIn));
    pointer(ctx, scene, p, alpha);
    if (alpha > 0) scene.record?.set('pointer', p.x, p.y, alpha);
  }
}

function paintNames(
  ctx: CanvasRenderingContext2D,
  scene: FilmPaintScene,
  st: MapState,
  sinkT: number,
  selected: number,
  endLight: Map<string, number>,
  litStarts: Map<string, number>,
) {
  const { map, vault } = scene;
  const lit = map.lit;
  const t4 = st.t4;
  const pickDomain = map.pick ? vault.byId.get(map.pick)!.domain : null;
  const isLit = Boolean(lit) && t4 >= 0;
  const blockIn = (id: string) => {
    if (scene.fragment.has(id)) return easeOut(span(st.t3, FLIGHT.travelFrom + scene.travelMs, FLIGHT.blockMs));
    return easeOut(span(st.t3, landedAt(scene, id), FLIGHT.blockMs));
  };
  const namesIn = easeOut(span(st.t3, FLIGHT.namesFrom, FLIGHT.namesMs));
  /* A context name the lit frame leaves out steps aside as the rest sinks. */
  const litKeys = lit ? new Set(lit.labels.map((label) => label.key)) : null;
  for (const label of map.restLabels) {
    let alpha = 1;
    if (label.role === 'domain' || label.role === 'units' || label.role === 'project') alpha = blockIn(label.id!);
    else alpha = namesIn;
    if (isLit) {
      if (label.role === 'cap' || !litKeys!.has(label.key)) alpha *= 1 - sinkT;
      else if ((label.role === 'domain' || label.role === 'units') && label.id !== pickDomain) {
        const floor = label.role === 'units' ? (map.sizes.wide ? 0.5 : 0) : scene.sink;
        alpha *= lerp(1, floor, sinkT);
      }
    }
    drawLabel(ctx, scene, label, alpha);
  }
  if (!lit || t4 < 0) return;
  void selected;
  for (const label of lit.labels) {
    if (label.role === 'domain' || label.role === 'units' || label.role === 'project') continue;
    let alpha = 0;
    let dy = 0;
    if (label.role === 'pick' || label.role === 'reach') {
      const v = easeOut(span(t4, LIT.blockFrom, LIT.blockMs));
      alpha = v;
      dy = (1 - v) * 4;
    } else if (label.role === 'agent' || label.role === 'tool') {
      alpha = easeOut(span(t4, map.sizes.wide ? LIT.tagFrom : LIT.agentFrom, LIT.tagMs));
    } else if (label.role === 'end' && label.id) {
      const start = litStarts.get(label.id) ?? LIT.linesFrom;
      alpha = easeOut(span(t4, start + LIT.lineMs * 0.7, LIT.endMs));
      void endLight;
    }
    drawLabel(ctx, scene, label, alpha, dy);
  }
  if (lit.keys.length) {
    lit.keys.forEach((key, i) => {
      const alpha = i === 0 ? easeOut(span(t4, LIT.blockFrom, LIT.blockMs)) : easeOut(span(t4, LIT.agentFrom, LIT.tagMs));
      ring(ctx, key.x, key.y, 5, 1.5, key.ink === 'project' ? scene.inks.project : scene.inks.agent, alpha);
    });
  }
}

export function paintFlights(ctx: CanvasRenderingContext2D, scene: FilmPaintScene, t3: number) {
  const { stamps, inks, wall } = scene;
  for (const plan of scene.flights.values()) {
    if (t3 < plan.start) continue;
    const f = flight(t3, plan.start, plan.ms);
    if (f.name <= 0.004) continue;
    const m = scene.map.marks.get(plan.id)!;
    let p = plan.from;
    if (!plan.dropText) p = quadAt(plan.from, bowControl(plan.from, m, FLIGHT.bow * plan.side), m, f.p);
    const alpha = f.name * plan.rowAlpha;
    ctx.globalAlpha = alpha;
    stamps.draw(ctx, plan.text, p.x, p.y, wall.font, inks.tertiary, { align: 'center', scale: plan.dropText ? 1 : f.scale });
    ctx.globalAlpha = 1;
    scene.record?.set(`fly:${plan.id}`, p.x, p.y, alpha);
  }
}
