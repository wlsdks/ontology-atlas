import { describe, expect, it } from 'vitest';

import { scanHarness, type HarnessScanPort } from '@/entities/agent-files';
import { buildHarnessSetup } from '@/widgets/harness-setup';

import {
  AREAS,
  DIFF_ROWS,
  DIM,
  EXAMPLE_FILES,
  PANE1_ROWS,
  PANE2,
  PANE3,
  PANES_IN,
  PUSH_MAX,
  SCAN,
  SETTINGS_LINES,
  STARTS,
  STILL_DETAIL,
  SWITCH_MS,
  TOTAL,
  TREE,
  TYPE,
  TYPE_FLOOR,
  WINDOW,
  ZONE,
  areaTotals,
  focusAt,
  groupCounts,
  itemsOf,
  paneContentsAt,
  pictureZone,
  playingFrame,
  pushAt,
  stillDetailFrame,
  treeRowY,
  windowRect,
  wireFor,
} from './harness-scene';

/**
 * The example repository as files on a disk, written so the app's own scanner can read it: every
 * file the film lists, the hook config that names one script the disk lacks, and one subagent whose
 * Claude Code and Codex copies differ.
 */
const DISK: Record<string, string> = {
  'AGENTS.md': '# my-app\n\nRun pnpm test before you finish.\n',
  'CLAUDE.md': '# my-app\n\nRun pnpm test before you finish.\n',
  ...Object.fromEntries(['api', 'db', 'frontend', 'security', 'style', 'testing'].map((name) => [`.claude/rules/${name}.md`, `# ${name}\n`])),
  ...Object.fromEntries(
    ['code-review', 'release-notes', 'db-migrate', 'write-tests'].flatMap((name) => [
      [`.claude/skills/${name}/SKILL.md`, `---\nname: ${name}\n---\n`],
      [`.agents/skills/${name}/SKILL.md`, `---\nname: ${name}\n---\n`],
    ]),
  ),
  '.claude/agents/reviewer.md': '---\nname: reviewer\ntools: Read\n---\nReview the diff.\n',
  '.agents/agents/reviewer.md': '---\nname: reviewer\ntools: Bash\n---\nReview the diff.\n',
  '.claude/agents/planner.md': '---\nname: planner\n---\nPlan the change.\n',
  '.agents/agents/planner.md': '---\nname: planner\n---\nPlan the change.\n',
  '.mcp.json': '{ "mcpServers": {} }\n',
  '.claude/settings.json': JSON.stringify({
    permissions: { deny: ['Bash(git push --force:*)'] },
    hooks: {
      PreToolUse: [
        {
          matcher: 'Bash',
          hooks: ['block-force-push', 'block-publish', 'protect-env'].map((name) => ({
            type: 'command',
            command: `.claude/hooks/${name}.sh`,
          })),
        },
      ],
    },
  }),
  '.claude/hooks/block-publish.sh': '#!/bin/sh\n',
  '.claude/hooks/protect-env.sh': '#!/bin/sh\n',
  'package.json': JSON.stringify({ scripts: { dev: 'next dev', lint: 'eslint .', typecheck: 'tsc', test: 'vitest' } }),
  '.githooks/pre-commit': '#!/bin/sh\n',
  '.githooks/pre-push': '#!/bin/sh\n',
  ...Object.fromEntries(['ci.yml', 'e2e.yml', 'lint.yml', 'release.yml'].map((name) => [`.github/workflows/${name}`, 'on: push\n'])),
};

function diskPort(): HarnessScanPort {
  const dirs = new Map<string, Map<string, 'file' | 'directory'>>();
  for (const path of Object.keys(DISK)) {
    const parts = path.split('/');
    parts.forEach((name, i) => {
      const dir = parts.slice(0, i).join('/');
      const entries = dirs.get(dir) ?? new Map<string, 'file' | 'directory'>();
      entries.set(name, i === parts.length - 1 ? 'file' : 'directory');
      dirs.set(dir, entries);
    });
  }
  return {
    async listDir(path) {
      const entries = dirs.get(path);
      return entries ? [...entries].map(([name, kind]) => ({ name, kind })) : null;
    },
    async readText(path) {
      const text = DISK[path];
      return text === undefined ? null : { text, lastModified: null, bytes: text.length };
    },
    async pathExists(path) {
      return path in DISK || dirs.has(path);
    },
  };
}

describe('the example repository', () => {
  it('counts what the Harness tab itself counts for it, under All and under Codex', async () => {
    const report = await scanHarness(diskPort());
    for (const filter of [null, 'codex'] as const) {
      const setup = buildHarnessSetup(report, filter);
      const tab = Object.fromEntries(setup.sections.flatMap((section) => section.groups.map((group) => [group.id, group.items.length])));
      const film = groupCounts(filter);
      for (const area of AREAS) {
        for (const group of area.groups) expect(tab[group] ?? 0, `${filter ?? 'all'} ${group}`).toBe(film[group]);
        expect(setup.sections.find((section) => section.id === area.id)?.total, `${filter ?? 'all'} ${area.id}`).toBe(
          areaTotals(filter)[area.id],
        );
      }
    }
  });

  it('holds the one problem and the one differing pair the film shows', async () => {
    const setup = buildHarnessSetup(await scanHarness(diskPort()), null);
    expect(setup.problems.map((problem) => (problem.kind === 'hook-missing' ? problem.path : problem.kind))).toEqual([
      '.claude/hooks/block-force-push.sh',
    ]);
    const subagents = setup.sections.flatMap((section) => section.groups).find((group) => group.id === 'subagents')!.items;
    const differing = subagents.filter((item) => item.differsFrom).map((item) => item.path).sort();
    expect(differing).toEqual(['.agents/agents/reviewer.md', '.claude/agents/reviewer.md']);
    expect(EXAMPLE_FILES.filter((file) => file.differs).map((file) => file.label).sort()).toEqual(differing);
    expect(SETTINGS_LINES.some((line) => line.includes('.claude/hooks/block-force-push.sh'))).toBe(true);
  });

  it('reads each tree row into one area, and the rows add up to every count', () => {
    const counts = groupCounts(null);
    for (const group of Object.keys(counts) as Array<keyof typeof counts>) {
      const fromRows = TREE.flatMap((row) => row.adds).filter((add) => add.group === group).reduce((sum, add) => sum + add.n, 0);
      expect(fromRows, group).toBe(counts[group]);
    }
    for (const row of TREE) {
      const areas = new Set(row.adds.map((add) => AREAS.find((area) => area.groups.includes(add.group))!.id));
      expect([...areas]).toEqual([row.area]);
    }
  });
});

/* A monospace advance of 0.6em; the layout only needs a width per name. */
const mono = (text: string, px: number) => text.length * px * 0.6;

describe('the window', () => {
  it('fits the tree, every pane-1 row and every pane-2 list inside it', () => {
    expect(treeRowY(TREE.length - 1) + SCAN.pitch / 2).toBeLessThanOrEqual(SCAN.card.y + SCAN.card.h);
    for (const row of PANE1_ROWS) expect(row.top + row.h).toBeLessThanOrEqual(WINDOW.h);
    for (const area of AREAS) {
      for (const group of area.groups) expect(PANE2.rowsTop + itemsOf(group).length * PANE2.row).toBeLessThanOrEqual(WINDOW.h);
    }
    expect(PANE3.box.y + PANE3.box.h).toBeLessThanOrEqual(WINDOW.h);
  });

  it('runs every wire under the header and over the column titles, never through a column', () => {
    TREE.forEach((row, k) => {
      for (const point of wireFor(k, row.area).points) {
        expect(point.y).toBeGreaterThan(WINDOW.header);
        const inColumn = SCAN.columns.some((x) => point.x > x && point.x < x + SCAN.colW);
        if (inColumn) expect(point.y).toBeLessThanOrEqual(SCAN.colTitleY);
      }
    });
  });

  it('keeps every tree row and pane-2 path on one line at its type size', () => {
    for (const row of TREE) expect(SCAN.rowX + mono(row.path, TYPE.tree)).toBeLessThan(SCAN.card.x + SCAN.card.w);
    for (const file of EXAMPLE_FILES) expect(mono(file.label, TYPE.row), file.label).toBeLessThanOrEqual(PANE2.w - 2 * PANE2.padX);
    expect(mono('.claude/agents/reviewer.md', TYPE.path)).toBeLessThanOrEqual(PANE3.right - PANE3.x);
  });

});

/** Every frame of one loop at 60 frames a second. */
const FRAMES = Array.from({ length: Math.ceil((TOTAL * 60) / 1000) + 1 }, (_, i) => Math.min(TOTAL, (i * 1000) / 60));

/**
 * Stages as the page lays them out: the column is the page's (from 1520px wide it stops growing),
 * the label's bottom about 100px down, and the caption block about 200px tall above a 5svh margin.
 */
const STAGES = [
  [1040, 720, 48],
  [1280, 800, 64],
  [1440, 900, 200],
  [1914, 1000, 197],
  [1920, 1080, 200],
  [2560, 1440, 520],
].map(([w, vh, gutter]) => {
  const h = Math.min(960, Math.max(576, vh!));
  return { w: w!, column: { left: gutter!, right: w! - gutter! }, labelBottom: 100, captionTop: h - 0.05 * vh! - 200 };
});

describe('the picture', () => {
  it('keeps the window whole inside its zone at every frame, from 1040 to 2560 wide', () => {
    for (const stage of STAGES) {
      const zone = pictureZone(stage.w, stage.column, stage.labelBottom, stage.captionTop);
      expect(zone.t, `${stage.w}`).toBeGreaterThanOrEqual(stage.labelBottom + ZONE.labelGap);
      expect(zone.b, `${stage.w}`).toBeLessThanOrEqual(stage.captionTop - ZONE.captionGap);
      const win = playingFrame(zone);
      for (const T of FRAMES) {
        const r = windowRect(win, pushAt(T));
        const at = `${stage.w} at ${Math.round(T)}ms`;
        expect(r.x, at).toBeGreaterThanOrEqual(zone.l - 1e-6);
        expect(r.x + r.w, at).toBeLessThanOrEqual(zone.r + 1e-6);
        expect(r.y, at).toBeGreaterThanOrEqual(zone.t - 1e-6);
        expect(r.y + r.h, at).toBeLessThanOrEqual(zone.b + 1e-6);
      }
    }
  });

  it('pushes in at most 6% about the window’s own centre, a little at a time', () => {
    const win = playingFrame(pictureZone(1920, { left: 200, right: 1720 }, 100, 706));
    const centre = (zoom: number) => {
      const r = windowRect(win, zoom);
      return [r.x + r.w / 2, r.y + r.h / 2];
    };
    expect(PUSH_MAX).toBeLessThanOrEqual(1.06);
    let last = pushAt(0);
    for (const T of FRAMES) {
      const zoom = pushAt(T);
      expect(zoom).toBeGreaterThanOrEqual(1);
      expect(zoom).toBeLessThanOrEqual(PUSH_MAX);
      expect(centre(zoom)[0]).toBeCloseTo(centre(1)[0]!, 6);
      expect(centre(zoom)[1]).toBeCloseTo(centre(1)[1]!, 6);
      expect(Math.abs(zoom - last), `${Math.round(T)}ms`).toBeLessThan(0.002);
      last = zoom;
    }
    /* The loop's seam and the end the film rests on are the whole screen. */
    expect(pushAt(0)).toBe(1);
    expect(pushAt(TOTAL)).toBe(1);
  });

  it('keeps each act’s subject brightest and everything else legible', () => {
    for (const T of FRAMES) {
      for (const k of Object.values(focusAt(T))) expect(k).toBeGreaterThanOrEqual(0.6);
    }
    expect(DIM).toBeGreaterThanOrEqual(0.6);
    /* Act one, and the frame the loop rests on, are the whole screen. */
    for (const T of [0, 1300, STARTS[1] - 1, TOTAL]) expect(Object.values(focusAt(T)).every((k) => k === 1), `${T}`).toBe(true);
    /* Act four is about the two copies in pane 3; the rest falls back. */
    for (const T of [8600, 9000, 9400]) {
      const focus = focusAt(T);
      expect(focus.pane3).toBe(1);
      for (const region of ['header', 'problem', 'pane1', 'pane2'] as const) expect(focus[region], `${region} ${T}`).toBeLessThan(0.7);
    }
  });

  it('never leaves panes 2 and 3 empty between two subjects', () => {
    for (const T of FRAMES.filter((T) => T >= PANES_IN[1])) {
      const shown = paneContentsAt(T).reduce((sum, content) => sum + content.a, 0);
      expect(shown, `${Math.round(T)}ms`).toBeGreaterThan(0.99);
    }
    /* By the time act four's caption is up, its subagent fills both panes. */
    for (const T of FRAMES.filter((T) => T >= STARTS[3] + SWITCH_MS / 2)) {
      expect(paneContentsAt(T).find((content) => content.id === 'subagents')?.a).toBeGreaterThan(0.999);
    }
  });

  it('on a phone, still shows pane 3 whole, its type at the floor or above and inside the pane', () => {
    for (const w of [360, 390, 600, 767]) {
      const win = stillDetailFrame(w, 400, 24);
      const left = win.x + STILL_DETAIL.x * win.s;
      const right = left + STILL_DETAIL.w * win.s;
      expect(left).toBeCloseTo(24, 6);
      expect(right).toBeLessThanOrEqual(w - 24 + 1e-6);
      expect(win.y + STILL_DETAIL.y * win.s).toBeGreaterThanOrEqual(0);
      expect(win.y + (STILL_DETAIL.y + STILL_DETAIL.h) * win.s).toBeLessThanOrEqual(400);
      /* The floor enlarges pane 3's type on a small still; the path and both copies still fit. */
      const unit = (size: number) => Math.max(size, TYPE_FLOOR / win.s);
      expect(mono('.claude/agents/reviewer.md', unit(TYPE.path))).toBeLessThanOrEqual(PANE3.right - PANE3.x);
      const column = (PANE3.box.w - 40 - 16) / 2;
      for (const row of DIFF_ROWS) for (const value of row ?? []) expect(mono(value, unit(TYPE.code)) + 10, value).toBeLessThanOrEqual(column);
    }
  });
});
