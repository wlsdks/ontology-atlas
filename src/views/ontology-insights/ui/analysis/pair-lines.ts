export interface CardBox { top: number; bottom: number; left: number; right: number }
export interface PairEnds { id: string; from: string; to: string }
export interface PairLine { id: string; x1: number; y1: number; x2: number; y2: number }

const ARROW_PX = 7;
const PORT_INSET_PX = 8;
const centre = (box: CardBox) => (box.top + box.bottom) / 2;

// O(L log L)
export function pairLines(links: readonly PairEnds[], boxes: ReadonlyMap<string, CardBox>): PairLine[] {
  const placed = links.flatMap(link => {
    const from = boxes.get(link.from), to = boxes.get(link.to);
    return from && to ? [{ link, from, to }] : [];
  });
  const ports = (near: 'from' | 'to', far: 'from' | 'to') => {
    const sharing = new Map<string, typeof placed>();
    for (const row of placed) {
      const rows = sharing.get(row.link[near]);
      if (rows) rows.push(row); else sharing.set(row.link[near], [row]);
    }
    const y = new Map<string, number>();
    for (const rows of sharing.values()) {
      rows.sort((a, b) => centre(a[far]) - centre(b[far]) || a.link.id.localeCompare(b.link.id, 'en'));
      const box = rows[0]![near], span = box.bottom - box.top - 2 * PORT_INSET_PX;
      rows.forEach((row, index) => y.set(row.link.id, box.top + PORT_INSET_PX + span * (index + 1) / (rows.length + 1)));
    }
    return y;
  };
  const leaving = ports('from', 'to'), arriving = ports('to', 'from');
  return placed.map(({ link, from, to }) => ({ id: link.id, x1: from.right, y1: leaving.get(link.id)!, x2: to.left, y2: arriving.get(link.id)! }));
}

const round = (value: number) => Math.round(value * 10) / 10;

export function pairCurve(line: PairLine) {
  const end = line.x2 - ARROW_PX, bend = (end - line.x1) / 2;
  return `M ${round(line.x1)} ${round(line.y1)} C ${round(line.x1 + bend)} ${round(line.y1)}, ${round(end - bend)} ${round(line.y2)}, ${round(end)} ${round(line.y2)}`;
}

export function pairArrow(line: PairLine) {
  const base = line.x2 - ARROW_PX;
  return `${round(base)},${round(line.y2 - ARROW_PX / 2)} ${round(line.x2)},${round(line.y2)} ${round(base)},${round(line.y2 + ARROW_PX / 2)}`;
}
