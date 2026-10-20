export interface CardBox { top: number; bottom: number; left: number; right: number }

export type BoardSide = 'left' | 'right' | 'top' | 'bottom';
export interface BoardVia { x: number; enter: number; exit: number }
export interface BoardEnds { id: string; from: string; to: string; via?: readonly BoardVia[] }
export interface BoardLine { id: string; x1: number; y1: number; x2: number; y2: number; axis: 'x' | 'y'; via: readonly BoardVia[] }

const PORT_GAP = 14;
const PORT_INSET = 6;
const ARROW = 7;

function sides(from: CardBox, to: CardBox): [BoardSide, BoardSide] {
  const sharesRow = to.top < from.bottom && to.bottom > from.top;
  if (!sharesRow) return to.top >= from.bottom ? ['bottom', 'top'] : ['top', 'bottom'];
  return to.left >= from.right ? ['right', 'left'] : ['left', 'right'];
}

const centre = (box: CardBox, axis: 'x' | 'y') => axis === 'x' ? (box.left + box.right) / 2 : (box.top + box.bottom) / 2;

// O(L log L)
export function boardLines(links: readonly BoardEnds[], boxes: ReadonlyMap<string, CardBox>): BoardLine[] {
  const placed = links.flatMap(link => {
    const from = boxes.get(link.from), to = boxes.get(link.to);
    return from && to && link.from !== link.to ? [{ link, from, to, sides: sides(from, to) }] : [];
  });
  const groups = new Map<string, { far: number; index: number; end: 0 | 1 }[]>();
  placed.forEach((row, index) => {
    for (const end of [0, 1] as const) {
      const side = row.sides[end], spread = side === 'left' || side === 'right' ? 'y' : 'x';
      const key = `${end ? row.link.to : row.link.from}\0${side}`;
      const group = groups.get(key) ?? [];
      const via = spread === 'x' ? (end ? row.link.via?.at(-1) : row.link.via?.[0]) : undefined;
      group.push({ far: via?.x ?? centre(end ? row.from : row.to, spread), index, end });
      groups.set(key, group);
    }
  });
  const slots = placed.map(() => [0, 0]);
  for (const group of groups.values()) {
    const seats = ([0, 1] as const).flatMap(end => {
      const entries = group.filter(entry => entry.end === end);
      return entries.length ? [{ far: entries.reduce((sum, entry) => sum + entry.far, 0) / entries.length, index: entries[0]!.index, entries }] : [];
    });
    seats.sort((a, b) => a.far - b.far || a.index - b.index);
    seats.forEach((seat, rank) => { for (const entry of seat.entries) slots[entry.index]![entry.end] = rank - (seats.length - 1) / 2; });
  }
  const port = (index: number, end: 0 | 1) => {
    const row = placed[index]!, box = end ? row.to : row.from, side = row.sides[end];
    const along = side === 'left' || side === 'right' ? 'y' : 'x';
    const half = (along === 'y' ? box.bottom - box.top : box.right - box.left) / 2 - PORT_INSET;
    const offset = slots[index]![end]! * PORT_GAP;
    const slide = centre(box, along) + Math.max(-half, Math.min(half, offset));
    const edge = side === 'left' ? box.left : side === 'right' ? box.right : side === 'top' ? box.top : box.bottom;
    return along === 'y' ? { x: edge, y: slide } : { x: slide, y: edge };
  };
  return placed.map((row, index) => {
    const start = port(index, 0), end = port(index, 1);
    const axis = row.sides[0] === 'left' || row.sides[0] === 'right' ? 'x' : 'y';
    return { id: row.link.id, x1: start.x, y1: start.y, x2: end.x, y2: end.y, axis, via: axis === 'y' ? row.link.via ?? [] : [] };
  });
}

const round = (value: number) => Math.round(value * 10) / 10;
const CUTOUT_REACH = 1e5;

export function boardCutout(holes: readonly CardBox[]) {
  const outline = (box: CardBox) => `M ${round(box.left)} ${round(box.top)} H ${round(box.right)} V ${round(box.bottom)} H ${round(box.left)} Z`;
  return [outline({ left: -CUTOUT_REACH, top: -CUTOUT_REACH, right: CUTOUT_REACH, bottom: CUTOUT_REACH }), ...holes.map(outline)].join(' ');
}

export function boardCurve(line: BoardLine) {
  if (line.axis === 'x') {
    const end = line.x2 - Math.sign(line.x2 - line.x1 || 1) * ARROW, bend = (end - line.x1) / 2;
    return `M ${round(line.x1)} ${round(line.y1)} C ${round(line.x1 + bend)} ${round(line.y1)}, ${round(end - bend)} ${round(line.y2)}, ${round(end)} ${round(line.y2)}`;
  }
  const end = line.y2 - Math.sign(line.y2 - line.y1 || 1) * ARROW;
  const stops = [...line.via.flatMap(via => [{ x: via.x, y: via.enter, pass: false }, { x: via.x, y: via.exit, pass: true }]), { x: line.x2, y: end, pass: false }];
  let from = { x: line.x1, y: line.y1 }, d = `M ${round(from.x)} ${round(from.y)}`;
  for (const stop of stops) {
    const bend = (from.y + stop.y) / 2;
    d += stop.pass ? ` L ${round(stop.x)} ${round(stop.y)}` : ` C ${round(from.x)} ${round(bend)}, ${round(stop.x)} ${round(bend)}, ${round(stop.x)} ${round(stop.y)}`;
    from = stop;
  }
  return d;
}

export function boardArrow(line: BoardLine) {
  if (line.axis === 'x') {
    const base = line.x2 - Math.sign(line.x2 - line.x1 || 1) * ARROW;
    return `${round(base)},${round(line.y2 - ARROW / 2)} ${round(line.x2)},${round(line.y2)} ${round(base)},${round(line.y2 + ARROW / 2)}`;
  }
  const base = line.y2 - Math.sign(line.y2 - line.y1 || 1) * ARROW;
  return `${round(line.x2 - ARROW / 2)},${round(base)} ${round(line.x2)},${round(line.y2)} ${round(line.x2 + ARROW / 2)},${round(base)}`;
}
