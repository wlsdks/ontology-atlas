/**
 * The harness film's cast and stage geometry, laid out from `harness-facts.json` (this repository's
 * real instruction files, hooks and checks). Every object keeps one identity across the four acts:
 * an instruction file is a column row, then a mark in the first strip; a gate hook is a plate, then
 * a mark in the second; a check is a cell, then a mark in the third.
 */

export type InstructionKind = 'instructions' | 'rules' | 'skill' | 'agent';
export type CheckGroup = 'scripts' | 'gitHooks' | 'workflows';

export interface HarnessFacts {
  instructions: ReadonlyArray<{ path: string; kind: string }>;
  hooks: ReadonlyArray<{ name: string; config: string; events: string; step: string }>;
  checks: { scripts: readonly string[]; gitHooks: readonly string[]; workflows: readonly string[] };
  /** The Bash PreToolUse hooks every command below was run through, in their configured order. */
  gate: readonly string[];
  commands: ReadonlyArray<{ command: string; blockedBy: string | null }>;
}

export interface HarnessScene {
  /** Instruction files by kind, in the order the columns stand. */
  columns: Array<{ kind: InstructionKind; paths: string[] }>;
  gate: string[];
  /** `lane` is the gate plate that denies the command, or -1 when every hook lets it through. */
  commands: Array<{ command: string; lane: number }>;
  /** For each hook, the gate plate it was in the hook act, or -1. */
  hookPlates: number[];
  bands: Array<{ group: CheckGroup; names: string[] }>;
  counts: { instructions: number; hooks: number; checks: number };
}

export const COLUMN_KINDS: readonly InstructionKind[] = ['instructions', 'rules', 'skill', 'agent'];
const BAND_GROUPS: readonly CheckGroup[] = ['scripts', 'gitHooks', 'workflows'];
/** Paths a column names before its files turn into blank slabs. */
export const NAMED_PER_COLUMN = 3;

function kindOf(kind: string): InstructionKind {
  return kind === 'rules' || kind === 'skill' || kind === 'agent' ? kind : 'instructions';
}

export function buildHarnessScene(facts: HarnessFacts): HarnessScene {
  const columns = COLUMN_KINDS.map((kind) => ({
    kind,
    paths: facts.instructions.filter((entry) => kindOf(entry.kind) === kind).map((entry) => entry.path),
  }));
  const gate = [...facts.gate];
  const commands = facts.commands.map((entry) => ({
    command: entry.command,
    lane: entry.blockedBy === null ? -1 : gate.indexOf(entry.blockedBy),
  }));
  /* Each plate becomes the first hook of its name, the one the Claude settings run. */
  const claimed = new Set<number>();
  const hookPlates = facts.hooks.map((hook) => {
    const plate = gate.indexOf(hook.name);
    if (plate < 0 || claimed.has(plate)) return -1;
    claimed.add(plate);
    return plate;
  });
  const bands = BAND_GROUPS.map((group) => ({ group, names: [...facts.checks[group]] }));
  return {
    columns,
    gate,
    commands,
    hookPlates,
    bands,
    counts: {
      instructions: facts.instructions.length,
      hooks: facts.hooks.length,
      checks: bands.reduce((sum, band) => sum + band.names.length, 0),
    },
  };
}

/** How a check is called: the command a person types, or the file that runs it. */
export function checkCall(group: CheckGroup, name: string): string {
  if (group === 'scripts') return `pnpm ${name}`;
  if (group === 'gitHooks') return `.githooks/${name}`;
  return `.github/workflows/${name}`;
}

/**
 * The path itself when it fits, otherwise its longest tail of whole segments that does; a file name
 * that alone is too wide keeps its start and ends in an ellipsis.
 */
export function fitPath(path: string, room: number, width: (text: string) => number): string {
  const parts = path.split('/');
  for (let k = 0; k < parts.length; k += 1) {
    const tail = parts.slice(k).join('/');
    if (width(tail) <= room) return tail;
  }
  const name = parts[parts.length - 1]!;
  for (let n = name.length - 1; n > 0; n -= 1) {
    if (width(`${name.slice(0, n)}…`) <= room) return `${name.slice(0, n)}…`;
  }
  return '…';
}

export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The part of the stage the film draws in: under the film's title, above the caption. */
export function pictureZone(w: number, h: number, origin: number): Box {
  /* The picture keeps the page column; only a column too narrow for four lists lets it run wider. */
  const left = w - 2 * origin >= 600 ? origin : Math.max(32, (w - 960) / 2);
  /* A shorter stage has a shorter caption gap: 300px under the picture at 900px tall, 220px at 720. */
  const caption = Math.min(300, Math.max(220, 220 + ((h - 720) * 80) / 180));
  return { left, right: w - left, top: 128, bottom: Math.max(128 + 240, h - caption) };
}

export const TYPE = { label: 15, count: 34, command: 28, readout: 22 } as const;
const PLATE_H = 44;
const PLATE_GAP = 16;
const SLAB_H = 10;
const SLAB_PITCH = 16;

export interface HarnessLayout {
  zone: Box;
  columns: Array<{ x: number; width: number; nameY: number; countY: number }>;
  /** Every instruction file in column order, then path order. */
  files: Array<{ column: number; row: number; rect: Rect; text: string | null }>;
  plates: Rect[];
  command: { x: number; y: number };
  /** `slot` is the cell's mark in the third strip. */
  cells: Array<{ band: number; name: string; rect: Rect; slot: number }>;
  bandLabels: Array<{ x: number; y: number }>;
  readoutY: number;
  strips: Array<{ parked: Rect[]; merged: Rect[]; whole: Rect[] }>;
}

/** Where every object stands in each act, for a stage whose picture zone is `zone`. */
export function layoutHarness(
  scene: HarnessScene,
  zone: Box,
  measure: (text: string, px: number) => number,
): HarnessLayout {
  const zw = zone.right - zone.left;
  const zh = zone.bottom - zone.top;

  /* Act one: four columns, a header, three named paths, then one blank slab per further file. */
  const colGap = 32;
  const colW = (zw - colGap * (COLUMN_KINDS.length - 1)) / COLUMN_KINDS.length;
  const columns = scene.columns.map((_, c) => ({
    x: zone.left + c * (colW + colGap),
    width: colW,
    nameY: zone.top + 16,
    countY: zone.top + 58,
  }));
  const pathY = (row: number) => zone.top + 92 + row * 26;
  const slabTop = zone.top + 166;
  const rest = Math.max(1, ...scene.columns.map((column) => column.paths.length - NAMED_PER_COLUMN));
  const fitRows = Math.max(3, Math.floor((zone.bottom - slabTop) / SLAB_PITCH));
  const perRow = Math.ceil(rest / fitRows);
  const slabCell = colW / perRow;
  const files: HarnessLayout['files'] = [];
  scene.columns.forEach((column, c) => {
    const x = columns[c]!.x;
    /* A column's named paths drop the same leading folders, so they line up as one list. */
    const named = column.paths.slice(0, NAMED_PER_COLUMN);
    const drop = Math.max(0, ...named.map((path) => path.split('/').length - fitPath(path, colW, (t) => measure(t, TYPE.label)).split('/').length));
    column.paths.forEach((path, row) => {
      if (row < NAMED_PER_COLUMN) {
        const text = fitPath(path.split('/').slice(Math.min(drop, path.split('/').length - 1)).join('/'), colW, (t) => measure(t, TYPE.label));
        const y = pathY(row);
        files.push({ column: c, row, text, rect: { x, y: y - 11, w: measure(text, TYPE.label), h: 15 } });
        return;
      }
      const k = row - NAMED_PER_COLUMN;
      const share = 0.45 + 0.45 * spread(path);
      files.push({
        column: c,
        row,
        text: null,
        rect: { x: x + (k % perRow) * slabCell, y: slabTop + Math.floor(k / perRow) * SLAB_PITCH, w: (slabCell - 8) * share, h: SLAB_H },
      });
    });
  });

  /* Act two: the command line on the left, the gate's plates standing on the right. */
  const command = { x: zone.left, y: zone.top + zh * 0.56 };
  const longest = Math.max(0, ...scene.gate.map((name) => measure(name, TYPE.label)));
  const plateW = Math.min(360, Math.max(longest + 72, zw * 0.34));
  const plates = scene.gate.map((_, k) => ({
    x: zone.right - plateW,
    y: command.y - PLATE_H / 2 + (k - (scene.gate.length - 1) / 2) * (PLATE_H + PLATE_GAP),
    w: plateW,
    h: PLATE_H,
  }));

  /*
   * The strips: one mark per thing, the widest strip spanning the picture. They wait in a thin line
   * at the top of the picture (`parked`), meet in a stack just above the checks' first row
   * (`merged`), then the stack settles in the middle (`whole`). Parked above the checks, the first
   * two never cross a cell on their way into the stack.
   */
  const counts = [scene.counts.instructions, scene.counts.hooks, scene.counts.checks];
  const markPitch = Math.min(18, zw / Math.max(...counts));
  const markW = Math.max(3, markPitch - 4);

  /* Act three: one band per kind of check, 32 cells to a row, under where the stack meets. */
  const perLine = 32;
  const pitch = Math.min(32.5, zw / perLine);
  const bandRows = scene.bands.map((band) => Math.max(1, Math.ceil(band.names.length / perLine)));
  const nominal = { size: 20, rowGap: 10, label: 28, bandGap: 22, readout: 52, strip: 40, stripGap: 24, park: 24 };
  const need = (m: typeof nominal) =>
    m.park + 2 * (m.strip + m.stripGap) + (m.strip - m.size) / 2 +
    bandRows.reduce((sum, rows) => sum + m.label + rows * (m.size + m.rowGap) + m.bandGap, 0) - m.bandGap - m.rowGap + m.readout;
  /* A short stage shrinks the spacing, never the type. */
  const squeeze = Math.min(1, zh / need(nominal));
  const m = {
    size: Math.min(pitch - 8, nominal.size * squeeze),
    rowGap: nominal.rowGap * squeeze,
    label: Math.max(22, nominal.label * squeeze),
    bandGap: nominal.bandGap * squeeze,
    readout: Math.max(36, nominal.readout * squeeze),
    strip: Math.max(16, nominal.strip * squeeze),
    stripGap: nominal.stripGap * squeeze,
    park: nominal.park * squeeze,
  };
  const mergeTop = zone.top + m.park;
  const firstRow = mergeTop + 2 * (m.strip + m.stripGap) + (m.strip - m.size) / 2;
  let y = firstRow - m.label;
  const cells: HarnessLayout['cells'] = [];
  const bandLabels: HarnessLayout['bandLabels'] = [];
  let slot = 0;
  scene.bands.forEach((band, b) => {
    bandLabels.push({ x: zone.left, y: y + 15 });
    y += m.label;
    const rows = bandRows[b]!;
    band.names.forEach((name, k) => {
      const row = Math.floor(k / perLine);
      const column = k % perLine;
      cells.push({
        band: b,
        name: checkCall(band.group, name),
        rect: { x: zone.left + column * pitch, y: y + row * (m.size + m.rowGap), w: m.size, h: m.size },
        /* Rows zip together column by column, so no cell crosses another on its way into the strip. */
        slot: slot + column * rows + row,
      });
    });
    slot += band.names.length;
    y += rows * (m.size + m.rowGap) - m.rowGap + m.bandGap;
  });
  const readoutY = y - m.bandGap + m.readout - 10;

  const stackH = 3 * m.strip + 2 * m.stripGap;
  const wholeTop = Math.max(mergeTop, zone.top + (zh - stackH) / 2);
  const row = (count: number, top: number, h: number) =>
    Array.from({ length: count }, (_, i) => ({ x: zone.left + i * markPitch, y: top, w: markW, h }));
  const strips = counts.map((count, s) => ({
    parked: row(count, zone.top + s * 9, 4),
    merged: row(count, mergeTop + s * (m.strip + m.stripGap), m.strip),
    whole: row(count, wholeTop + s * (m.strip + m.stripGap), m.strip),
  }));

  return { zone, columns, files, plates, command, cells, bandLabels, readoutY, strips };
}

/** A stable 0..1 per name, so a slab keeps its length from frame to frame. */
function spread(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}
