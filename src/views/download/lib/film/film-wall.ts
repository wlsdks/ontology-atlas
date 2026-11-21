import type { FilmVault } from './film-vault';
import type { Measure } from './film-map-layout';
import type { Pt, Rect } from './film-geometry';

export interface WallRow {
  key: string;
  text: string;
  id: string | null;
  count: number | null;
  indent: number;
}

export function wallRows(vault: FilmVault): WallRow[] {
  const rows: WallRow[] = [{ key: 'dir:root', text: 'docs/ontology/', id: null, count: null, indent: 0 }];
  if (vault.project) rows.push({ key: vault.project.id, text: `${vault.project.slug}.md`, id: vault.project.id, count: null, indent: 1 });
  const groups = [
    ['domains/', vault.domains],
    ['capabilities/', vault.capabilities],
    ['elements/', vault.elements],
  ] as const;
  for (const [dir, concepts] of groups) {
    rows.push({ key: `dir:${dir}`, text: dir, id: null, count: concepts.length, indent: 1 });
    const sorted = [...concepts].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
    for (const c of sorted) rows.push({ key: c.id, text: `${c.slug}.md`, id: c.id, count: null, indent: 2 });
  }
  return rows;
}

export interface PlacedRow {
  row: WallRow;
  x: number;
  y: number;
  text: string;
  width: number;
  col: number;
}

export interface WallLayout {
  rows: PlacedRow[];
  size: number;
  pitch: number;
  font: string;
  countGap: number;
  cols: number;
  /** Phone: the list's window and how far it scrolls to bring the pick's row to 42% of it. */
  window: Rect | null;
  scrollTo: number;
  pickRow: number;
  chip: (Rect & { radius: number }) | null;
}

export interface WallInput {
  vault: FilmVault;
  pick: string | null;
  w: number;
  wide: boolean;
  safe: number;
  titleBox: Rect;
  captionBox: Rect;
  columnLeft: number;
  measure: Measure;
  mono: string;
}

const INDENT_PX = 18;

export function layoutWall(input: WallInput): WallLayout {
  const { vault, w, wide, safe, titleBox, captionBox, columnLeft, measure, mono, pick } = input;
  const rows = wallRows(vault);
  const size = wide ? 15 : 13;
  const font = `400 ${size}px ${mono}`;
  const ch = measure('0', font);
  const top = titleBox.b + (wide ? 8 : 4);
  const bottom = captionBox.t - (wide ? 8 : 4);
  const avail = Math.max(0, bottom - top);
  const left = wide ? Math.max(safe, columnLeft) : safe;
  const right = w - safe;
  let cols = 1;
  let pitch = wide ? 26 : 22;
  if (wide) {
    cols = w >= 1600 ? 5 : w >= 1000 ? 4 : 3;
    while (Math.ceil(rows.length / cols) * pitch > avail && pitch > 22) pitch -= 1;
    while (Math.ceil(rows.length / cols) * pitch > avail && cols < 8) cols += 1;
  }
  const perCol = wide ? Math.ceil(rows.length / cols) : rows.length;
  const colW = (right - left) / cols;
  const blockH = (wide ? perCol : 0) * pitch;
  const blockTop = wide ? top + Math.max(0, (avail - blockH) / 2) : top;
  const countGap = ch * 1.5;
  const placed: PlacedRow[] = rows.map((row, i) => {
    const col = wide ? Math.floor(i / perCol) : 0;
    const r = wide ? i % perCol : i;
    const x = left + col * colW + row.indent * INDENT_PX;
    const y = blockTop + r * pitch + pitch / 2;
    const room = colW - row.indent * INDENT_PX - 16 - (row.count !== null ? countGap + ch * 3 : 0);
    let text = row.text;
    if (measure(text, font) > room) {
      while (text.length > 2 && measure(`${text}…`, font) > room) text = text.slice(0, -1);
      text = `${text}…`;
    }
    return { row, x, y, text, width: measure(text, font), col };
  });
  const pickRow = pick ? placed.findIndex((p) => p.row.id === pick) : -1;
  const window = wide ? null : { l: left, t: top, r: right, b: bottom };
  let scrollTo = 0;
  if (window && pickRow >= 0) {
    const winH = window.b - window.t;
    const max = Math.max(0, placed.length * pitch - winH);
    scrollTo = Math.min(max, Math.max(0, placed[pickRow]!.y - window.t - 0.42 * winH));
  }
  const chip =
    pickRow >= 0
      ? {
          l: placed[pickRow]!.x - 10,
          t: placed[pickRow]!.y - pitch / 2 + 1,
          r: placed[pickRow]!.x + placed[pickRow]!.width + 10,
          b: placed[pickRow]!.y + pitch / 2 - 1,
          radius: 6,
        }
      : null;
  return { rows: placed, size, pitch, font, countGap, cols, window, scrollTo, pickRow, chip };
}

export function rowOnPhone(wall: WallLayout, row: PlacedRow, scroll: number): Pt & { alpha: number } {
  const y = row.y - scroll;
  if (!wall.window) return { x: row.x, y, alpha: 1 };
  const fade = wall.pitch * 3;
  const alpha = Math.max(0, Math.min(1, (y - wall.window.t) / fade, (wall.window.b - y) / fade));
  return { x: row.x, y, alpha };
}
