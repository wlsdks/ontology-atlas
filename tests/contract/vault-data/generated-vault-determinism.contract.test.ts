import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { FULL_LANE_COMMANDS } from '../../../scripts/ci/classify-change.mjs';

/**
 * Generated dates are day precision so a merge restamping the commit time leaves them unchanged
 * and branches diverging on the same day write identical strings.
 */

const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const DATA_DIR = path.join(
  process.cwd(),
  'src',
  'entities',
  'docs-vault',
  'data',
);

const MANIFESTS = [
  'manifest.json',
  'sample-storefront.manifest.json',
] as const;

interface GeneratedManifest {
  generatedAt: string;
  docs: ReadonlyArray<{ slug: string; updatedAt: string }>;
}

function readManifest(name: string): GeneratedManifest {
  return JSON.parse(
    readFileSync(path.join(DATA_DIR, name), 'utf8'),
  ) as GeneratedManifest;
}

describe.each(MANIFESTS)('%s: the committed output has no wall clock', (name) => {
  const manifest = readManifest(name);

  it('documents are really in it (if the parser dies this guard blows first)', () => {
    expect(manifest.docs.length).toBeGreaterThan(10);
  });

  it('generatedAt is a date only (YYYY-MM-DD)', () => {
    expect(manifest.generatedAt).toMatch(DAY_ONLY);
  });

  it('updatedAt of every document is a date only (YYYY-MM-DD)', () => {
    const withTime = manifest.docs
      .filter((doc) => !DAY_ONLY.test(doc.updatedAt))
      .map((doc) => `${doc.slug}=${doc.updatedAt}`);
    expect(withTime).toEqual([]);
  });

  it('generatedAt is the maximum of the document dates, not the build time', () => {
    const newest = manifest.docs
      .map((doc) => doc.updatedAt)
      .reduce((a, b) => (a >= b ? a : b));
    expect(manifest.generatedAt).toBe(newest);
  });
});

describe('build-docs-vault.mjs: the generator does not read the wall clock', () => {
  const scriptDir = path.join(process.cwd(), 'scripts', 'docs-vault');
  const partsDir = path.join(scriptDir, 'generator');
  const source = [
    path.join(scriptDir, 'build-docs-vault.mjs'),
    ...readdirSync(partsDir)
      .filter((name) => name.endsWith('.mjs') && !name.endsWith('.test.mjs'))
      .map((name) => path.join(partsDir, name)),
  ]
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');

  it('no call reads the current time', () => {
    // The moment the generator reads "now", its output depends on when it ran and the
    // committed baseline shifts on every regeneration.
    const wallClockCalls = ['Date.now(', 'new Date()', 'toISOString('].filter(
      (needle) => source.includes(needle),
    );
    expect(wallClockCalls).toEqual([]);
  });

  it('does not read git dates at time precision', () => {
    // `%cI`/`%aI` include the time — exactly the part squash-merge restamps. Use
    // `%cs`, which gives the date only.
    expect(source).not.toMatch(/%[ca]I/);
    expect(source).toContain('%cs');
  });

  it('does not feed the previous output back in as input', () => {
    // If output depends on the previous output, "same input → same bytes" does not
    // hold (losing the baseline changes the values).
    expect(source).not.toContain('previousManifest');
  });
});

/**
 * Any workflow that builds or verifies the manifest must check out **the full
 * history**. GitHub's default is depth 1, which makes the single commit a parentless
 * root, so `git log --name-only` attributes the entire tree to that one commit —
 * measured, 247 document paths all shared **one identical date**. Deployed in that
 * state, every document on the site looks like it changed today.
 */
describe('workflows: a job that touches the manifest gets the full history', () => {
  const WORKFLOW_DIR = path.join(process.cwd(), '.github', 'workflows');

  /** Workflows that run the generator directly (or via `pnpm build`). */
  const MANIFEST_WORKFLOWS = [
    'checks.yml',
    'deploy-pages.yml',
    'release-macos.yml',
  ] as const;

  /** Splits job bodies on the 2-space job headers under `jobs:`. */
  function splitJobs(yaml: string): Array<{ name: string; body: string }> {
    const jobsAt = yaml.indexOf('\njobs:\n');
    const region = jobsAt === -1 ? yaml : yaml.slice(jobsAt);
    const headers = [...region.matchAll(/^ {2}([A-Za-z0-9_-]+):$/gm)];
    return headers.map((match, index) => ({
      name: match[1],
      body: region.slice(
        match.index ?? 0,
        index + 1 < headers.length ? headers[index + 1].index : undefined,
      ),
    }));
  }

  /** Does it have a step that runs the generator directly (or via `pnpm build`)? */
  const RUNS_GENERATOR = /docs-vault:(build|check)|pnpm build\b/;

  function runsGenerator(name: string, body: string): boolean {
    if (RUNS_GENERATOR.test(body)) return true;
    return (
      name === 'checks.yml' &&
      /run-ci-lane\.mjs --lane=gates\b/.test(body) &&
      FULL_LANE_COMMANDS.gates.some((command) => RUNS_GENERATOR.test(command))
    );
  }

  it.each(MANIFEST_WORKFLOWS)('%s', (name) => {
    const yaml = readFileSync(path.join(WORKFLOW_DIR, name), 'utf8');
    const jobs = splitJobs(yaml);
    expect(jobs.length).toBeGreaterThan(0);

    const generatorJobs = jobs.filter((job) => runsGenerator(name, job.body));
    // The reason a workflow is on this list is that it runs the generator — finding
    // none means the list is stale, which must fail first.
    expect(generatorJobs.map((job) => job.name).length).toBeGreaterThan(0);

    for (const job of generatorJobs) {
      expect(job.body, `checkout of the ${name} / ${job.name} job`).toMatch(
        /uses: actions\/checkout@[^\n]*\n\s+with:\n\s+fetch-depth: 0/,
      );
    }
  });
});
