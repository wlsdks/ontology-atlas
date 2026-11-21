import { ACT_START, FILM_MS, FLIGHT, OPEN, WALL, chipIn, local, phoneScroll, span, wallColumn } from '../../lib/film/film-acts';
import { easeInOutSine, easeInOut, easeOut } from '../../lib/film/film-kit';
import { rowOnPhone, type PlacedRow } from '../../lib/film/film-wall';
import { mix, rgba } from './film-colors';
import { roundRect } from './film-marks';
import type { FilmPaintScene } from './film-paint-scene';
import { paintFragment } from './paint-fragment';
import { paintFlights, paintMap } from './paint-map';
import { paintChipOrPanel, paintWall } from './paint-wall';

/**
 * The film at film time `T` (ms, running on through the hold). Every place, size and light is a
 * function of `T`, so the act bar's jumps and the loop land on exact frames.
 */
export function paintFilm(ctx: CanvasRenderingContext2D, scene: FilmPaintScene, T: number, w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
  const t = Math.min(T, FILM_MS);
  const t1 = local(t, 0);
  const t2 = local(t, 1);
  const t3 = local(t, 2);
  const t4 = local(t, 3);
  const { wall } = scene;
  const pickRow = wall.pickRow >= 0 ? wall.rows[wall.pickRow]! : null;
  const isPickRow = (row: PlacedRow) => row === pickRow;
  const scroll = wall.window ? wall.scrollTo * phoneScroll(Math.min(t1, ACT_START[1]!)) : 0;

  if (t2 < 0) {
    paintWall(ctx, scene, t1, 1, (row) => (isPickRow(row) ? 0 : 1));
    if (pickRow) {
      const col = wall.window ? { alpha: easeOut(span(t1, 0, WALL.phoneIn)), rise: 0 } : wallColumn(t1, pickRow.col);
      const chip = chipIn(t1);
      if (wall.chip && chip > 0.004) {
        ctx.globalAlpha = chip * col.alpha;
        roundRect(ctx, { l: wall.chip.l, t: wall.chip.t - scroll + col.rise, r: wall.chip.r, b: wall.chip.b - scroll + col.rise }, wall.chip.radius);
        ctx.fillStyle = rgba(scene.inks.primary, 0.06);
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = rgba(scene.inks.primary, 0.14);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      const edge = wall.window ? rowOnPhone(wall, pickRow, scroll).alpha : 1;
      ctx.globalAlpha = col.alpha * edge;
      scene.stamps.draw(ctx, pickRow.text, pickRow.x, pickRow.y - scroll + col.rise, wall.font, mix(scene.inks.primary, scene.inks.tertiary, chip));
      ctx.globalAlpha = 1;
      scene.record?.set('file', pickRow.x, pickRow.y - scroll + col.rise, col.alpha * edge);
    }
    return;
  }
  const notPick = (row: PlacedRow) => (isPickRow(row) ? 0 : 1);
  if (t3 < 0) {
    const wallOut = 1 - easeOut(span(t2, 0, OPEN.wallOutMs));
    paintWall(ctx, scene, ACT_START[1]! - 1, wallOut, notPick);
    const open = easeInOutSine(span(t2, 0, OPEN.morphMs));
    paintChipOrPanel(ctx, scene, open, 1, 1, t2, scroll);
    paintFragment(ctx, scene, t2, 1, 0, 1, 'light');
    paintFragment(ctx, scene, t2, 1, 0, 1, 'marks');
    return;
  }
  const fold = easeInOutSine(span(t3, 0, FLIGHT.foldMs));
  const actTwoEnd = ACT_START[2]! - ACT_START[1]!;
  const travel = easeInOut(span(t3, FLIGHT.travelFrom, scene.travelMs));
  const linesLight = 1 - span(t3, 0, FLIGHT.fragmentOutMs);
  const namesLight = 1 - easeInOut(span(t3, FLIGHT.travelFrom, 300));
  const travelling = scene.open && scene.map.pick && t3 < FLIGHT.travelFrom + scene.travelMs;
  if (t4 < 0) {
    const back = 0.5 * easeOut(span(t3, 0, FLIGHT.foldMs));
    const leaving = 1 - easeInOut(span(t3, 1400, 600));
    paintWall(
      ctx,
      scene,
      ACT_START[1]! - 1,
      back,
      (row) => {
        if (isPickRow(row)) return 0;
        const id = row.row.id;
        if (id === null || scene.fragment.has(id) || !scene.flights.has(id)) return leaving;
        return t3 >= scene.flights.get(id)!.start ? 0 : 1;
      },
      false,
    );
    const chipLight = 1 - easeInOut(span(t3, FLIGHT.foldMs, 400));
    paintChipOrPanel(ctx, scene, 1 - fold, chipLight, 1 - fold, actTwoEnd, scroll);
  }
  if (travelling) paintFragment(ctx, scene, actTwoEnd, linesLight, travel, namesLight, 'light');
  paintMap(ctx, scene, { t3, t4 });
  if (travelling) paintFragment(ctx, scene, actTwoEnd, linesLight, travel, namesLight, 'marks');
  if (t4 < 0) paintFlights(ctx, scene, t3);
}
