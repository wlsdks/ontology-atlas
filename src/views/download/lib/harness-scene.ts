import { easeInOut } from './film-kit';

/**
 * The harness film's cast: one fixed example repository, `my-app/`, read the way the app's Harness
 * › Setup screen reads a repository, and the geometry of the window the film draws that screen in.
 * The cast is an example a visitor could own, never this repository's own harness, so the film
 * shows what the tab does rather than what Atlas happens to have. Each file carries the tools that
 * read it; counts under a tool filter are computed from those, as the tab computes them. The
 * film's framing (picture zone, push, focus and pane cross-fades) is here too, as pure functions of
 * film time, so tests can hold every frame to it.
 */

export type AreaId = 'context' | 'guardrails' | 'verification';
export type GroupId =
  | 'instructions'
  | 'rules'
  | 'skills'
  | 'subagents'
  | 'mcp'
  | 'permissions'
  | 'blockingHooks'
  | 'scripts'
  | 'gitHooks'
  | 'workflows';
export type Tool = 'claude-code' | 'codex';
/** `null` is All. */
export type Filter = Tool | null;

export const TOOL_NAMES: Record<Tool, string> = { 'claude-code': 'Claude Code', codex: 'Codex' };

/** The three areas in the order of the agent's loop, each with its categories in the tab's order. */
export const AREAS: ReadonlyArray<{ id: AreaId; groups: readonly GroupId[] }> = [
  { id: 'context', groups: ['instructions', 'rules', 'skills', 'subagents', 'mcp'] },
  { id: 'guardrails', groups: ['permissions', 'blockingHooks'] },
  { id: 'verification', groups: ['scripts', 'gitHooks', 'workflows'] },
];

export interface ExampleFile {
  /** What pane 2 lists. */
  label: string;
  group: GroupId;
  /** The tree row the scan reads it from. */
  row: string;
  /** Empty for what runs whichever agent worked: scripts, Git hooks, CI workflows. */
  tools: readonly Tool[];
  event?: string;
  /** A hook script the config names and the disk lacks. */
  missing?: boolean;
  /** A copy whose twin in the other tool's folder differs. */
  differs?: Tool;
}

export const EXAMPLE_REPO = 'my-app/';

const claude: readonly Tool[] = ['claude-code'];
const codex: readonly Tool[] = ['codex'];
const everyone: readonly Tool[] = [];

/** Twins sit side by side, so a filter that hides one copy closes every other row. */
export const EXAMPLE_FILES: readonly ExampleFile[] = [
  { label: 'AGENTS.md', group: 'instructions', row: 'AGENTS.md', tools: codex },
  { label: 'CLAUDE.md', group: 'instructions', row: 'CLAUDE.md', tools: claude },
  ...['api', 'db', 'frontend', 'security', 'style', 'testing'].map((name) => ({
    label: `.claude/rules/${name}.md`,
    group: 'rules' as const,
    row: '.claude/rules/',
    tools: claude,
  })),
  ...['code-review', 'release-notes', 'db-migrate', 'write-tests'].flatMap((name) => [
    { label: `.claude/skills/${name}`, group: 'skills' as const, row: '.claude/skills/', tools: claude },
    { label: `.agents/skills/${name}`, group: 'skills' as const, row: '.agents/', tools: codex },
  ]),
  { label: '.claude/agents/reviewer.md', group: 'subagents', row: '.claude/agents/', tools: claude, differs: 'codex' },
  { label: '.agents/agents/reviewer.md', group: 'subagents', row: '.agents/', tools: codex, differs: 'claude-code' },
  { label: '.claude/agents/planner.md', group: 'subagents', row: '.claude/agents/', tools: claude },
  { label: '.agents/agents/planner.md', group: 'subagents', row: '.agents/', tools: codex },
  { label: '.mcp.json', group: 'mcp', row: '.mcp.json', tools: claude },
  { label: '.claude/settings.json', group: 'permissions', row: '.claude/settings.json', tools: claude },
  { label: 'block-force-push.sh', group: 'blockingHooks', row: '.claude/hooks/', tools: claude, event: 'PreToolUse', missing: true },
  { label: 'block-publish.sh', group: 'blockingHooks', row: '.claude/hooks/', tools: claude, event: 'PreToolUse' },
  { label: 'protect-env.sh', group: 'blockingHooks', row: '.claude/hooks/', tools: claude, event: 'PreToolUse' },
  ...['lint', 'typecheck', 'test'].map((name) => ({ label: name, group: 'scripts' as const, row: 'package.json', tools: everyone })),
  ...['pre-commit', 'pre-push'].map((name) => ({ label: name, group: 'gitHooks' as const, row: '.githooks/', tools: everyone })),
  ...['ci.yml', 'e2e.yml', 'lint.yml', 'release.yml'].map((name) => ({
    label: name,
    group: 'workflows' as const,
    row: '.github/workflows/',
    tools: everyone,
  })),
];

/** The tab keeps a file under a filter when that tool reads it, or when it runs for every agent. */
export function visibleTo(file: ExampleFile, filter: Filter): boolean {
  return filter === null || file.tools.length === 0 || file.tools.includes(filter);
}

export function areaOf(group: GroupId): AreaId {
  return AREAS.find((area) => area.groups.includes(group))!.id;
}

export function groupCounts(filter: Filter): Record<GroupId, number> {
  const counts = Object.fromEntries(AREAS.flatMap((area) => area.groups.map((group) => [group, 0]))) as Record<GroupId, number>;
  for (const file of EXAMPLE_FILES) if (visibleTo(file, filter)) counts[file.group] += 1;
  return counts;
}

export function areaTotals(filter: Filter): Record<AreaId, number> {
  const counts = groupCounts(filter);
  return Object.fromEntries(AREAS.map((area) => [area.id, area.groups.reduce((sum, group) => sum + counts[group], 0)])) as Record<
    AreaId,
    number
  >;
}

export function itemsOf(group: GroupId): ExampleFile[] {
  return EXAMPLE_FILES.filter((file) => file.group === group);
}

/** The scan's tree: one row per folder or file it reads, in the order `ls -a` lists them. */
export interface TreeRow {
  path: string;
  area: AreaId;
  /** What this row adds to each category it fills. */
  adds: Array<{ group: GroupId; n: number }>;
}

export const TREE: readonly TreeRow[] = [...new Set(EXAMPLE_FILES.map((file) => file.row))]
  .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  .map((path) => {
    const files = EXAMPLE_FILES.filter((file) => file.row === path);
    const groups = [...new Set(files.map((file) => file.group))];
    return {
      path,
      area: areaOf(files[0]!.group),
      adds: groups.map((group) => ({ group, n: files.filter((file) => file.group === group).length })),
    };
  });

/** The hook config pane 3 opens on, the last line naming the script that is not on disk. */
export const SETTINGS_PATH = '.claude/settings.json';
export const SETTINGS_LINES = ['"PreToolUse": [{', '  "matcher": "Bash",', '  "command":', '  ".claude/hooks/block-force-push.sh"'] as const;
export const SETTINGS_MISSING_LINE = 3;

/** The two copies of one subagent, side by side on shared rows: only the tools line differs. */
export const DIFF_ROWS: ReadonlyArray<readonly [string, string] | null> = [
  null,
  null,
  ['tools: Read', 'tools: Bash'],
  null,
  null,
];
/** Blank line widths, as a share of a column, for the rows the film does not spell out. */
export const SLAB_SHARES = [0.62, 0.84, 0.48, 0.76, 0.55, 0.7, 0.4] as const;

/* ---------- the window, in its own units ---------- */

export const WINDOW = { w: 1040, h: 492, radius: 14, header: 56 } as const;
/** The problem line's band sits under the header; the three panes start below it. */
export const PANE_TOP = 92;
export const PANES = [
  { x: 0, w: 300 },
  { x: 300, w: 340 },
  { x: 640, w: 400 },
] as const;
/** Type sizes in window units. The film keeps every canvas letter at 15px or more on screen. */
export const TYPE = {
  title: 22,
  tab: 15,
  treeTitle: 18,
  tree: 17,
  sectionTitle: 22,
  caption: 15,
  total: 56,
  row: 17,
  areaTitle: 20,
  tag: 15,
  path: 18,
  code: 17,
} as const;
export const TYPE_FLOOR = 15;

/** Act one: the tree card on the left, three columns on the right, and the wires between. */
export const SCAN = {
  card: { x: 24, y: 68, w: 276, h: 416 },
  titleY: 94,
  guideX: 44,
  rowX: 56,
  firstRowY: 131,
  pitch: 30,
  /** The scan line's run, top to bottom of the rows. */
  sweep: { top: 116, bottom: 476 },
  columns: [348, 578, 808],
  colW: 208,
  colTitleY: 90,
  captionY: 120,
  captionLH: 20,
  totalY: 206,
  rowsY: 242,
  rowPitch: 32,
  trunkX: 318,
  trackY: 66,
  corner: 6,
} as const;

export function treeRowY(k: number): number {
  return SCAN.firstRowY + k * SCAN.pitch;
}

/** Pane 1 rows: an area's heading, then its categories. */
export const PANE1 = { top: PANE_TOP + 6, area: 40, row: 27, padX: 16, right: 284 } as const;

export interface Pane1Row {
  kind: 'area' | 'group';
  area: AreaId;
  group?: GroupId;
  /** Middle of the row. */
  y: number;
  top: number;
  h: number;
}

export const PANE1_ROWS: readonly Pane1Row[] = (() => {
  const rows: Pane1Row[] = [];
  let y = PANE1.top;
  for (const area of AREAS) {
    rows.push({ kind: 'area', area: area.id, top: y, h: PANE1.area, y: y + PANE1.area / 2 });
    y += PANE1.area;
    for (const group of area.groups) {
      rows.push({ kind: 'group', area: area.id, group, top: y, h: PANE1.row, y: y + PANE1.row / 2 });
      y += PANE1.row;
    }
  }
  return rows;
})();

export function pane1Row(group: GroupId): Pane1Row {
  return PANE1_ROWS.find((row) => row.group === group)!;
}

export function pane1Area(area: AreaId): Pane1Row {
  return PANE1_ROWS.find((row) => row.kind === 'area' && row.area === area)!;
}

/** Act one's column rows: where each category stands before the columns stack into pane 1. */
export function scanGroupY(group: GroupId): number {
  const area = AREAS.find((entry) => entry.groups.includes(group))!;
  return SCAN.rowsY + area.groups.indexOf(group) * SCAN.rowPitch;
}

export function scanColumnX(area: AreaId): number {
  return SCAN.columns[AREAS.findIndex((entry) => entry.id === area)]!;
}

/** Pane 2: its heading, then item rows of two lines. */
export const PANE2 = { headY: PANE_TOP + 22, rowsTop: PANE_TOP + 40, row: 44, x: 308, w: 324, padX: 12 } as const;
/** Pane 3: the item's path, the tools that read it, then its content. */
export const PANE3 = {
  x: 664,
  right: 1020,
  pathY: PANE_TOP + 24,
  readByY: PANE_TOP + 58,
  readByValueX: 776,
  box: { x: 656, y: PANE_TOP + 82, w: 368, h: 304 },
  lineTop: PANE_TOP + 112,
  lineH: 28,
} as const;

/**
 * One wire per tree row: from the row's end, up a shared trunk beside the card, along a track
 * under the header and down into its area's column, with rounded corners. Sampled every few units
 * so a wire can be drawn part of the way at any moment.
 */
export interface Wire {
  points: Array<{ x: number; y: number }>;
  /** Cumulative length at each point. */
  at: number[];
  length: number;
}

export function wireFor(k: number, area: AreaId): Wire {
  const r = SCAN.corner;
  const y = treeRowY(k);
  const colX = scanColumnX(area);
  const dropX = colX - 11;
  const endY = SCAN.colTitleY;
  const pts: Array<{ x: number; y: number }> = [];
  const line = (x0: number, y0: number, x1: number, y1: number) => {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4));
    for (let i = pts.length === 0 ? 0 : 1; i <= n; i += 1) pts.push({ x: x0 + ((x1 - x0) * i) / n, y: y0 + ((y1 - y0) * i) / n });
  };
  const arc = (cx: number, cy: number, from: number, to: number) => {
    for (let i = 1; i <= 6; i += 1) {
      const a = from + ((to - from) * i) / 6;
      pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
  };
  const right = SCAN.card.x + SCAN.card.w;
  line(right, y, SCAN.trunkX - r, y);
  arc(SCAN.trunkX - r, y - r, Math.PI / 2, 0);
  line(SCAN.trunkX, y - r, SCAN.trunkX, SCAN.trackY + r);
  arc(SCAN.trunkX + r, SCAN.trackY + r, Math.PI, (3 * Math.PI) / 2);
  line(SCAN.trunkX + r, SCAN.trackY, dropX - r, SCAN.trackY);
  arc(dropX - r, SCAN.trackY + r, -Math.PI / 2, 0);
  line(dropX, SCAN.trackY + r, dropX, endY - r);
  arc(dropX + r, endY - r, Math.PI, Math.PI / 2);
  line(dropX + r, endY, colX - 4, endY);
  const at = [0];
  for (let i = 1; i < pts.length; i += 1) at.push(at[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y));
  return { points: pts, at, length: at[at.length - 1]! };
}

/* ---------- the film's clock, in film milliseconds ---------- */

/** Scan, filter, problem, copies that differ. */
export const ACT_MS = [2600, 2600, 2800, 2800] as const;
export const STARTS = [0, 2600, 5200, 8000] as const;
export const TOTAL = 10800;
/** Act two: panes 2 and 3 slide in once the last column has left their place for pane 1. */
export const PANES_IN = [3600, 3940] as const;
/** Act three: the problem line's chip is pressed and the hook opens. */
export const PRESS = 6100;
/** Panes 2 and 3 change subject by cross-fading, so they are never empty between two. */
export const SWITCH_MS = 240;
/** Act three hands panes 2 and 3 to act four's subagent across the join, with the captions. */
export const TO_SUBAGENTS = STARTS[3] - SWITCH_MS / 2;

/** A value eased between keys `[time, value]`, held before the first and after the last. */
function keyedValue(keys: ReadonlyArray<readonly [number, number]>, T: number): number {
  if (T <= keys[0]![0]) return keys[0]![1];
  for (let i = 0; i < keys.length - 1; i += 1) {
    const [a, va] = keys[i]!;
    const [b, vb] = keys[i + 1]!;
    if (T < b) return va + (vb - va) * easeInOut((T - a) / (b - a));
  }
  return keys[keys.length - 1]![1];
}

/** What panes 2 and 3 show, in turn. */
export type PaneContent = 'skills' | 'hooks' | 'subagents';
/** [content, in from, out from]; each change is one cross-fade of `SWITCH_MS`. */
const CONTENT_KEYS: ReadonlyArray<readonly [PaneContent, number, number]> = [
  ['skills', PANES_IN[0], PRESS + 40],
  ['hooks', PRESS + 40, TO_SUBAGENTS],
  ['subagents', TO_SUBAGENTS, Infinity],
];

/** Each content's opacity at T, and how long it has been coming in. */
export function paneContentsAt(T: number): Array<{ id: PaneContent; a: number; since: number }> {
  return CONTENT_KEYS.flatMap(([id, from, out]) => {
    const fadeIn = id === 'skills' ? PANES_IN[1] - PANES_IN[0] : SWITCH_MS;
    const a = easeInOut((T - from) / fadeIn) * (1 - easeInOut((T - out) / SWITCH_MS));
    return a > 0.004 ? [{ id, a, since: T - from }] : [];
  });
}

/*
 * The camera. A recorded app screen reads as a calm product shot: the window never leaves its
 * picture, and only pushes in gently about its own centre, once, from act two to act four, then
 * eases back to the whole screen before the film holds and loops.
 */
export const PUSH_MAX = 1.05;
const PUSH_KEYS: ReadonlyArray<readonly [number, number]> = [
  [3000, 1],
  [9200, PUSH_MAX],
  [10600, 1],
];

export function pushAt(T: number): number {
  return keyedValue(PUSH_KEYS, T);
}

/*
 * Emphasis is light and dimming, not framing: each act's subject stays at full brightness and the
 * rest of the window falls back to `DIM`, still legible. Act one and the end frame are the whole
 * screen. In act four pane 2 keeps only its two tagged rows bright.
 */
export const DIM = 0.64;
export type FocusRegion = 'header' | 'problem' | 'pane1' | 'pane2' | 'pane3';
export type Focus = Record<FocusRegion, number>;
const FOCUS_KEYS: Record<FocusRegion, ReadonlyArray<readonly [number, number]>> = {
  /* The tool filter is act two's subject; from the problem line on, the header falls back. */
  header: [
    [5500, 1],
    [5900, DIM],
    [9800, DIM],
    [10600, 1],
  ],
  /* The problem line is act three's; act four is about the copies. */
  problem: [
    [7700, 1],
    [8100, DIM],
    [9800, DIM],
    [10600, 1],
  ],
  /* Once the chip is pressed, the hook config in panes 2 and 3 is the subject. */
  pane1: [
    [PRESS, 1],
    [PRESS + 400, DIM],
    [9800, DIM],
    [10600, 1],
  ],
  pane2: [
    [8000, 1],
    [8400, DIM],
    [9800, DIM],
    [10600, 1],
  ],
  pane3: [[0, 1]],
};

export function focusAt(T: number): Focus {
  return {
    header: keyedValue(FOCUS_KEYS.header, T),
    problem: keyedValue(FOCUS_KEYS.problem, T),
    pane1: keyedValue(FOCUS_KEYS.pane1, T),
    pane2: keyedValue(FOCUS_KEYS.pane2, T),
    pane3: keyedValue(FOCUS_KEYS.pane3, T),
  };
}

/** Where the window sits on the stage, and its scale. */
export interface WindowFrame {
  x: number;
  y: number;
  s: number;
}

/** The picture zone on a stage, in CSS pixels: left, top, right, bottom. */
export interface Zone {
  l: number;
  t: number;
  r: number;
  b: number;
}

export const ZONE = { topMin: 120, labelGap: 24, captionGap: 32, edge: 32, narrow: 960 } as const;

/**
 * The picture zone of a playing stage, from the page as laid out: the page column (read from the
 * caption block, so it follows whatever gutter the page has), or 960px wide when that column is
 * narrower, and between the stage label and the caption block with room around both.
 */
export function pictureZone(w: number, column: { left: number; right: number }, labelBottom: number, captionTop: number): Zone {
  const narrow = column.right - column.left < ZONE.narrow;
  const l = narrow ? Math.max(ZONE.edge, (w - ZONE.narrow) / 2) : column.left;
  const r = narrow ? w - l : column.right;
  return { l, r, t: Math.max(ZONE.topMin, labelBottom + ZONE.labelGap), b: captionTop - ZONE.captionGap };
}

/**
 * The window on a playing stage: as large as the zone allows with room for the push, its left edge
 * on the column line at the push's height, and centred between the label and the caption.
 */
export function playingFrame(zone: Zone): WindowFrame {
  const zw = zone.r - zone.l;
  const zh = zone.b - zone.t;
  const s = Math.min(zw / WINDOW.w, zh / WINDOW.h) / PUSH_MAX;
  return { x: zone.l + (WINDOW.w * s * (PUSH_MAX - 1)) / 2, y: zone.t + (zh - WINDOW.h * s) / 2, s };
}

/** The window's drawn rect under a push of `zoom` about its centre. */
export function windowRect(win: WindowFrame, zoom: number): { x: number; y: number; w: number; h: number } {
  const w = WINDOW.w * win.s * zoom;
  const h = WINDOW.h * win.s * zoom;
  return { x: win.x + (WINDOW.w * win.s - w) / 2, y: win.y + (WINDOW.h * win.s - h) / 2, w, h };
}

/** The window on the still stage shown under reduced motion: centred in the stage, at most 1:1. */
export function stillFrame(w: number, h: number, origin: number): WindowFrame {
  const left = w - 2 * origin >= 960 ? origin : Math.max(32, (w - 960) / 2);
  const s = Math.max(0.5, Math.min(1, (w - 2 * left) / WINDOW.w, (h - 48) / WINDOW.h));
  return { x: left, y: (h - WINDOW.h * s) / 2, s };
}

/**
 * Narrower than the film, the whole window's type would fall under the floor, so the still shows
 * pane 3 of the last frame alone, the two copies side by side, at a size that keeps it legible.
 */
export const STILL_DETAIL = { x: PANES[2].x, y: PANE_TOP, w: PANES[2].w, h: WINDOW.h - PANE_TOP } as const;

export function stillDetailFrame(w: number, h: number, gutter: number): WindowFrame {
  const s = Math.min(1, (w - 2 * gutter) / STILL_DETAIL.w, (h - 32) / STILL_DETAIL.h);
  return { x: gutter - STILL_DETAIL.x * s, y: (h - STILL_DETAIL.h * s) / 2 - STILL_DETAIL.y * s, s };
}
