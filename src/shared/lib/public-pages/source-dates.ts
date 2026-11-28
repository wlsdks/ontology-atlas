import { execFile, execFileSync } from 'node:child_process';

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

const asking = new Map<string, Promise<string[]>>();

/**
 * The same answer as `gitDates`, asked without waiting: several questions run as Git processes at once, which a
 * prerender of many pages needs, since each `--follow` walk of the history takes tens of milliseconds. Both ways
 * share one cache, so a question asked either way is asked of Git once.
 */
function gitDatesAsync(args: string[]): Promise<string[]> {
  const key = args.join('\u0000');
  const known = cache.get(key);
  if (cache.has(key)) return Promise.resolve(known?.split('\n').filter(Boolean) ?? []);
  let pending = asking.get(key);
  if (!pending) {
    pending = new Promise<string[]>((resolve) => {
      execFile('git', ['log', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }, (error, stdout) => {
        cache.set(key, error ? undefined : stdout.trim() || undefined);
        asking.delete(key);
        resolve(cache.get(key)?.split('\n').filter(Boolean) ?? []);
      });
    });
    asking.set(key, pending);
  }
  return pending;
}

/** The committer date (ISO 8601) of the last commit touching any of `paths`. */
export function lastCommitDate(paths: string[]): string | undefined {
  return gitDates(['-1', '--format=%cI', '--', ...paths])[0];
}

/** The committer date (ISO 8601) of the commit that first added `path`, followed across renames. */
export function firstCommitDate(path: string): string | undefined {
  return gitDates(['--follow', '--diff-filter=A', '--format=%cI', '--', path]).at(-1);
}

export async function lastCommitDateAsync(paths: string[]): Promise<string | undefined> {
  return (await gitDatesAsync(['-1', '--format=%cI', '--', ...paths]))[0];
}

export async function firstCommitDateAsync(path: string): Promise<string | undefined> {
  return (await gitDatesAsync(['--follow', '--diff-filter=A', '--format=%cI', '--', path])).at(-1);
}
