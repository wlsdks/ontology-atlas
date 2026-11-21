import type { Pt, Rect } from '../../lib/film/film-geometry';
import type { FilmLabel, InkRole } from '../../lib/film/film-map-labels';
import type { FilmInks, FilmPaintScene } from './film-paint-scene';

export const TAU = Math.PI * 2;

export function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rim: number, core: number, ink: string, fill: string) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = rim;
  ctx.strokeStyle = ink;
  ctx.stroke();
  if (core > 0) {
    ctx.beginPath();
    ctx.arc(x, y, core, 0, TAU);
    ctx.fillStyle = ink;
    ctx.fill();
  }
}

export function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ink: string) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = ink;
  ctx.fill();
}

export function ring(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, width: number, ink: string, alpha: number) {
  if (alpha <= 0.002 || r <= 0) return;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.lineWidth = width;
  ctx.strokeStyle = ink;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

export function light(ctx: CanvasRenderingContext2D, sprite: HTMLCanvasElement | undefined, x: number, y: number, r: number, alpha: number) {
  if (!sprite || alpha <= 0.002 || r <= 1) return;
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

export function inkOf(inks: FilmInks, role: InkRole): string {
  switch (role) {
    case 'primary':
      return inks.primary;
    case 'secondary':
      return inks.secondary;
    case 'tertiary':
      return inks.tertiary;
    case 'name':
      return inks.name;
    case 'strong':
      return inks.strong;
    case 'arc':
      return inks.arc;
    case 'reach':
      return inks.reach;
    case 'agent':
      return inks.agent;
  }
}

export function drawLabel(ctx: CanvasRenderingContext2D, scene: FilmPaintScene, label: FilmLabel, alpha: number, dy = 0) {
  if (alpha <= 0.004) return;
  const { stamps, inks } = scene;
  ctx.globalAlpha = Math.min(1, alpha);
  if (label.segments.length === 1) {
    const seg = label.segments[0]!;
    stamps.draw(ctx, seg.text, label.x, label.y + dy, label.font, inkOf(inks, seg.ink), { halo: inks.halo, align: label.align });
  } else {
    let x = label.box.l;
    for (const seg of label.segments) x += stamps.draw(ctx, seg.text, x, label.y + dy, label.font, inkOf(inks, seg.ink), { halo: inks.halo });
  }
  ctx.globalAlpha = 1;
  scene.record?.set(label.key, label.x, label.y + dy, alpha);
}

export function capMark(ctx: CanvasRenderingContext2D, scene: FilmPaintScene, x: number, y: number, r: number, ink: string) {
  const S = scene.map.sizes;
  const min = scene.map.capRadius(0);
  if (r < min + 0.2) disc(ctx, x, y, r, S.capRim, Math.max(1.1, r - 2.6 * S.K), ink, scene.inks.discFill);
  else disc(ctx, x, y, r, S.capRim, Math.max(1.6 * S.K, r - 3.5 * S.K), ink, scene.inks.discFill);
}

export function domainMark(ctx: CanvasRenderingContext2D, scene: FilmPaintScene, x: number, y: number, scale: number, ink: string) {
  const S = scene.map.sizes;
  disc(ctx, x, y, S.domainR * scale, S.domainRim * scale, S.domainCore * scale, ink, scene.inks.discFill);
}

export function pointer(ctx: CanvasRenderingContext2D, scene: FilmPaintScene, tip: Pt, alpha: number) {
  if (alpha <= 0.004) return;
  const k = 18 / 20;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(tip.x, tip.y);
  ctx.scale(k, k);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 17);
  ctx.lineTo(4.6, 13);
  ctx.lineTo(7.6, 20);
  ctx.lineTo(10.4, 18.8);
  ctx.lineTo(7.4, 12);
  ctx.lineTo(13, 12);
  ctx.closePath();
  ctx.fillStyle = scene.inks.strong;
  ctx.fill();
  ctx.lineWidth = 1 / k;
  ctx.strokeStyle = scene.inks.ground;
  ctx.stroke();
  ctx.restore();
}

export function roundRect(ctx: CanvasRenderingContext2D, rect: Rect, radius: number) {
  ctx.beginPath();
  ctx.roundRect(rect.l, rect.t, rect.r - rect.l, rect.b - rect.t, radius);
}
