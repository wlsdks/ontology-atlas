import type { FilmVault } from './film-vault';
import { reachOf } from './film-vault';
import type { FilmMapLayout, Measure } from './film-map-layout';
import { dotOffsets } from './film-map-layout';
import { circleIntoRect, inside, overlaps, quadAt, resample, type Pt, type Rect } from './film-geometry';

export type OpenRole = 'rule' | 'kind' | 'title' | 'domain' | 'elements' | 'dependencies';

export interface OpenLine {
  role: OpenRole;
  key: string | null;
  value: string;
  y: number;
  x: number;
  valueX: number;
  end: number;
}

export interface LeavingLine {
  id: string;
  from: Pt;
  to: Pt;
  named: boolean;
}

export interface OpenLayout {
  panel: Rect;
  radius: number;
  barH: number;
  size: number;
  font: string;
  dir: string;
  file: string;
  headerY: number;
  headerX: number;
  dirW: number;
  lines: OpenLine[];
  lineH: number;
  zoom: number;
  pick: Pt;
  pickR0: number;
  pickR1: number;
  domain: Pt;
  domainR: number;
  dots: Pt[];
  dotR: number;
  ownNeeds: number[];
  leaving: LeavingLine[];
  /** The named end of one leaving line and where its name goes; null `label` where no clear spot exists, so the mark stands unnamed. */
  namedEnd: { id: string; at: Pt; r: number; label: Pt | null; align: 'left' | 'right' | 'center'; font: string; size: number } | null;
  pickName: { x: number; y: number; font: string; size: number };
  domainName: { x: number; y: number; font: string; size: number };
  light: { x: number; y: number; r: number };
  fadePx: number;
}

export interface OpenInput {
  vault: FilmVault;
  pick: string;
  map: FilmMapLayout;
  locale: string;
  columnLeft: number;
  measure: Measure;
  sans: string;
  mono: string;
}

function fitList(items: string[], room: number, measure: (t: string) => number, counted: boolean): string {
  const full = `[${items.join(', ')}]`;
  if (measure(full) <= room) return full;
  for (let k = items.length - 1; k >= 1; k -= 1) {
    const text = counted ? `[${items.slice(0, k).join(', ')}, … +${items.length - k}]` : `[${items.slice(0, k).join(', ')}, …]`;
    if (measure(text) <= room) return text;
  }
  const tail = counted ? `, … +${items.length - 1}]` : '…]';
  let head = `[${items.join(', ')}`;
  while (head.length > 2 && measure(`${head}${counted ? '…' : ''}${tail}`) > room) head = head.slice(0, -1);
  return counted ? `${head}…${tail}` : `${head}${tail}`;
}

const isLocalised = (label: string) => [...label].some((ch) => ch.charCodeAt(0) > 0x7f);

export function layoutOpen(input: OpenInput): OpenLayout {
  const { vault, pick, map, locale, measure, sans, mono } = input;
  const S = map.sizes;
  const { w, captionBox, titleBox } = map;
  const node = vault.byId.get(pick)!;
  const domainNode = node.domain ? vault.byId.get(node.domain)! : null;
  const size = S.wide ? (w >= 1600 ? 17 : 15) : 13;
  const font = `400 ${size}px ${mono}`;
  const lineH = Math.round(size * 1.75);
  const width = S.wide ? Math.min(700 * S.s, w * 0.42) : w - 32;
  const left = S.wide ? Math.max(S.safe, input.columnLeft) : 16;
  const top = S.wide ? titleBox.b - 16 + 56 : titleBox.b - 4;
  const barH = S.wide ? 46 : 38;
  const padX = S.wide ? 22 : 18;

  const titleKey = locale === 'en' || !isLocalised(node.label) ? 'title' : `display_${locale}`;
  const reach = reachOf(vault, pick);
  const ref = (id: string) => vault.byId.get(id)!.path.replace(/\.md$/, '');
  const m = (t: string) => measure(t, font);
  const room = (key: string) => width - padX * 2 - m(`${key}: `);
  const rows: { role: OpenRole; key: string | null; value: string }[] = [
    { role: 'rule', key: null, value: '---' },
    { role: 'kind', key: 'kind', value: node.kind },
    { role: 'title', key: titleKey, value: node.label },
    { role: 'domain', key: 'domain', value: domainNode ? ref(domainNode.id) : '' },
    { role: 'elements', key: 'elements', value: fitList(node.elements.map(ref), room('elements'), m, false) },
    { role: 'dependencies', key: 'dependencies', value: fitList(reach.needs.map(ref), room('dependencies'), m, true) },
    { role: 'rule', key: null, value: '---' },
  ];
  const bodyTop = top + barH + (S.wide ? 18 : 12);
  const lines: OpenLine[] = rows.map((row, i) => {
    const x = left + padX;
    const y = bodyTop + i * lineH + lineH / 2;
    const valueX = row.key ? x + m(`${row.key}: `) : x;
    return { ...row, x, y, valueX, end: valueX + m(row.value) };
  });
  const panel: Rect = { l: left, t: top, r: left + width, b: bodyTop + rows.length * lineH + (S.wide ? 18 : 10) };

  const dir = S.wide ? `docs/ontology/${node.path.slice(0, node.path.lastIndexOf('/') + 1)}` : `…/${node.path.slice(0, node.path.lastIndexOf('/') + 1)}`;
  const file = node.path.slice(node.path.lastIndexOf('/') + 1);

  const zoom = S.wide ? 1.5 : 1.25;
  const free: Rect = S.wide
    ? { l: panel.r + 40, r: w - S.safe, t: titleBox.b, b: captionBox.t }
    : { l: 16, r: w - 16, t: panel.b + 12, b: captionBox.t - 8 };
  const pickAt = { x: free.l + (free.r - free.l) * (S.wide ? 0.44 : 0.52), y: free.t + (free.b - free.t) * (S.wide ? 0.52 : 0.56) };
  const pickR0 = map.capRadius(0) * zoom;
  const pickR1 = map.capRadius(node.elements.length) * zoom;
  const domainAt = S.wide ? { x: pickAt.x - 170 * S.s, y: pickAt.y - 150 * S.s } : { x: pickAt.x - 92, y: pickAt.y - 84 };
  const domainR = S.domainR * zoom;
  const away = Math.atan2(pickAt.y - domainAt.y, pickAt.x - domainAt.x);
  const dotR = S.elemR * zoom;
  const dots = dotOffsets(node.elements.length, away, pickR1, { ...S, elemGap: S.elemGap * zoom, elemAlt: S.elemAlt * zoom }).map((o) => ({
    x: pickAt.x + o.x,
    y: pickAt.y + o.y,
  }));
  const ownNeeds = reach.ownNeeds.map((e) => node.elements.indexOf(e)).filter((k) => k >= 0);

  const own = new Set(node.elements);
  const here = map.marks.get(pick);
  const far = reach.needs
    .filter((e) => !own.has(e) && map.marks.has(e))
    .map((e) => {
      const q = map.marks.get(e)!;
      return { id: e, a: here ? Math.atan2(q.y - here.y, q.x - here.x) : 0 };
    })
    .sort((a, b) => a.a - b.a);
  const base = S.wide ? 0.35 : 0.5;
  const step = S.wide ? 0.34 : 0.4;
  const inner: Rect = { l: free.l + 48, r: Math.min(free.r, w - S.safe) - 48, t: Math.max(free.t, titleBox.b) + 48, b: captionBox.t - 48 };
  const fanned = far.map((f, i) => ({ ...f, dir: base + (i - (far.length - 1) / 2) * step }));
  const namedIndex = fanned.length ? fanned.reduce((best, f, i) => (Math.abs(f.dir) < Math.abs(fanned[best]!.dir) ? i : best), 0) : -1;
  const reachToBox = (a: number) => {
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const tx = dx > 0 ? (inner.r - pickAt.x) / dx : dx < 0 ? (inner.l - pickAt.x) / dx : Infinity;
    const ty = dy > 0 ? (inner.b - pickAt.y) / dy : dy < 0 ? (inner.t - pickAt.y) / dy : Infinity;
    return Math.max(pickR1 + 40, Math.min(tx, ty));
  };
  const endFontSize = S.wide ? Math.max(15, Math.round(17 * S.s)) : 13;
  const endFont = `510 ${endFontSize}px ${sans}`;
  let namedEnd: OpenLayout['namedEnd'] = null;
  const leaving: LeavingLine[] = fanned.map((f, i) => {
    const named = i === namedIndex;
    const len = named ? (S.wide ? 300 * S.s : 120) : reachToBox(f.dir);
    const from = { x: pickAt.x + Math.cos(f.dir) * (pickR1 + 6), y: pickAt.y + Math.sin(f.dir) * (pickR1 + 6) };
    const to = { x: pickAt.x + Math.cos(f.dir) * len, y: pickAt.y + Math.sin(f.dir) * len };
    if (named) {
      const target = vault.byId.get(f.id)!;
      const r = target.kind === 'capability' ? map.capRadius(target.elements.length) * zoom * 0.8 : S.elemR * zoom;
      const at = { x: to.x + Math.cos(f.dir) * (r + 5), y: to.y + Math.sin(f.dir) * (r + 5) };
      namedEnd = { id: f.id, at, r, label: null, align: 'left', font: endFont, size: endFontSize };
    }
    return { id: f.id, from, to, named };
  });

  const pickNameSize = S.wide ? Math.round(26 * S.s) : 15;
  const domainNameSize = S.wide ? Math.round(30 * S.s) : 16;
  const pickName = { x: pickAt.x, y: pickAt.y - pickR1 - (S.wide ? 30 : 20), font: `650 ${pickNameSize}px ${sans}`, size: pickNameSize };
  const domainName = { x: domainAt.x, y: domainAt.y + domainR + 10 + domainNameSize * 0.6, font: `650 ${domainNameSize}px ${sans}`, size: domainNameSize };

  if (namedEnd) {
    const E: NonNullable<OpenLayout['namedEnd']> = namedEnd;
    const textW = measure(vault.byId.get(E.id)!.label, E.font);
    const textH = E.size * 1.24;
    const textBox = (name: string, font: string, x: number, y: number, size: number, centred: boolean): Rect => {
      const tw = measure(name, font);
      const l = centred ? x - tw / 2 : x;
      return { l, t: y - size * 0.62, r: l + tw, b: y + size * 0.62 };
    };
    const blocks = [
      panel,
      captionBox,
      titleBox,
      textBox(node.label, pickName.font, pickName.x, pickName.y, pickName.size, false),
      ...(domainNode ? [textBox(domainNode.label, domainName.font, domainName.x, domainName.y, domainName.size, true)] : []),
    ];
    const half = (S.wide ? 4.2 : 2.8) / 2 + 6;
    const rowsShown = lines.filter((l) => l.role !== 'rule');
    const deps = rowsShown[4];
    const first = leaving[0];
    const hair: Pt[] = [];
    if (deps && first) {
      const from = { x: Math.min(panel.r - 8, deps.end + 12), y: deps.y };
      const to = { x: first.from.x + (first.to.x - first.from.x) * 0.25, y: first.from.y + (first.to.y - first.from.y) * 0.25 + 8 };
      const c = { x: from.x + (to.x - from.x) * 0.5, y: from.y };
      for (let i = 0; i <= 32; i += 1) hair.push(quadAt(from, c, to, i / 32));
    }
    const samples = [...leaving.filter((l) => !l.named).flatMap((l) => resample([l.from, l.to], 3)), ...resample(hair, 3)];
    const own = leaving.find((l) => l.named);
    const ownSamples = own ? resample([own.from, own.to], 3) : [];
    const clear = (box: Rect) => {
      const padded = { l: box.l - 4, t: box.t - 4, r: box.r + 4, b: box.b + 4 };
      if (padded.l < S.safe || padded.r > w - S.safe || padded.t < S.safe) return false;
      if (blocks.some((b) => overlaps(padded, b))) return false;
      if (circleIntoRect(pickAt, pickR1 + 4, padded) > 0 || circleIntoRect(domainAt, domainR + 4, padded) > 0) return false;
      if (dots.some((d) => circleIntoRect(d, dotR + 3, padded) > 0)) return false;
      const wide = { l: padded.l - half, t: padded.t - half, r: padded.r + half, b: padded.b + half };
      return !samples.some((p) => inside(p, wide)) && !ownSamples.some((p) => inside(p, padded));
    };
    const at = E.at;
    const spots: { label: Pt; align: 'left' | 'right' | 'center'; box: Rect }[] = [
      { label: { x: at.x + E.r + 9, y: at.y }, align: 'left', box: { l: at.x + E.r + 9, t: at.y - textH / 2, r: at.x + E.r + 9 + textW, b: at.y + textH / 2 } },
      {
        label: { x: at.x, y: at.y - E.r - 8 - E.size * 0.6 },
        align: 'center',
        box: { l: at.x - textW / 2, t: at.y - E.r - 8 - textH, r: at.x + textW / 2, b: at.y - E.r - 8 },
      },
      {
        label: { x: at.x, y: at.y + E.r + 8 + E.size * 0.6 },
        align: 'center',
        box: { l: at.x - textW / 2, t: at.y + E.r + 8, r: at.x + textW / 2, b: at.y + E.r + 8 + textH },
      },
    ];
    const spot = spots.find((c) => clear(c.box));
    if (spot) namedEnd = { ...E, label: spot.label, align: spot.align };
  }

  return {
    panel,
    radius: 12,
    barH,
    size,
    font,
    dir,
    file,
    headerY: top + barH / 2,
    headerX: left + (S.wide ? 20 : 16),
    dirW: measure(dir, `400 ${S.wide ? 15 : 13}px ${mono}`),
    lines,
    lineH,
    zoom,
    pick: pickAt,
    pickR0,
    pickR1,
    domain: domainAt,
    domainR,
    dots,
    dotR,
    ownNeeds,
    leaving,
    namedEnd,
    pickName,
    domainName,
    light: { x: domainAt.x, y: domainAt.y, r: S.wide ? 430 * S.s : 230 },
    fadePx: 60,
  };
}
