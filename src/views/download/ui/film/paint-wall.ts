import { OPEN, WALL, chipIn, phoneScroll, rowHighlight, rowStart, span, wallColumn, wallDim } from '../../lib/film/film-acts';
import type { Rect } from '../../lib/film/film-geometry';
import { easeOut, lerp } from '../../lib/film/film-kit';
import { rowOnPhone, type PlacedRow } from '../../lib/film/film-wall';
import { mix, rgba } from './film-colors';
import { roundRect } from './film-marks';
import type { FilmPaintScene } from './film-paint-scene';

/** The wall's rows at act-1 time `t1` under an extra light `fade`; `rowLight` 0 leaves a row to another painter. */
export function paintWall(
  ctx: CanvasRenderingContext2D,
  scene: FilmPaintScene,
  t1: number,
  fade: number,
  rowLight: (row: PlacedRow) => number,
  dimmed = true,
) {
  const { wall, inks, stamps } = scene;
  if (fade <= 0.004) return;
  const scroll = wall.window ? wall.scrollTo * phoneScroll(t1) : 0;
  const dim = dimmed ? wallDim(t1) : 1;
  const pickId = scene.map.pick;
  const phoneIn = easeOut(span(t1, 0, WALL.phoneIn));
  for (const row of wall.rows) {
    const own = rowLight(row);
    if (own <= 0.004) continue;
    let y = row.y;
    let alpha = fade * own;
    if (wall.window) {
      const on = rowOnPhone(wall, row, scroll);
      if (on.alpha <= 0) continue;
      y = on.y;
      alpha *= on.alpha * phoneIn;
    } else {
      const col = wallColumn(t1, row.col);
      alpha *= col.alpha;
      y += col.rise;
    }
    const isPick = row.row.id !== null && row.row.id === pickId;
    if (!isPick) alpha *= dim;
    if (alpha <= 0.004) continue;
    ctx.globalAlpha = alpha;
    const ink = isPick ? mix(inks.primary, inks.tertiary, chipIn(t1)) : row.row.id === null ? inks.secondary : inks.tertiary;
    stamps.draw(ctx, row.text, row.x, y, wall.font, ink);
    if (row.row.count !== null) stamps.draw(ctx, String(row.row.count), row.x + row.width + wall.countGap, y, wall.font, inks.tertiary);
    ctx.globalAlpha = 1;
    scene.record?.set(`row:${row.row.key}`, row.x, y, alpha);
  }
}

const lerpRect = (a: Rect, b: Rect, t: number): Rect => ({ l: lerp(a.l, b.l, t), t: lerp(a.t, b.t, t), r: lerp(a.r, b.r, t), b: lerp(a.b, b.b, t) });

export function paintChipOrPanel(ctx: CanvasRenderingContext2D, scene: FilmPaintScene, open: number, chipLight: number, rowsLight: number, t2: number, scroll: number) {
  const { wall, inks, stamps } = scene;
  const O = scene.open;
  const chip0 = wall.chip;
  if (!chip0) return;
  const pickRow = wall.rows[wall.pickRow]!;
  const chip: Rect = { l: chip0.l, t: chip0.t - scroll, r: chip0.r, b: chip0.b - scroll };
  const rect = O ? lerpRect(chip, O.panel, open) : chip;
  const radius = O ? lerp(chip0.radius, O.radius, open) : chip0.radius;
  if (chipLight > 0.004) {
    ctx.globalAlpha = chipLight * (1 - open);
    roundRect(ctx, rect, radius);
    ctx.fillStyle = rgba(inks.primary, 0.06);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(inks.primary, 0.14);
    ctx.stroke();
    if (O && open > 0) {
      ctx.globalAlpha = chipLight * open;
      roundRect(ctx, rect, radius);
      ctx.fillStyle = inks.panel;
      ctx.fill();
      ctx.strokeStyle = inks.border;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  const fileFont = wall.font;
  const from = { x: pickRow.x, y: pickRow.y - scroll };
  const dirW = O ? O.dirW : 0;
  const to = O ? { x: O.headerX + dirW, y: O.headerY } : from;
  const x = lerp(from.x, to.x, open);
  const y = lerp(from.y, to.y, open);
  const text = open > 0.5 && O ? O.file : pickRow.text;
  const nameLight = chipLight;
  if (nameLight > 0.004) {
    ctx.globalAlpha = nameLight;
    stamps.draw(ctx, text, x, y, fileFont, inks.primary);
    ctx.globalAlpha = 1;
    scene.record?.set('file', x, y, nameLight);
  }
  if (!O || rowsLight <= 0.004) return;
  const header = easeOut(span(t2, OPEN.headerFrom, OPEN.headerMs)) * rowsLight;
  if (header > 0.004) {
    ctx.globalAlpha = header;
    stamps.draw(ctx, O.dir, O.headerX, O.headerY, `400 ${scene.map.sizes.wide ? 15 : 13}px ${scene.mono}`, inks.tertiary);
    ctx.strokeStyle = inks.borderSoft;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(O.panel.l, O.panel.t + O.barH);
    ctx.lineTo(O.panel.r, O.panel.t + O.barH);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  const keyRows = O.lines.filter((l) => l.role !== 'rule').length;
  O.lines.forEach((line, i) => {
    let k = -1;
    let alpha: number;
    if (line.role === 'rule') alpha = i === 0 ? header : easeOut(span(t2, rowStart(keyRows - 1), OPEN.rowInMs)) * rowsLight;
    else {
      k = i - 1;
      alpha = easeOut(span(t2, rowStart(k), OPEN.rowInMs)) * rowsLight;
    }
    if (alpha <= 0.004) return;
    if (k >= 0) {
      const hi = rowHighlight(t2, k, keyRows) * alpha;
      if (hi > 0.004) {
        ctx.globalAlpha = hi;
        roundRect(ctx, { l: O.panel.l + 10, t: line.y - O.lineH / 2 + 2, r: O.panel.r - 10, b: line.y + O.lineH / 2 - 2 }, 6);
        ctx.fillStyle = rgba(inks.primary, 0.06);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    ctx.globalAlpha = alpha;
    if (line.key) {
      stamps.draw(ctx, `${line.key}:`, line.x, line.y, O.font, inks.tertiary);
      stamps.draw(ctx, line.value, line.valueX, line.y, O.font, inks.primary);
    } else stamps.draw(ctx, line.value, line.x, line.y, O.font, inks.tertiary);
    ctx.globalAlpha = 1;
    scene.record?.set(`fm:${i}`, line.x, line.y, alpha);
  });
}
