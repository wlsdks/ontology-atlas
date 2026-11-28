import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import playwrightConfig, { resolvePlaywrightWorkers } from '../../../playwright.config';
import { importCheckRules } from '../../../scripts/lib/ci/focused-check-suggestions.mjs';
import { MERGE_SMOKE_SPECS } from '../../../scripts/ci/merge-smoke-specs.mjs';
import { POST_MERGE_SPECS } from '../../e2e/post-merge-specs';
import { WEBSITE_SPECS } from '../../e2e/website-specs';

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
 * The indents come back too: inside a folded scalar (>-), **a more-indented continuation
 * line is not folded and stays a literal line**, so the runner would see two lines (the whole
 * suite without a shard, then exit 127). Joining hides that, so "shape" (uniform
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

describe('the merge smoke set every train runs holds only specs that exist', () => {
  it('is non-empty, has no duplicates and leaves the post-merge measurements out', () => {
    expect(MERGE_SMOKE_SPECS.length, 'a train would run nothing but its mapped specs').toBeGreaterThanOrEqual(5);
    expect(new Set(MERGE_SMOKE_SPECS).size).toBe(MERGE_SMOKE_SPECS.length);
    expect(MERGE_SMOKE_SPECS.filter((file) => (POST_MERGE_SPECS as readonly string[]).includes(file))).toEqual([]);
  });

  it.each([...MERGE_SMOKE_SPECS])('%s exists in tests/e2e', (file) => {
    expect(existsSync(join(E2E_DIR, file)), `${file} is missing — if renamed, fix merge-smoke-specs.mjs`).toBe(true);
  });
});

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
    // The `web-surface-smoke` job and `test:e2e:meaning-editor-built` name files directly. Putting
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
  'design-audits/focus-ring-contrast.spec.ts',
  'design-audits/hover-contrast.spec.ts',
  'design-audits/responsive-overflow-audit.spec.ts',
  'map/camera/camera-transition.spec.ts',
  'map/chrome/map-trail.spec.ts',
  'map/flat-graph/map-flat-graph-scale.spec.ts',
  'map/frame-loop/map-frame-allocation.spec.ts',
  'map/frame-loop/map-hover-release.spec.ts',
  'map/frame-loop/map-sleep-frames.spec.ts',
  'map/hex-board/map-hex-board.spec.ts',
  'map/hex-board/map-hex-frame-work.spec.ts',
  'map/neural/map-neural-grip.spec.ts',
  'map/neural/map-neural-lit.spec.ts',
  'typography/cjk-locale-sweep.spec.ts',
];

describe('post-merge specs reach the pull requests that change their owner', () => {
  it('maps every post-merge spec to a source owner unless it is a named sweep', async () => {
    const registry = await importCheckRules();
    const commands = [...registry.rules, ...registry.escalations].map((rule) => rule.command).join('\n');
    const unmapped = POST_MERGE_SPECS.filter((file) => !commands.includes(`tests/e2e/${file}`));
    expect([...unmapped].sort()).toEqual(UNMAPPED_POST_MERGE_SPECS);
  });
});

describe('the website specs list holds only specs that exist', () => {
  it('is non-empty and has no duplicates', () => {
    expect(WEBSITE_SPECS.length).toBeGreaterThanOrEqual(5);
    expect(new Set(WEBSITE_SPECS).size).toBe(WEBSITE_SPECS.length);
  });

  it.each([...WEBSITE_SPECS])('%s exists in tests/e2e', (file) => {
    // A renamed or deleted spec left in the list belongs to no website project, so it would run against the app folder.
    expect(existsSync(join(E2E_DIR, file)), `${file} is missing — if renamed, fix the list too`).toBe(true);
  });
});

describe('Playwright projects come from those two lists', () => {
  const projects = playwrightConfig.projects ?? [];
  const bothLists = POST_MERGE_SPECS.filter((file) => (WEBSITE_SPECS as readonly string[]).includes(file));

  it('there are four projects: the gate and the measurements, each on the app folder and on the site folder', () => {
    expect(projects.map((p) => p.name).sort()).toEqual(['post-merge', 'smoke', 'website', 'website-post-merge']);
  });

  it('every spec file on disk is in exactly one project: nothing is left over and nothing runs twice', () => {
    const specs = readdirSync(E2E_DIR, { recursive: true })
      .map((entry) => String(entry).split(sep).join('/'))
      .filter((entry) => entry.endsWith('.spec.ts'));
    expect(specs.length).toBeGreaterThan(100);
    // The projects name their specs by exact path (`**/<file>`); a wildcard here would need a real glob matcher.
    const selects = (patterns: unknown, file: string) =>
      [patterns].flat().some((pattern) => {
        expect(pattern, 'a project names its specs by exact path').toMatch(/^\*\*\/[^*?{}[\]]+$/);
        return (pattern as string).slice(3) === file;
      });
    const projectsOf = (file: string) =>
      projects
        .filter((p) => (p.testMatch === undefined || selects(p.testMatch, file)) && !(p.testIgnore !== undefined && selects(p.testIgnore, file)))
        .map((p) => p.name);
    const notOnce = specs.filter((file) => projectsOf(file).length !== 1).map((file) => `${file}: ${projectsOf(file).join(', ') || 'no project'}`);
    expect(notOnce).toEqual([]);
    // A list entry naming a spec that is not on disk would hide a rename.
    expect([...POST_MERGE_SPECS, ...WEBSITE_SPECS].filter((file) => !specs.includes(file))).toEqual([]);
    expect(bothLists.every((file) => projectsOf(file)[0] === 'website-post-merge')).toBe(true);
  });

  it('against the built folders the website projects read another origin than the app projects', async () => {
    vi.resetModules();
    for (const [name, value] of Object.entries({ CI: '1', PLAYWRIGHT_STATIC: '1', PLAYWRIGHT_BASE_URL: 'http://127.0.0.1:3110', PLAYWRIGHT_SITE_BASE_URL: '', PLAYWRIGHT_SURFACE: '' })) vi.stubEnv(name, value);
    try {
      const { default: built } = await import('../../../playwright.config');
      expect(Object.fromEntries((built.projects ?? []).map((p) => [p.name, p.use?.baseURL]))).toEqual({
        smoke: 'http://127.0.0.1:3110', 'post-merge': 'http://127.0.0.1:3110',
        website: 'http://127.0.0.1:3111', 'website-post-merge': 'http://127.0.0.1:3111',
      });
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});

describe('only the static export runs browser tests in parallel', () => {
  it('uses two workers on the CI runner, four locally, and one against the dev server', () => {
    expect(resolvePlaywrightWorkers({ CI: 'true', PLAYWRIGHT_STATIC: '1' })).toBe(2);
    expect(resolvePlaywrightWorkers({ CI: '1', PLAYWRIGHT_STATIC: '1' })).toBe(2);
    expect(resolvePlaywrightWorkers({ PLAYWRIGHT_STATIC: '1' })).toBe(4);
    expect(resolvePlaywrightWorkers({ CI: 'false', PLAYWRIGHT_STATIC: '1' })).toBe(4);
    expect(resolvePlaywrightWorkers({ CI: 'true' })).toBe(1);
    expect(resolvePlaywrightWorkers({})).toBe(1);
  });

  it('lets a machine shared by several sessions name its own count', () => {
    expect(resolvePlaywrightWorkers({ PLAYWRIGHT_STATIC: '1', PLAYWRIGHT_WORKERS: '2' })).toBe(2);
    expect(resolvePlaywrightWorkers({ PLAYWRIGHT_STATIC: '1', PLAYWRIGHT_WORKERS: 'many' })).toBe(4);
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
    // A more-indented line stays literal, the script becomes two lines, and line 2's
    // `--shard=…` exits 127; this assertion turns that diff red before it reaches CI.
    for (const block of suiteBlocks) {
      expect(
        new Set(block.indents).size,
        `The shard run block's continuation lines are not indented evenly (${block.indents.join(',')}). ` +
          'In a folded YAML scalar, a more-indented line becomes a separate literal line',
      ).toBeLessThanOrEqual(1);
    }
  });
});
