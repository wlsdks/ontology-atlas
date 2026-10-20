import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import playwrightConfig, { resolvePlaywrightWorkers } from '../../../playwright.config';
import { loadCheckRules } from '../../../scripts/lib/ci/focused-check-suggestions.mjs';
import { POST_MERGE_SPECS } from '../../e2e/post-merge-specs';

/**
 * Watches the wiring of the PR-gate and post-merge-sweep split: the spec list
 * (`post-merge-specs.ts`), the projects (`playwright.config.ts`) and the workflow branch
 * (`e2e.yml`) drift without a visible signal. The workflow check reads run blocks only.
 */

const ROOT = process.cwd();
const E2E_DIR = join(ROOT, 'tests', 'e2e');
const workflow = readFileSync(join(ROOT, '.github', 'workflows', 'e2e.yml'), 'utf8');
const runner = readFileSync(join(ROOT, 'scripts', 'ci', 'run-ci-lane.mjs'), 'utf8');

it('CI rejects a focused test before accepting a partial run', () => {
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'atlas-focused-test-')));
  try {
    writeFileSync(join(scratch, 'playwright.config.ts'),
      `import base from ${JSON.stringify(join(ROOT, 'playwright.config.ts'))};\n` +
      `export default {...base, globalSetup: undefined, webServer: undefined, testDir: '.', projects: [{name: 'probe'}], outputDir: './results'};\n`);
    const spec = join(scratch, 'focused.spec.ts');
    const source = `import {test} from ${JSON.stringify(join(ROOT, 'node_modules/@playwright/test/index.mjs'))};\n` +
      `test.only('focused probe', () => {});\n`;
    const report = join(scratch, 'report.json');
    const run = () => spawnSync(process.execPath, [join(ROOT, 'node_modules/@playwright/test/cli.js'),
      'test', `--config=${join(scratch, 'playwright.config.ts')}`, '--reporter=json'], {
      cwd: scratch, encoding: 'utf8', timeout: 30_000,
      env: { ...process.env, CI: '1', PLAYWRIGHT_STATIC: '1', PLAYWRIGHT_JSON_OUTPUT_FILE: report },
    });
    writeFileSync(spec, source);
    const focused = run();
    expect(focused.status, focused.stderr).toBe(1);
    expect(JSON.parse(readFileSync(report, 'utf8')).errors.some((error: { message: string }) =>
      error.message.includes('.only') && error.message.includes('focused.spec.ts'))).toBe(true);
    writeFileSync(spec, source.replace('test.only(', 'test('));
    const complete = run();
    expect(complete.status, complete.stderr).toBe(0);
    expect(JSON.parse(readFileSync(report, 'utf8')).stats.expected).toBe(1);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

/**
 * Returns each `run:` block as {the folded single line, the list of continuation
 * indents} — comments cannot enter here.
 *
 * Why the indents come back too (measured on #1178's first run): inside a folded
 * scalar (>-), **a more-indented continuation line is not folded and stays a
 * literal line.** This parser joins everything, so it missed that trap and went
 * green, while on the real runner the script became two lines: line 1 ran the whole
 * suite without a shard and line 2 died with exit 127. So "shape" (uniform
 * indentation) is asserted separately from "content".
 */
function runBlocks(source: string): { text: string; indents: number[] }[] {
  const blocks: { text: string; indents: number[] }[] = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const match = /^(\s*)run:\s*(.*)$/.exec(lines[i]);
    if (!match) continue;
    const [, indent, inline] = match;
    const body: string[] = inline && !['|', '>-', '>', '|-'].includes(inline.trim()) ? [inline] : [];
    const indents: number[] = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j];
      if (line.trim() === '') continue;
      const lineIndent = line.length - line.trimStart().length;
      if (lineIndent <= indent.length) break;
      body.push(line.trim());
      indents.push(lineIndent);
    }
    blocks.push({ text: body.join(' '), indents });
  }
  return blocks;
}

describe('the post-merge sweep list holds only specs that exist', () => {
  it('is non-empty and has no duplicates', () => {
    expect(POST_MERGE_SPECS.length).toBeGreaterThanOrEqual(5);
    expect(new Set(POST_MERGE_SPECS).size).toBe(POST_MERGE_SPECS.length);
  });

  it.each([...POST_MERGE_SPECS])('%s exists in tests/e2e', (file) => {
    // A renamed or deleted spec left in the list belongs to no project and silently
    // disappears — that state is made red here.
    expect(existsSync(join(E2E_DIR, file)), `${file} is missing — if renamed, fix the list too`).toBe(
      true,
    );
  });

  it('specs that workflows or scripts call directly by file name cannot enter the list', () => {
    // The `web-surface-smoke` job and `test:e2e:static` name files directly. Putting
    // such a file in the post-merge list still runs it (a file argument beats a
    // project filter), but the job's reason for existing ("runs on every PR") and the
    // list's claim ("post-merge") would then contradict each other silently.
    const pkg = readFileSync(join(ROOT, 'package.json'), 'utf8');
    const invoked = [...(workflow + runner + pkg).matchAll(/tests\/e2e\/((?:[\w-]+\/)*[\w-]+\.spec\.ts)/g)].map(
      (m) => m[1],
    );
    expect(invoked.length, 'could not find a single directly invoked spec — the scanner is dead').toBeGreaterThan(0);
    for (const file of invoked) {
      expect(POST_MERGE_SPECS).not.toContain(file);
    }
  });
});

const UNMAPPED_POST_MERGE_SPECS = [
  'app-shell/route-cycle-leak.spec.ts',
  'app-shell/route-transition-input.spec.ts',
  'design-audits/control-row-geometry.spec.ts',
  'design-audits/cursor-affordance.spec.ts',
  'design-audits/focus-ring-contrast.spec.ts',
  'design-audits/hover-contrast.spec.ts',
  'design-audits/responsive-overflow-audit.spec.ts',
  'design-audits/screen-hierarchy.spec.ts',
  'design-audits/surface-vocabulary-ratchet.spec.ts',
  'gateway/gateway-idle-sleep.spec.ts',
  'map/3d/map-3d-grip.spec.ts',
  'map/3d/map-3d-lit-strata.spec.ts',
  'map/camera/camera-transition.spec.ts',
  'map/camera/offscreen-node-census.spec.ts',
  'map/chrome/map-toolbar-no-overlap.spec.ts',
  'map/chrome/map-trail.spec.ts',
  'map/flat-dial/map-flat-dial-frame-work.spec.ts',
  'map/frame-loop/map-frame-allocation.spec.ts',
  'map/frame-loop/map-hover-release.spec.ts',
  'map/frame-loop/map-sleep-frames.spec.ts',
  'map/frame-loop/nav-yield-map-frames.spec.ts',
  'map/hex-board/map-hex-board.spec.ts',
  'map/hex-board/map-hex-frame-work.spec.ts',
  'map/selection/datasheet-hover-map-brush.spec.ts',
  'typography/cjk-locale-sweep.spec.ts',
  'typography/korean-word-break.spec.ts',
  'wait-stage-placement.spec.ts',
];

describe('post-merge specs reach the pull requests that change their owner', () => {
  it('maps every post-merge spec to a source owner unless it is a named sweep', async () => {
    const registry = await loadCheckRules();
    const commands = [...registry.rules, ...registry.escalations].map((rule) => rule.command).join('\n');
    const unmapped = POST_MERGE_SPECS.filter((file) => !commands.includes(`tests/e2e/${file}`));
    expect([...unmapped].sort()).toEqual(UNMAPPED_POST_MERGE_SPECS);
  });
});

describe('Playwright projects come from that list', () => {
  const projects = playwrightConfig.projects ?? [];

  it('there are two projects, smoke and post-merge', () => {
    expect(projects.map((p) => p.name).sort()).toEqual(['post-merge', 'smoke']);
  });

  it('post-merge matches the list exactly, and smoke is its complement', () => {
    const globs = POST_MERGE_SPECS.map((file) => `**/${file}`);
    const smoke = projects.find((p) => p.name === 'smoke');
    const postMerge = projects.find((p) => p.name === 'post-merge');
    expect(postMerge?.testMatch).toEqual(globs);
    expect(smoke?.testIgnore).toEqual(globs);
  });
});

describe('only the static-export CI uses the runner\'s two CPUs', () => {
  it('raises workers to two only when CI and static export are declared together', () => {
    expect(resolvePlaywrightWorkers({ CI: 'true', PLAYWRIGHT_STATIC: '1' })).toBe(2);
    expect(resolvePlaywrightWorkers({ CI: '1', PLAYWRIGHT_STATIC: '1' })).toBe(2);
    expect(resolvePlaywrightWorkers({ CI: 'true' })).toBe(1);
    expect(resolvePlaywrightWorkers({ PLAYWRIGHT_STATIC: '1' })).toBe(1);
    expect(resolvePlaywrightWorkers({ CI: 'false', PLAYWRIGHT_STATIC: '1' })).toBe(1);
  });

  it('the loaded config resolves workers from the actual environment', () => {
    expect(playwrightConfig.workers).toBe(resolvePlaywrightWorkers(process.env));
  });
});

describe('workflow branches are alive', () => {
  const blocks = runBlocks(workflow);
  const suiteBlocks = blocks.filter((b) => b.text.includes('--shard='));

  it('the shard run block was really found — not green over an empty set', () => {
    expect(suiteBlocks.length, 'could not find the --shard run block in e2e.yml').toBeGreaterThan(0);
  });

  it('shard steps invoke the browser lane executor', () => {
    for (const block of suiteBlocks) {
      expect(block.text, 'workflow no longer calls the browser lane executor').toContain(
        'scripts/ci/run-ci-lane.mjs --lane=e2e',
      );
    }
  });

  it('no shard block has a further-indented continuation line — the literal trap of folded scalars', () => {
    // #1178's first run died in exactly this shape: a more-indented line stayed
    // literal, the script became two lines, and line 2's `--shard=…` exited 127. With
    // this assertion that diff goes red here, before it reaches CI.
    for (const block of suiteBlocks) {
      expect(
        new Set(block.indents).size,
        `The shard run block's continuation lines are not indented evenly (${block.indents.join(',')}). ` +
          'In a folded YAML scalar, a more-indented line becomes a separate literal line',
      ).toBeLessThanOrEqual(1);
    }
  });
});
