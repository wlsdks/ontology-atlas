/**
 * The harness film's cast and stage geometry, laid out from `harness-facts.json` (this repository's
 * real instruction files, hooks and checks). Every object keeps one identity across the four acts:
 * an instruction file is a card in a stack, then a mark in the first strip; a gate hook is a plate,
 * then a mark in the second; a check is a cell, then a piece of the third underline.
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
  /** Instruction files by kind, in the order the stacks stand. */
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
  /* The picture keeps the page column; a column too narrow for four stacks of file names lets it run
     wider, up to 960px. */
  const left = w - 2 * origin >= 800 ? origin : Math.max(32, Math.min(origin, (w - 960) / 2));
  /* A shorter stage has a shorter caption gap: 300px under the picture at 900px tall, 220px at 720. */
  const caption = Math.min(300, Math.max(220, 220 + ((h - 720) * 80) / 180));
  return { left, right: w - left, top: 128, bottom: Math.max(128 + 240, h - caption) };
}

/** Canvas type sizes; nothing the film writes is under 15px. */
export const TYPE = { label: 18, count: 56, card: 18, command: 44, plate: 18, readout: 30, ghost: 120 } as const;
const TYPE_FLOOR = 15;
const CARD_H = 52;
/** How far each card in a stack sits below the one under it. */
const CARD_STEP = 6;
const PLATE_H = 56;
const PLATE_GAP = 12;
/** The parked strips' band at the top of the picture: three thin rows of marks. */
const STRIP_ROW = 8;
const STRIP_RESERVE = 2 * STRIP_ROW + 16;

export interface HarnessLayout {
  zone: Box;
  /** Act one: a stack per kind, its cards bottom first, so the column's first path ends on top. */
  stacks: Array<{
    x: number;
    width: number;
    labelY: number;
    countY: number;
    cards: Array<{ rect: Rect; text: string; path: string }>;
  }>;
  /** The reading line's vertical span in act one. */
  read: { top: number; bottom: number };
  /** Act two: the command line's left edge and middle, at `px`. */
  command: { x: number; y: number; px: number };
  plates: Rect[];
  plateTextPx: number;
  /** Act three: `slot` is the cell's piece in the third underline. */
  cells: Array<{ band: number; column: number; row: number; name: string; rect: Rect; slot: number }>;
  bands: Array<{ labelX: number; labelY: number; top: number; bottom: number; left: number; right: number }>;
  readoutY: number;
  /** Where each strip's marks wait at the top of the picture from the act after theirs. */
  strips: Rect[][];
}

/** Where every object stands in each act, for a stage whose picture zone is `zone`. */
export function layoutHarness(
  scene: HarnessScene,
  zone: Box,
  measure: (text: string, px: number) => number,
): HarnessLayout {
  const zw = zone.right - zone.left;
  const top = zone.top + STRIP_RESERVE;
  const zh = zone.bottom - top;

  /* Act one: four stacks under a name and a count, centred in the picture's height. */
  const colGap = 32;
  const colW = (zw - colGap * (COLUMN_KINDS.length - 1)) / COLUMN_KINDS.length;
  const tallest = Math.max(1, ...scene.columns.map((column) => column.paths.length));
  const headH = 96;
  const stackBlock = headH + (tallest - 1) * CARD_STEP + CARD_H;
  const stackTop = top + Math.max(0, (zh - stackBlock) / 2);
  const room = colW - 28;
  const stacks: HarnessLayout['stacks'] = scene.columns.map((column, c) => {
    const x = zone.left + c * (colW + colGap);
    /* The column's first path lands last, on top, where its name stays readable. */
    const order = [...column.paths].reverse();
    return {
      x,
      width: colW,
      labelY: stackTop + 16,
      countY: stackTop + 76,
      cards: order.map((path, i) => ({
        path,
        text: fitPath(path, room, (t) => measure(t, TYPE.card)),
        rect: { x, y: stackTop + headH + i * CARD_STEP, w: colW, h: CARD_H },
      })),
    };
  });
  const read = { top: stackTop - 8, bottom: stackTop + stackBlock + 8 };

  /* Act two: the gate's plates stacked at the right, the command line level with the middle one. */
  const longest = Math.max(0, ...scene.gate.map((name) => measure(name, TYPE.plate)));
  const plateW = Math.min(380, Math.max(longest + 72, zw * 0.34));
  const plateBlock = scene.gate.length * PLATE_H + (scene.gate.length - 1) * PLATE_GAP;
  const plateTop = top + (zh - plateBlock) / 2 + 24;
  const plates = scene.gate.map((_, k) => ({
    x: zone.right - plateW,
    y: plateTop + k * (PLATE_H + PLATE_GAP),
    w: plateW,
    h: PLATE_H,
  }));
  const plateTextPx = Math.max(TYPE_FLOOR, Math.min(TYPE.plate, (TYPE.plate * (plateW - 72)) / Math.max(1, longest)));
  /* The longest command and its caret stay clear of the plates; a narrow stage sets it smaller. */
  const widest = Math.max(1, ...scene.commands.map((command) => measure(`$ ${command.command}`, TYPE.command)));
  const commandRoom = zw - plateW - 72;
  const commandPx = Math.max(24, Math.min(TYPE.command, (TYPE.command * commandRoom) / widest));
  const middle = plates[Math.floor((plates.length - 1) / 2)]!;
  const command = { x: zone.left, y: middle.y + middle.h / 2, px: commandPx };

  /* Act three: one band per kind of check, 32 cells to a row, then a readout under them. */
  const perLine = 32;
  const pitch = Math.min(32.5, zw / perLine);
  const bandRows = scene.bands.map((band) => Math.max(1, Math.ceil(band.names.length / perLine)));
  const nominal = { size: Math.min(28, pitch - 4.5), rowGap: 6, label: 32, bandGap: 22, readout: 56 };
  const need = (m: typeof nominal) =>
    bandRows.reduce((sum, rows) => sum + m.label + rows * (m.size + m.rowGap) - m.rowGap + m.bandGap, 0) - m.bandGap + m.readout;
  /* A short stage shrinks the spacing first, then the cells, never the type. */
  const squeeze = Math.min(1, zh / need(nominal));
  const m = {
    size: nominal.size * Math.max(0.75, squeeze),
    rowGap: nominal.rowGap * squeeze,
    label: Math.max(28, nominal.label * squeeze),
    bandGap: nominal.bandGap * squeeze,
    readout: Math.max(44, nominal.readout * squeeze),
  };
  let y = top + Math.max(0, (zh - need(m)) / 2);
  const cells: HarnessLayout['cells'] = [];
  const bands: HarnessLayout['bands'] = [];
  let slot = 0;
  scene.bands.forEach((band, b) => {
    const rows = bandRows[b]!;
    const labelY = y + 18;
    y += m.label;
    const cellsTop = y;
    band.names.forEach((name, k) => {
      const row = Math.floor(k / perLine);
      const column = k % perLine;
      cells.push({
        band: b,
        column,
        row,
        name: checkCall(band.group, name),
        rect: { x: zone.left + column * pitch, y: y + row * (m.size + m.rowGap), w: m.size, h: m.size },
        /* Pieces follow the sweep, column by column, so the underline grows in the order cells filled. */
        slot: slot + column * rows + row,
      });
    });
    const columns = Math.min(perLine, band.names.length);
    bands.push({
      labelX: zone.left,
      labelY,
      top: cellsTop,
      bottom: cellsTop + rows * (m.size + m.rowGap) - m.rowGap,
      left: zone.left,
      right: zone.left + (columns - 1) * pitch + m.size,
    });
    slot += band.names.length;
    y += rows * (m.size + m.rowGap) - m.rowGap + m.bandGap;
  });
  const readoutY = y - m.bandGap + m.readout - 12;

  /* The strips: one thin mark per file and per hook, waiting at the top of the picture. The cells
     need none: they stay where they are until the last act. */
  const counts = [scene.counts.instructions, scene.counts.hooks];
  const markPitch = Math.min(14, zw / Math.max(...counts));
  const strips = counts.map((count, s) =>
    Array.from({ length: count }, (_, i) => ({ x: zone.left + i * markPitch, y: zone.top + s * STRIP_ROW, w: Math.max(2, markPitch - 4), h: 3 })),
  );

  return { zone, stacks, read, command, plates, plateTextPx, cells, bands, readoutY, strips };
}
