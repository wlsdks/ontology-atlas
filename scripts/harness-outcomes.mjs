#!/usr/bin/env node
/**
 * `pnpm harness:outcomes` — what the harness changed about outcomes, not about
 * itself.
 *
 * **Why this exists.** `pnpm harness:report` says what the hooks did: findings
 * caught, stops reminded, runtimes proved. None of that says whether the work
 * got better. The 2026-09-02 assessment scored the loop and observability
 * layers lowest for exactly that reason: the harness could count its own
 * activity and nothing downstream of it. Two numbers are downstream and cheap:
 *
 *   1. **Round-trips.** A push the local pre-push gate refused is a CI
 *      round-trip that did not happen; a PR commit whose CI checks failed is
 *      one that did. The ratio between them is the push gate's earned value.
 *   2. **Escaped defects.** `fix:` commits landing after a release tag are the
 *      defects that release shipped. Two full reviews found twenty confirmed
 *      defects in v1.0.0 (2026-09-01), none of which a shape check could have
 *      caught; this line keeps that count visible per release instead of once.
 *
 * **What it reads.** The local pre-push ledger (`.tmp/harness/prepush.jsonl`),
 * `git tag` and `git log` for releases, and, unless `--local` is passed, the
 * GitHub API through `gh` for merged pull requests and their per-commit check
 * runs. Nothing is written anywhere.
 *
 * **What it does not claim.** A commit with a failed check run is a round-trip,
 * not a defect: a flaky shard counts, and a failure fixed by a force-push of
 * the same commit is invisible. A `fix:` commit is a subject line, not a
 * verified escape. Both are lower-effort proxies, named as such.
 */

import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DAY_MS = 24 * 60 * 60 * 1000;

function run(bin, args, { cwd } = {}) {
  const result = spawnSync(bin, args, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return result.status === 0 ? result.stdout : null;
}

const execFileAsync = promisify(execFile);
async function runAsync(bin, args, { cwd } = {}) {
  try {
    const { stdout } = await execFileAsync(bin, args, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    return stdout;
  } catch {
    return null;
  }
}

/** Run `work(item)` over `items` with at most `limit` in flight; order is kept. */
async function mapPool(items, limit, work) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await work(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Local pre-push ledger: pushes attempted, pushes refused, refusals by lane. */
export function summarizePrepush(lines, sinceMs) {
  const summary = { pushes: 0, blocked: 0, byLane: {} };
  for (const line of lines) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    const at = Date.parse(row?.at ?? '');
    if (!Number.isFinite(at) || at < sinceMs) continue;
    summary.pushes += 1;
    const failed = Array.isArray(row.failed) ? row.failed : [];
    if (failed.length > 0) summary.blocked += 1;
    for (const lane of failed) summary.byLane[lane] = (summary.byLane[lane] ?? 0) + 1;
  }
  return summary;
}

export function readPrepush(cwd, sinceMs) {
  const path = join(cwd, '.tmp', 'harness', 'prepush.jsonl');
  if (!existsSync(path)) return null;
  try {
    return summarizePrepush(readFileSync(path, 'utf8').split('\n'), sinceMs);
  } catch {
    return null;
  }
}

/**
 * One merged pull request: how many of its commits reached CI with a failing
 * check, and which checks. `commits` is [{ sha, checkRuns: [{ name, conclusion }] }].
 */
export function summarizePullRequest(pr) {
  const failures = [];
  for (const commit of pr.commits) {
    const failed = (commit.checkRuns ?? []).filter((check) => check.conclusion === 'failure');
    if (failed.length > 0) failures.push({ sha: commit.sha.slice(0, 7), checks: [...new Set(failed.map((c) => c.name))] });
  }
  return {
    number: pr.number,
    title: pr.title,
    mergedAt: pr.mergedAt,
    commits: pr.commits.length,
    ciFailures: failures.length,
    failedChecks: failures,
  };
}

const parseJson = (text, fallback) => {
  try {
    return text ? JSON.parse(text) : fallback;
  } catch {
    return fallback;
  }
};

async function fetchMergedPullRequests(cwd, sinceMs) {
  // Listing commits inline for many PRs trips GitHub's GraphQL node limit
  // (measured 2026-09-02 at --limit 100), so the list is cheap and each PR in
  // the window is asked for its commits on its own. Serial calls measured
  // 4.5 minutes for a 14-day window here (this repository merges several PRs
  // a day), so the per-PR and per-commit reads run in a small pool.
  const out = run('gh', ['pr', 'list', '--state', 'merged', '--limit', '100', '--json', 'number,title,mergedAt'], { cwd });
  if (out === null) return null;
  const rows = parseJson(out, null);
  if (!Array.isArray(rows)) return null;
  const slug = run('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'], { cwd })?.trim();
  if (!slug) return null;
  const inWindow = rows.filter((row) => Date.parse(row.mergedAt) >= sinceMs);
  // 100 merged PRs inside the window means the list, not the window, set the
  // edge; the report says so rather than passing a partial count as a total.
  const capped = rows.length >= 100 && inWindow.length === rows.length;
  const pullRequests = await mapPool(inWindow, 6, async (row) => {
    const detail = await runAsync('gh', ['pr', 'view', String(row.number), '--json', 'commits'], { cwd });
    const listed = parseJson(detail, {}).commits ?? [];
    const commits = await mapPool(listed, 4, async (commit) => {
      const raw = await runAsync('gh', ['api', `repos/${slug}/commits/${commit.oid}/check-runs?per_page=100`], { cwd });
      const checkRuns = (parseJson(raw, {}).check_runs ?? []).map((c) => ({ name: c.name, conclusion: c.conclusion }));
      return { sha: commit.oid, checkRuns };
    });
    return summarizePullRequest({ number: row.number, title: row.title, mergedAt: row.mergedAt, commits });
  });
  return { pullRequests, capped };
}

/** Release intervals from an ordered tag list: each tag to the next, then the last to HEAD. */
export function releaseIntervals(tags, head = 'HEAD') {
  const releases = tags.filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag));
  const intervals = [];
  for (let i = 0; i < releases.length; i += 1) {
    intervals.push({ from: releases[i], to: releases[i + 1] ?? head });
  }
  return intervals;
}

/** `fix:` subjects among a list of commit subjects. */
export function countFixes(subjects) {
  const total = subjects.filter((s) => s.trim()).length;
  const fixes = subjects.filter((s) => /^fix(?:\(.*\))?:/.test(s.trim())).length;
  return { total, fixes };
}

export function readReleases(cwd) {
  const tags = run('git', ['tag', '--sort=creatordate'], { cwd });
  if (tags === null) return [];
  return releaseIntervals(tags.split('\n').filter(Boolean)).map((interval) => {
    const log = run('git', ['log', '--format=%s', `${interval.from}..${interval.to}`], { cwd }) ?? '';
    return { ...interval, ...countFixes(log.split('\n')) };
  });
}

export async function buildOutcomes({ days = 14, now = Date.now(), cwd = process.cwd(), remote = true } = {}) {
  const sinceMs = now - days * DAY_MS;
  const prepush = readPrepush(cwd, sinceMs);
  const fetched = remote ? await fetchMergedPullRequests(cwd, sinceMs) : null;
  const pullRequests = fetched?.pullRequests ?? null;
  const releases = readReleases(cwd).slice(-4);
  const escaped = pullRequests ? pullRequests.reduce((sum, pr) => sum + pr.ciFailures, 0) : null;
  return {
    windowDays: days,
    generatedAt: new Date(now).toISOString(),
    prepush,
    pullRequests,
    pullRequestsCapped: fetched?.capped ?? false,
    roundTrips: {
      blockedLocally: prepush?.blocked ?? null,
      escapedToCi: escaped,
    },
    releases,
  };
}

function format(report) {
  const lines = [`[outcomes] last ${report.windowDays} day(s)`];
  const { prepush, pullRequests, roundTrips, releases } = report;
  if (prepush === null) {
    lines.push('[outcomes] pre-push: no ledger yet; the gate writes one per push from 2026-09-02 on.');
  } else {
    const byLane = Object.entries(prepush.byLane)
      .sort((a, b) => b[1] - a[1])
      .map(([lane, n]) => `${lane} ${n}`)
      .join(' · ');
    lines.push(`[outcomes] pre-push: pushes=${prepush.pushes} · refused locally=${prepush.blocked}${byLane ? ` (${byLane})` : ''}`);
  }
  if (pullRequests === null) {
    lines.push('[outcomes] CI: not read (pass without --local and sign in to gh to count escaped round-trips).');
  } else {
    lines.push(
      `[outcomes] CI: merged PRs=${pullRequests.length}${report.pullRequestsCapped ? ' (list capped at 100; the window is wider)' : ''} · commits that failed CI=${roundTrips.escapedToCi}`,
    );
    for (const pr of pullRequests.filter((p) => p.ciFailures > 0)) {
      lines.push(`[outcomes]   #${pr.number} ${pr.ciFailures}/${pr.commits} commits: ${pr.failedChecks.map((f) => `${f.sha} (${f.checks.join(', ')})`).join('; ')}`);
    }
    if (roundTrips.blockedLocally !== null) {
      const total = roundTrips.blockedLocally + roundTrips.escapedToCi;
      lines.push(
        total === 0
          ? '[outcomes] round-trips: none in either place; nothing to judge yet.'
          : `[outcomes] round-trips: ${roundTrips.blockedLocally} caught locally, ${roundTrips.escapedToCi} escaped to CI (${Math.round((100 * roundTrips.blockedLocally) / total)}% local).`,
      );
    }
  }
  if (releases.length > 0) {
    lines.push(`[outcomes] fixes after release: ${releases.map((r) => `${r.from}→${r.to} ${r.fixes}/${r.total}`).join(' · ')}`);
  }
  return lines.join('\n');
}

function parseArgs(argv) {
  const args = { json: false, days: 14, remote: true };
  for (const arg of argv) {
    if (arg === '--json') args.json = true;
    else if (arg === '--local') args.remote = false;
    else if (arg.startsWith('--days=')) {
      const days = Number(arg.slice('--days='.length));
      if (!Number.isFinite(days) || days <= 0) throw new Error(`--days must be a positive number; received ${arg}`);
      args.days = days;
    } else if (arg !== '--') throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

export async function runHarnessOutcomes(argv, io = console) {
  try {
    const args = parseArgs(argv);
    const report = await buildOutcomes({ days: args.days, remote: args.remote });
    io.log(args.json ? JSON.stringify(report, null, 2) : format(report));
    return 0;
  } catch (error) {
    io.error(`[outcomes] ${error.message}`);
    return 2;
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await runHarnessOutcomes(process.argv.slice(2));
}
