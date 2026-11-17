/**
 * The shapes the Play with Moru round draws itself, in the page's pixel style: the star, the
 * golden star, the bug, the lives heart and a 3×5 digit face for scores and the countdown. Moru
 * and the emotes come from their existing art; nothing here redraws them.
 *
 * Each map is rows of palette letters; `.` is empty. A one-pixel outline in the canvas colour is
 * added around every shape so it reads against the night sky.
 */

export type Palette = Record<string, string>;

export const STAR_ROWS = [
  '.....f.....',
  '....fff....',
  '....fff....',
  'fffffffffff',
  '.fffffffff.',
  '..fffffff..',
  '..fffffff..',
  '.ffff.ffff.',
  '.fff...fff.',
  'ff.......ff',
];

export const GOLD_ROWS = [
  '.....h.....',
  '....hhf....',
  '....hff....',
  'hhhhhffffff',
  '.fhhfffffd.',
  '..fffffdd..',
  '..ffffffd..',
  '.ffff.fddd.',
  '.fdd...ddd.',
  'dd.......dd',
];

/** A small red beetle: the error you dodge. */
export const BUG_ROWS = [
  '..l.....l..',
  '...l...l...',
  '....kkk....',
  '...kwkwk...',
  'l.rrrkrrr.l',
  '.lrrrkrrrl.',
  '..rkrkrkr..',
  'l.rrrkrrr.l',
  '.lrkrkrkrl.',
  '..rrrkrrr..',
  '...rrkrr...',
];

export const HEART_ROWS = ['.ff.ff.', 'fffffff', 'fffffff', '.fffff.', '..fff..', '...f...'];

/** 3×5 digits plus `+`, `×` and `-`. */
export const GLYPHS: Record<string, string[]> = {
  '0': ['fff', 'f.f', 'f.f', 'f.f', 'fff'],
  '1': ['.f.', 'ff.', '.f.', '.f.', 'fff'],
  '2': ['ff.', '..f', '.f.', 'f..', 'fff'],
  '3': ['ff.', '..f', '.f.', '..f', 'ff.'],
  '4': ['f.f', 'f.f', 'fff', '..f', '..f'],
  '5': ['fff', 'f..', 'ff.', '..f', 'ff.'],
  '6': ['.ff', 'f..', 'fff', 'f.f', 'fff'],
  '7': ['fff', '..f', '.f.', '.f.', '.f.'],
  '8': ['fff', 'f.f', 'fff', 'f.f', 'fff'],
  '9': ['fff', 'f.f', 'fff', '..f', 'ff.'],
  '+': ['...', '.f.', 'fff', '.f.', '...'],
  '-': ['...', '...', 'fff', '...', '...'],
  '×': ['...', 'f.f', '.f.', 'f.f', '...'],
};

/** 5×7 digits and `×` for the countdown and the multiplier, where the 3×5 face reads as blocks. */
export const BIG_GLYPHS: Record<string, string[]> = {
  '×': ['.....', '.....', 'f...f', '.f.f.', '..f..', '.f.f.', 'f...f'],
  '4': ['...f.', '..ff.', '.f.f.', 'f..f.', 'fffff', '...f.', '...f.'],
  '1': ['..f..', '.ff..', 'f.f..', '..f..', '..f..', '..f..', 'fffff'],
  '2': ['.fff.', 'f...f', '....f', '...f.', '..f..', '.f...', 'fffff'],
  '3': ['.fff.', 'f...f', '....f', '..ff.', '....f', 'f...f', '.fff.'],
};

/** Every filled cell plus the outline ring around it, in grid units with a one-cell margin. */
export function pixelCells(rows: readonly string[]): { width: number; height: number; fill: Array<[number, number, string]>; edge: Array<[number, number]> } {
  const fill: Array<[number, number, string]> = [];
  const filled = new Set<string>();
  rows.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c === '.') return;
      fill.push([x + 1, y + 1, c]);
      filled.add(`${x + 1},${y + 1}`);
    }),
  );
  const edge = new Map<string, [number, number]>();
  for (const [x, y] of fill) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const key = `${x + dx},${y + dy}`;
      if (!filled.has(key)) edge.set(key, [x + dx, y + dy]);
    }
  }
  return { width: rows[0].length + 2, height: rows.length + 2, fill, edge: [...edge.values()] };
}

/** An SVG path of one palette letter's cells, for the DOM's crisp-edged marks. */
export function pixelPath(rows: readonly string[], letter: string | 'edge'): string {
  const cells = pixelCells(rows);
  const list = letter === 'edge' ? cells.edge : cells.fill.filter(([, , c]) => c === letter).map(([x, y]) => [x, y] as [number, number]);
  return list.map(([x, y]) => `M${x} ${y}h1v1h-1z`).join('');
}

/** Paints a pixel map into a fresh canvas `unit` CSS pixels per cell, at the screen's density. */
export function pixelSprite(rows: readonly string[], palette: Palette, unit: number, dpr: number, outline: string | null): HTMLCanvasElement {
  const cells = pixelCells(rows);
  const canvas = document.createElement('canvas');
  const px = unit * dpr;
  canvas.width = Math.round(cells.width * px);
  canvas.height = Math.round(cells.height * px);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  if (outline) {
    // Under the shape too, so a translucent shade reads as a darker tone, not as the sky.
    ctx.fillStyle = outline;
    for (const [x, y] of [...cells.edge, ...cells.fill]) ctx.fillRect(Math.round(x * px), Math.round(y * px), Math.ceil(px), Math.ceil(px));
  }
  for (const [x, y, c] of cells.fill) {
    ctx.fillStyle = palette[c] ?? palette.f;
    ctx.fillRect(Math.round(x * px), Math.round(y * px), Math.ceil(px), Math.ceil(px));
  }
  return canvas;
}

/** The glyph rows for a short string, set side by side with one empty column between. */
export function textRows(text: string, face: Record<string, string[]> = GLYPHS): string[] {
  const glyphs = [...text].map((c) => face[c]).filter(Boolean);
  return Array.from({ length: glyphs[0]?.length ?? 0 }, (_, y) => glyphs.map((g) => g[y]).join('.'));
}
