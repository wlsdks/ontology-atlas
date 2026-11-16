/**
 * The harness film's cast, laid out once from `harness-facts.json` (this repository's real
 * instruction files, hooks and checks). Positions are unit-free; the component scales them to its
 * stage and draws one frame per scroll position.
 */

export type InstructionKind = 'instructions' | 'rules' | 'skill' | 'agent';

export interface HarnessFacts {
  instructions: ReadonlyArray<{ path: string; kind: string }>;
  hooks: ReadonlyArray<{ name: string; config: string; events: string; step: string }>;
  checks: { scripts: readonly string[]; gitHooks: readonly string[]; workflows: readonly string[] };
  /** The Bash PreToolUse hooks every command below was run through, in their configured order. */
  gate: readonly string[];
  commands: ReadonlyArray<{ command: string; blockedBy: string | null }>;
}

export interface FileCard {
  label: string;
  kind: InstructionKind;
  /** Root instruction files and rules: every agent reads them, so they stand nearest. */
  near: boolean;
  /** 0..1: when its line of light reaches the agent. */
  order: number;
  seed: number;
}

export interface CommandChip {
  command: string;
  /** The gate's hook that denies it, or null when every hook lets it through. */
  blockedBy: string | null;
  /** Index into `gate`: the hook plate the chip meets. */
  lane: number;
  /** 0..1 within the gate act: when the chip leaves the agent. */
  launch: number;
}

export interface RailStation {
  label: string;
  group: 'hook' | 'script' | 'git-hook' | 'workflow';
}

/** A point of the closing composition: a unit-disc offset inside its group's circle. */
export interface Mark {
  x: number;
  y: number;
  tone: InstructionKind | 'hook' | 'guard' | 'check';
}

export interface HarnessScene {
  files: FileCard[];
  gate: string[];
  commands: CommandChip[];
  /** The front rail: one of each kind of check, in the order the app's Harness tab lists them. */
  stations: RailStation[];
  /** Every other check, split over the rails behind it. */
  backRails: string[][];
  counts: { instructions: number; hooks: number; checks: number };
  finale: { instructions: Mark[]; hooks: Mark[]; checks: Mark[] };
}

/** Front-rail picks, kept only when the repository really has them. */
const STATION_SCRIPTS = ['typecheck', 'lint', 'test'];
const STATION_GIT_HOOKS = ['pre-commit', 'commit-msg', 'pre-push'];
const STATION_WORKFLOWS = ['checks.yml', 'e2e.yml'];
const BACK_RAILS = 4;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function kindOf(kind: string): InstructionKind {
  return kind === 'rules' || kind === 'skill' || kind === 'agent' ? kind : 'instructions';
}

/** A sunflower disc: evenly spread, no grid lines, calm at any count. */
function disc(count: number): Array<{ x: number; y: number }> {
  return Array.from({ length: count }, (_, i) => {
    const r = Math.sqrt((i + 0.5) / Math.max(1, count));
    return { x: Math.cos(i * GOLDEN) * r, y: Math.sin(i * GOLDEN) * r };
  });
}

/** Files in the order they reach the agent: root instruction files first, then rules, skills, agents. */
function layoutFiles(facts: HarnessFacts): FileCard[] {
  const rank = (kind: InstructionKind) => (kind === 'instructions' ? 0 : kind === 'rules' ? 1 : kind === 'skill' ? 2 : 3);
  const files = facts.instructions.map((entry) => ({ label: entry.path, kind: kindOf(entry.kind), seed: hash(entry.path) }));
  files.sort((a, b) => rank(a.kind) - rank(b.kind) || a.label.localeCompare(b.label));
  return files.map((file, k) => ({ ...file, near: file.kind === 'instructions' || file.kind === 'rules', order: k / Math.max(1, files.length - 1) }));
}

export interface ReadingSpot {
  x: number;
  y: number;
  /** Font size of the card's name. */
  px: number;
  /** 1 nearest; farther rows are smaller, dimmer and drift slower. */
  depth: number;
  /** Row index from the centre outward, for each row's own drift. */
  row: number;
}

/**
 * The reading field: rows of named cards like a title card's credits. The files every agent reads
 * stand in the rows nearest the agent, the rest in rows beyond; no two cards of a row overlap, and
 * rows near the agent leave a gap where it stands.
 */
export function layoutReading(
  files: readonly FileCard[],
  measure: (text: string, px: number) => number,
  w: number,
  h: number,
): ReadingSpot[] {
  const cx = w / 2;
  const cy = h * 0.4;
  const left = w * 0.05;
  const right = w * 0.95;
  const hole = 64;
  const pad = 30;
  const space = 24;
  const small = w < 1200;
  const layers = [
    { indices: files.flatMap((file, i) => (file.near ? [i] : [])), px: small ? 12 : 13, depth: 1 },
    { indices: files.flatMap((file, i) => (file.near ? [] : [i])), px: small ? 10 : 11, depth: 0.6 },
  ].map((layer) => {
    const widths = layer.indices.map((i) => measure(files[i]!.label, layer.px) + pad);
    const total = widths.reduce((sum, width) => sum + width + space, 0);
    return { ...layer, widths, count: layer.indices.length ? Math.max(1, Math.ceil((total * 1.2) / (right - left - hole * 2))) : 0 };
  });
  /* Rows share the band between the page's bar and the captions, no closer than a card's height. */
  const rowsTotal = layers.reduce((sum, layer) => sum + layer.count, 0);
  const reach = Math.min(cy - 76, h * 0.74 - cy);
  const rowGap = Math.max(28, Math.min(46, (2 * reach) / Math.max(1, rowsTotal)));
  const spots = new Array<ReadingSpot>(files.length);
  let rowsUsed = 0;

  for (const { indices, px, depth, widths, count } of layers) {
    const rows = Array.from({ length: count }, (_, k) => {
      const ring = rowsUsed + k;
      const offset = (Math.floor(ring / 2) + 0.5) * rowGap * (ring % 2 === 0 ? -1 : 1);
      const split = Math.abs(offset) < 30;
      const segments = split ? [[left, cx - hole], [cx + hole, right]] : [[left, right]];
      const room = segments.reduce((sum, [a, b]) => sum + b! - a!, 0);
      return { ring, y: cy + offset, segments, room, items: [] as number[], used: 0 };
    });
    rowsUsed += count;
    /* Each card to the row with the most room left: rows fill evenly. */
    indices.forEach((_, k) => {
      const row = rows.reduce((best, next) => (next.room - next.used > best.room - best.used ? next : best));
      row.items.push(k);
      row.used += widths[k]! + space;
    });
    for (const row of rows) {
      /* Fill each segment in order while its cards fit; the last takes the rest. */
      let cursor = 0;
      row.segments.forEach(([a, b], s) => {
        const mine: number[] = [];
        let used = 0;
        while (cursor < row.items.length) {
          const next = widths[row.items[cursor]!]! + space;
          if (s < row.segments.length - 1 && mine.length > 0 && used + next > b! - a!) break;
          mine.push(row.items[cursor]!);
          used += next;
          cursor += 1;
        }
        const filled = mine.reduce((sum, k) => sum + widths[k]!, 0);
        const step = Math.max(0, b! - a! - filled) / (mine.length + 1);
        let x = a!;
        mine.forEach((k, n) => {
          const inner = n > 0 && n < mine.length - 1;
          const jitter = inner ? (files[indices[k]!]!.seed - 0.5) * step * 0.5 : 0;
          x += step;
          spots[indices[k]!] = { x: x + widths[k]! / 2 + jitter, y: row.y, px, depth, row: row.ring };
          x += widths[k]!;
        });
      });
    }
  }
  return spots;
}

export function buildHarnessScene(facts: HarnessFacts): HarnessScene {
  const gate = [...facts.gate];
  const lanes = Math.max(1, gate.length);
  /* A command the hooks allow takes the lane left alone longest, so it never meets a chip still there. */
  const lastUse = new Array<number>(lanes).fill(-Infinity);
  const commands = facts.commands.map((entry, i) => {
    const blocked = entry.blockedBy === null ? -1 : gate.indexOf(entry.blockedBy);
    let lane = blocked;
    if (lane < 0) {
      /* Nor the lane the next denied command is about to hit. */
      const next = facts.commands[i + 1];
      const nextLane = next?.blockedBy ? gate.indexOf(next.blockedBy) : -1;
      lane = lastUse
        .map((used, k) => ({ k, cost: used + (k === nextLane ? lanes + 1 : 0) }))
        .reduce((best, other) => (other.cost < best.cost ? other : best)).k;
    }
    lastUse[lane] = i;
    return {
      command: entry.command,
      blockedBy: blocked >= 0 ? entry.blockedBy : null,
      lane,
      launch: facts.commands.length <= 1 ? 0 : (i / (facts.commands.length - 1)) * 0.68,
    };
  });

  const scripts = facts.checks.scripts;
  const gitHooks = facts.checks.gitHooks;
  const workflows = facts.checks.workflows;
  const verificationHooks = [
    ...new Set(facts.hooks.filter((hook) => hook.step === 'verification').map((hook) => hook.name)),
  ];
  const stations: RailStation[] = [
    ...verificationHooks.map((label) => ({ label, group: 'hook' as const })),
    ...STATION_SCRIPTS.filter((name) => scripts.includes(name)).map((label) => ({ label, group: 'script' as const })),
    ...STATION_GIT_HOOKS.filter((name) => gitHooks.includes(name)).map((label) => ({ label, group: 'git-hook' as const })),
    ...STATION_WORKFLOWS.filter((name) => workflows.includes(name)).map((label) => ({ label, group: 'workflow' as const })),
  ];
  const onFront = new Set(stations.map((station) => station.label));
  const rest = [...scripts, ...gitHooks, ...workflows].filter((name) => !onFront.has(name));
  const backRails = Array.from({ length: BACK_RAILS }, (_, k) => rest.filter((_, i) => i % BACK_RAILS === k));

  const checkCount = scripts.length + gitHooks.length + workflows.length;
  const files = layoutFiles(facts);
  const byKind = [...files].sort((a, b) => a.order - b.order);
  return {
    files,
    gate,
    commands,
    stations,
    backRails,
    counts: { instructions: facts.instructions.length, hooks: facts.hooks.length, checks: checkCount },
    finale: {
      instructions: disc(byKind.length).map((at, i) => ({ ...at, tone: byKind[i]!.kind })),
      hooks: facts.hooks.map((hook, i) => {
        const a = (i / Math.max(1, facts.hooks.length)) * Math.PI * 2 - Math.PI / 2;
        return { x: Math.cos(a), y: Math.sin(a), tone: hook.step === 'guardrails' ? 'guard' : 'hook' };
      }),
      checks: disc(checkCount).map((at) => ({ ...at, tone: 'check' as const })),
    },
  };
}
