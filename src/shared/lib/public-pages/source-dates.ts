import { execFileSync } from 'node:child_process';

/**
 * Dates a public page's words by the commits that changed them, at build time. Search engines use
 * `lastmod`, `dateModified` and `datePublished` only when they are verifiably accurate, so a date
 * comes from Git or is omitted, never from the build clock. The deploy checks out full history
 * (`.github/workflows/deploy-pages.yml`); a shallow clone yields the one commit it has.
 */
const cache = new Map<string, string | undefined>();

function gitDates(args: string[]): string[] {
  const key = args.join('\u0000');
  if (!cache.has(key)) {
    try {
      cache.set(key, execFileSync('git', ['log', ...args], { encoding: 'utf8' }).trim() || undefined);
    } catch {
      cache.set(key, undefined);
    }
  }
  return cache.get(key)?.split('\n').filter(Boolean) ?? [];
}

/** The committer date (ISO 8601) of the last commit touching any of `paths`. */
export function lastCommitDate(paths: string[]): string | undefined {
  return gitDates(['-1', '--format=%cI', '--', ...paths])[0];
}

/** The committer date (ISO 8601) of the commit that first added `path`, followed across renames. */
export function firstCommitDate(path: string): string | undefined {
  return gitDates(['--follow', '--diff-filter=A', '--format=%cI', '--', path]).at(-1);
}
