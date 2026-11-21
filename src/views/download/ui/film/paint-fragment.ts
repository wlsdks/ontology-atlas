import { OPEN, rowHighlight, rowStart, span } from '../../lib/film/film-acts';
import { polylineLength, quadAt, subPolyline, type Pt } from '../../lib/film/film-geometry';
import { clamp01, easeInOut, easeOut, lerp } from '../../lib/film/film-kit';
import type { OpenLayout } from '../../lib/film/film-open';
import { mix, rgba } from './film-colors';
import { capMark, domainMark, dot, light } from './film-marks';
import type { FilmPaintScene } from './film-paint-scene';
import { ribbonPath } from './film-ribbon';

function hairTarget(O: OpenLayout, k: number, r: number): Pt {
  switch (k) {
    case 0:
      return { x: O.pick.x - r - 8, y: O.pick.y };
    case 1:
      return { x: O.pickName.x - 8, y: O.pickName.y };
    case 2:
      return { x: O.domain.x - O.domainR - 8, y: O.domain.y };
    case 3: {
      const mid = O.dots[Math.floor(O.dots.length / 2)] ?? O.pick;
      return { x: mid.x, y: mid.y + 10 };
    }
    default: {
      const line = O.leaving[0];
      return line ? { x: lerp(line.from.x, line.to.x, 0.25), y: lerp(line.from.y, line.to.y, 0.25) + 8 } : O.pick;
    }
  }
}

export function paintFragment(
  ctx: CanvasRenderingContext2D,
  scene: FilmPaintScene,
  t2: number,
  linesLight: number,
  travel: number,
  namesLight: number,
  pass: 'light' | 'marks',
) {
  const O = scene.open;
  const { map, inks, stamps, vault } = scene;
  const pick = map.pick;
  if (!O || !pick) return;
  const S = map.sizes;
  const node = vault.byId.get(pick)!;
  const pickMap = map.marks.get(pick)!;
  const domainMap = node.domain ? map.marks.get(node.domain) : undefined;
  const cluster = map.clusters.find((c) => c.id === node.domain);
  const at = (from: Pt, to: Pt | undefined) => (to ? { x: lerp(from.x, to.x, travel), y: lerp(from.y, to.y, travel) } : from);
  const appear = (k: number) => easeOut(span(t2, rowStart(k) + OPEN.drawDelay, OPEN.drawMs));
  const kindIn = appear(0);
  const titleIn = appear(1);
  const domainIn = appear(2);
  const grow = easeInOut(span(t2, rowStart(3) + OPEN.drawDelay, OPEN.growMs));
  const depsIn = appear(4);

  const P = at(O.pick, pickMap);
  const D = domainMap ? at(O.domain, domainMap) : O.domain;
  if (pass === 'light') {
    if (domainIn > 0.004 && cluster) light(ctx, scene.sprites.get(inks.rest), D.x, D.y, lerp(O.light.r, cluster.footprint * 1.8, travel), 0.2 * domainIn);
    return;
  }
  if (depsIn > 0 && linesLight > 0.004) {
    O.leaving.forEach((line, i) => {
      const grown = easeOut(span(t2, rowStart(4) + OPEN.drawDelay + i * OPEN.lineStep, OPEN.lineMs));
      if (grown <= 0) return;
      const pts = [line.from, { x: lerp(line.from.x, line.to.x, 0.5), y: lerp(line.from.y, line.to.y, 0.5) }, line.to];
      const len = polylineLength(pts);
      const path = ribbonPath(pts, (S.wide ? 4.2 : 2.8) * 1, 0, grown, true);
      const g = ctx.createLinearGradient(line.from.x, line.from.y, line.to.x, line.to.y);
      const fadeAt = line.named ? 1 : clamp01(1 - O.fadePx / Math.max(1, len));
      g.addColorStop(0, rgba(inks.arc, 0.92));
      g.addColorStop(fadeAt, rgba(inks.arc, line.named ? 0.92 : 0.6));
      g.addColorStop(1, rgba(inks.arc, line.named ? 0.92 : 0));
      ctx.globalAlpha = linesLight * (line.named ? 1 : 0.7);
      ctx.fillStyle = g;
      ctx.fill(path);
      ctx.globalAlpha = 1;
      scene.record?.set(`leave:${line.id}`, line.to.x, line.to.y, linesLight * grown);
      if (line.named && O.namedEnd) {
        const arrived = easeOut(span(t2, rowStart(4) + OPEN.drawDelay + i * OPEN.lineStep + OPEN.lineMs * 0.6, 240)) * linesLight;
        if (arrived > 0.004) {
          const E = O.namedEnd;
          ctx.globalAlpha = arrived;
          capMark(ctx, scene, E.at.x, E.at.y, E.r, inks.rest);
          if (E.label) stamps.draw(ctx, vault.byId.get(E.id)!.label, E.label.x, E.label.y, E.font, inks.name, { halo: inks.halo, align: E.align });
          ctx.globalAlpha = 1;
          scene.record?.set(`named:${E.id}`, E.at.x, E.at.y, arrived);
        }
      }
    });
  }
  const rows = O.lines.filter((l) => l.role !== 'rule');
  for (let k = 0; k < rows.length; k += 1) {
    const hi = rowHighlight(t2, k, rows.length) * linesLight;
    if (hi <= 0.004) continue;
    const grown = easeOut(span(t2, rowStart(k), OPEN.hairMs));
    const line = rows[k]!;
    const from = { x: Math.min(O.panel.r - 8, line.end + 12), y: line.y };
    const to = hairTarget(O, k, lerp(O.pickR0, O.pickR1, grow));
    const c1 = { x: from.x + (to.x - from.x) * 0.5, y: from.y };
    const pts: Pt[] = [];
    for (let i = 0; i <= 24; i += 1) pts.push(quadAt(from, c1, to, i / 24));
    const part = subPolyline(pts, 0, grown);
    if (part.length < 2) continue;
    ctx.globalAlpha = 0.45 * hi;
    ctx.strokeStyle = inks.arc;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(part[0]!.x, part[0]!.y);
    for (const p of part) ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  const pickR = lerp(lerp(O.pickR0, O.pickR1, grow), pickMap.r, travel);
  const domainScale = lerp(O.zoom, 1, travel);
  if (domainIn > 0.004) {
    const dx = P.x - D.x;
    const dy = P.y - D.y;
    const d = Math.hypot(dx, dy) || 1;
    const dr = S.domainR * domainScale + 2;
    ctx.globalAlpha = domainIn * lerp(0.4, 0.24, travel);
    ctx.strokeStyle = mix(inks.name, inks.rest, 1 - travel);
    ctx.lineWidth = lerp(1.5, 1, travel);
    ctx.beginPath();
    ctx.moveTo(D.x + (dx / d) * dr, D.y + (dy / d) * dr);
    ctx.lineTo(P.x - (dx / d) * (pickR + 2), P.y - (dy / d) * (pickR + 2));
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  /* The pick's dots leave its rim one after another; three turn the dependency ink. */
  const own = new Set(O.ownNeeds);
  O.dots.forEach((d0, k) => {
    const out = easeOut(span(t2, rowStart(3) + OPEN.drawDelay + k * OPEN.dotStep, OPEN.dotMs));
    if (out <= 0.004) return;
    const angle = Math.atan2(d0.y - O.pick.y, d0.x - O.pick.x);
    const rim = { x: O.pick.x + Math.cos(angle) * pickR, y: O.pick.y + Math.sin(angle) * pickR };
    const close = { x: lerp(rim.x, d0.x, out), y: lerp(rim.y, d0.y, out) };
    const e = node.elements[k]!;
    const target = map.marks.get(e);
    const p = at(close, target);
    const lit = own.has(k) ? depsIn * (1 - travel) : 0;
    const ink = mix(inks.arc, inks.rest, lit);
    if (lit > 0.004) {
      ctx.globalAlpha = 0.8 * lit;
      ctx.strokeStyle = inks.arc;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(P.x + Math.cos(angle) * (pickR + 2), P.y + Math.sin(angle) * (pickR + 2));
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.globalAlpha = out;
    dot(ctx, p.x, p.y, lerp(O.dotR, S.elemR, travel), ink);
    ctx.globalAlpha = 1;
    scene.record?.set(e, p.x, p.y, out);
  });
  if (domainIn > 0.004 && node.domain) {
    ctx.globalAlpha = domainIn;
    domainMark(ctx, scene, D.x, D.y, domainScale, mix(inks.name, inks.rest, 1 - travel));
    ctx.globalAlpha = 1;
    scene.record?.set(node.domain, D.x, D.y, domainIn);
  }
  if (kindIn > 0.004) {
    ctx.globalAlpha = kindIn;
    capMark(ctx, scene, P.x, P.y, pickR, mix(inks.strong, inks.rest, 1 - travel));
    ctx.globalAlpha = 1;
    scene.record?.set(pick, P.x, P.y, kindIn);
  }
  /* Names of the close-up: they hand over to the map's names as the fragment settles. */
  const pn = titleIn * namesLight;
  if (pn > 0.004) {
    ctx.globalAlpha = pn;
    stamps.draw(ctx, node.label, P.x + (O.pickName.x - O.pick.x), P.y + (O.pickName.y - O.pick.y), O.pickName.font, inks.strong, { halo: inks.halo });
    ctx.globalAlpha = 1;
    scene.record?.set('open:pickName', P.x, P.y, pn);
  }
  const dn = domainIn * namesLight;
  if (dn > 0.004 && node.domain) {
    ctx.globalAlpha = dn;
    stamps.draw(ctx, vault.byId.get(node.domain)!.label, D.x, D.y + (O.domainName.y - O.domain.y), O.domainName.font, inks.strong, { halo: inks.halo, align: 'center' });
    ctx.globalAlpha = 1;
    scene.record?.set('open:domainName', D.x, D.y, dn);
  }
}
