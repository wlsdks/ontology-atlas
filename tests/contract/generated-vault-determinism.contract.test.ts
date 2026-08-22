import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Generated-manifest determinism guard — stops **generation time** leaking into
 * committed build output.
 *
 * Measured defect (2026-07-27): `manifest.json`'s `generatedAt` and each document's
 * `updatedAt` were recorded at git commit **timestamp** precision (`%cI`), falling
 * back to filesystem mtime (wall clock) when no commit time was found. But those
 * values describe the commit that contains them, and that commit's timestamp is
 * unknowable at generation time — GitHub squash-merge discards the PR branch's
 * commits and stamps a new one with a new time, and rebase and amend do the same.
 * So the baseline that landed on main was wrong for 1–32 documents **from birth**
 * (24 of the last 25 commits), and anyone regenerating later saw lines they had not
 * touched appear in their diff. The result was rebase conflicts on every PR,
 * unreviewable phantom diffs, and tsc breakage from conflict markers left inside
 * the JSON.
 *
 * The prescription is **date precision**: a merge restamping the time leaves the
 * value unchanged as long as it is the same day, and two branches that diverged on
 * the same day write the same string so git merges them automatically. Every
 * consumer works at day granularity or coarser ("N days ago" ladder, the last-7-days
 * lens, the weekly heatmap, sorting), so no accuracy is lost.
 *
 * This guard enforces that spec in code — a spec that lives only in a document is
 * not enforced. The determinism of the derivation itself (same source → same bytes,
 * resilience to commit-time restamping) is demonstrated against a temporary git
 * repository by the determinism-contract suite in
 * `scripts/build-docs-vault.test.mjs`.
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

describe.each(MANIFESTS)('%s — 커밋된 생성물에 벽시계가 없다', (name) => {
  const manifest = readManifest(name);

  it('문서가 실제로 들어 있다 (파서가 죽으면 이 가드가 먼저 터진다)', () => {
    expect(manifest.docs.length).toBeGreaterThan(10);
  });

  it('generatedAt 은 날짜(YYYY-MM-DD)뿐이다', () => {
    expect(manifest.generatedAt).toMatch(DAY_ONLY);
  });

  it('모든 문서의 updatedAt 이 날짜(YYYY-MM-DD)뿐이다', () => {
    const withTime = manifest.docs
      .filter((doc) => !DAY_ONLY.test(doc.updatedAt))
      .map((doc) => `${doc.slug}=${doc.updatedAt}`);
    expect(withTime).toEqual([]);
  });

  it('generatedAt 은 문서 날짜의 최대값이다 (빌드 시각이 아니다)', () => {
    const newest = manifest.docs
      .map((doc) => doc.updatedAt)
      .reduce((a, b) => (a >= b ? a : b));
    expect(manifest.generatedAt).toBe(newest);
  });
});

describe('build-docs-vault.mjs — 생성기가 벽시계를 읽지 않는다', () => {
  const source = readFileSync(
    path.join(process.cwd(), 'scripts', 'build-docs-vault.mjs'),
    'utf8',
  );

  it('현재 시각을 읽는 호출이 없다', () => {
    // The moment the generator reads "now", its output depends on when it ran and the
    // committed baseline shifts on every regeneration.
    const wallClockCalls = ['Date.now(', 'new Date()', 'toISOString('].filter(
      (needle) => source.includes(needle),
    );
    expect(wallClockCalls).toEqual([]);
  });

  it('git 날짜를 시각 정밀도로 읽지 않는다', () => {
    // `%cI`/`%aI` include the time — exactly the part squash-merge restamps. Use
    // `%cs`, which gives the date only.
    expect(source).not.toMatch(/%[ca]I/);
    expect(source).toContain('%cs');
  });

  it('직전 생성물을 입력으로 되먹이지 않는다', () => {
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
describe('워크플로 — 매니페스트를 만지는 잡은 전체 히스토리를 받는다', () => {
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

  it.each(MANIFEST_WORKFLOWS)('%s', (name) => {
    const yaml = readFileSync(path.join(WORKFLOW_DIR, name), 'utf8');
    const jobs = splitJobs(yaml);
    expect(jobs.length).toBeGreaterThan(0);

    const generatorJobs = jobs.filter((job) => RUNS_GENERATOR.test(job.body));
    // The reason a workflow is on this list is that it runs the generator — finding
    // none means the list is stale, which must fail first.
    expect(generatorJobs.map((job) => job.name).length).toBeGreaterThan(0);

    for (const job of generatorJobs) {
      expect(job.body, `${name} · ${job.name} 잡의 checkout`).toMatch(
        /uses: actions\/checkout@[^\n]*\n\s+with:\n\s+fetch-depth: 0/,
      );
    }
  });
});
