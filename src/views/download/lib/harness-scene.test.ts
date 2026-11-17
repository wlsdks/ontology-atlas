import { describe, expect, it } from 'vitest';

import { scanHarness, type HarnessScanPort } from '@/entities/agent-files';
import { buildHarnessSetup } from '@/views/architecture/model/harness-setup';

import {
  AREAS,
  EXAMPLE_FILES,
  PANE1_ROWS,
  PANE2,
  PANE3,
  SCAN,
  SETTINGS_LINES,
  TREE,
  TYPE,
  WINDOW,
  areaTotals,
  groupCounts,
  itemsOf,
  playingFrame,
  treeRowY,
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

  it('is 1040 wide on the page column at 1440, and stays above the caption on a short stage', () => {
    expect(playingFrame(1440, 200, 104, 702)).toEqual({ x: 200, y: 104, s: 1 });
    const short = playingFrame(1040, 200, 104, 531);
    expect(short.y + WINDOW.h * short.s).toBeLessThanOrEqual(531 + 0.5);
    expect(short.x).toBeGreaterThanOrEqual(32);
  });
});
