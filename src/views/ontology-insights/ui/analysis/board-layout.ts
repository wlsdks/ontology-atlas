export interface CardBox { top: number; bottom: number; left: number; right: number }

export type BoardSide = 'left' | 'right' | 'top' | 'bottom';
export interface BoardEnds { id: string; from: string; to: string }
export interface BoardLine { id: string; x1: number; y1: number; x2: number; y2: number; axis: 'x' | 'y' }

const PORT_GAP = 6;
const PORT_INSET = 6;
const ARROW = 7;

function sides(from: CardBox, to: CardBox): [BoardSide, BoardSide] {
  const sharesRow = to.top < from.bottom && to.bottom > from.top;
  if (!sharesRow) return to.top >= from.bottom ? ['bottom', 'top'] : ['top', 'bottom'];
  return to.left >= from.right ? ['right', 'left'] : ['left', 'right'];
}

const centre = (box: CardBox, axis: 'x' | 'y') => axis === 'x' ? (box.left + box.right) / 2 : (box.top + box.bottom) / 2;

/** One line per declaration between measured boxes; lines sharing a side spread along it, ordered by where their far end sits. O(L log L). */
export function boardLines(links: readonly BoardEnds[], boxes: ReadonlyMap<string, CardBox>): BoardLine[] {
  const placed = links.flatMap(link => {
    const from = boxes.get(link.from), to = boxes.get(link.to);
    return from && to && link.from !== link.to ? [{ link, from, to, sides: sides(from, to) }] : [];
  });
  const groups = new Map<string, { far: number; index: number }[]>();
  placed.forEach((row, index) => {
    for (const end of [0, 1] as const) {
      const side = row.sides[end], spread = side === 'left' || side === 'right' ? 'y' : 'x';
      const key = `${end ? row.link.to : row.link.from}\0${side}`;
      groups.set(key, [...groups.get(key) ?? [], { far: centre(end ? row.from : row.to, spread), index }]);
    }
  });
  for (const group of groups.values()) group.sort((a, b) => a.far - b.far || a.index - b.index);
  const port = (index: number, end: 0 | 1) => {
    const row = placed[index]!, box = end ? row.to : row.from, side = row.sides[end];
    const along = side === 'left' || side === 'right' ? 'y' : 'x';
    const group = groups.get(`${end ? row.link.to : row.link.from}\0${side}`)!;
    const half = (along === 'y' ? box.bottom - box.top : box.right - box.left) / 2 - PORT_INSET;
    const offset = (group.findIndex(entry => entry.index === index) - (group.length - 1) / 2) * PORT_GAP;
    const slide = centre(box, along) + Math.max(-half, Math.min(half, offset));
    const edge = side === 'left' ? box.left : side === 'right' ? box.right : side === 'top' ? box.top : box.bottom;
    return along === 'y' ? { x: edge, y: slide } : { x: slide, y: edge };
  };
  return placed.map((row, index) => {
    const start = port(index, 0), end = port(index, 1);
    return { id: row.link.id, x1: start.x, y1: start.y, x2: end.x, y2: end.y, axis: row.sides[0] === 'left' || row.sides[0] === 'right' ? 'x' : 'y' };
  });
}

const round = (value: number) => Math.round(value * 10) / 10;

export function boardCurve(line: BoardLine) {
  if (line.axis === 'x') {
    const end = line.x2 - Math.sign(line.x2 - line.x1 || 1) * ARROW, bend = (end - line.x1) / 2;
    return `M ${round(line.x1)} ${round(line.y1)} C ${round(line.x1 + bend)} ${round(line.y1)}, ${round(end - bend)} ${round(line.y2)}, ${round(end)} ${round(line.y2)}`;
  }
  const end = line.y2 - Math.sign(line.y2 - line.y1 || 1) * ARROW, bend = (end - line.y1) / 2;
  return `M ${round(line.x1)} ${round(line.y1)} C ${round(line.x1)} ${round(line.y1 + bend)}, ${round(line.x2)} ${round(end - bend)}, ${round(line.x2)} ${round(end)}`;
}

export function boardArrow(line: BoardLine) {
  if (line.axis === 'x') {
    const base = line.x2 - Math.sign(line.x2 - line.x1 || 1) * ARROW;
    return `${round(base)},${round(line.y2 - ARROW / 2)} ${round(line.x2)},${round(line.y2)} ${round(base)},${round(line.y2 + ARROW / 2)}`;
  }
  const base = line.y2 - Math.sign(line.y2 - line.y1 || 1) * ARROW;
  return `${round(line.x2 - ARROW / 2)},${round(base)} ${round(line.x2)},${round(line.y2)} ${round(line.x2 + ARROW / 2)},${round(base)}`;
}
