#!/usr/bin/env node
/**
 * `pnpm harness:report` — what the fast-sensor lane and the stop-time reminder
 * actually did, so the hooks can be judged instead of trusted.
 *
 * **Why this exists.** The hooks landed with falsifiers written into their own
 * headers: remove the sensor if two weeks of use catch nothing, and fix the
 * stop reminder if it turns back sessions that edited nothing. Both statements
 * need a number, and a harness that cannot be measured is exactly the
 * unfalsifiable machinery this repository refuses elsewhere. The 2026-09-01
 * research put it plainly: evals gate harness changes at the top maturity tier,
 * and the first eval a harness owes is of itself.
 *
 * **What it reads** — local, gitignored session state under `.tmp/harness/`:
 * per-session edit ledgers, verification stamps, and the findings log. Nothing
 * leaves the machine, and nothing here is vault data.
 *
 * **What it deliberately does not claim.** It cannot measure the published
 * "explicit user correction" rate: `.ontology-atlas/activity.jsonl` records MCP
 * writes, not conversation turns. Reporting a number this data cannot support
 * would be the same false confidence the hooks exist to remove.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Resolved per call, not at import: a module-level constant captures the
// directory the process started in, which silently reports on the wrong
// repository from a worktree or a test fixture.
const harnessDir = () => join(process.cwd(), '.tmp', 'harness');

function parseArgs(argv) {
  const args = { json: false, days: 14 };
  for (const arg of argv) {
    if (arg === '--json') args.json = true;
    else if (arg.startsWith('--days=')) {
      const days = Number(arg.slice('--days='.length));
      if (!Number.isFinite(days) || days <= 0) {
        throw new Error(`--days must be a positive number; received ${arg}`);
      }
      args.days = days;
    } else if (arg !== '--') {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return args;
}

function readSessions(sinceMs) {
  const dir = harnessDir();
  if (!existsSync(dir)) return [];
  const byId = new Map();
  for (const name of readdirSync(dir)) {
    const match = /^session-(.+)\.(edits|verified)$/.exec(name);
    if (!match) continue;
    const [, id, kind] = match;
    const path = join(dir, name);
    const entry = byId.get(id) ?? { id, lastEdit: 0, lastVerified: 0, files: new Set() };
    try {
      if (kind === 'edits') {
        for (const line of readFileSync(path, 'utf8').split('\n')) {
          const [ts, file] = line.split('\t');
          const at = Number(ts);
          if (!file || !Number.isFinite(at)) continue;
          if (at > entry.lastEdit) entry.lastEdit = at;
          entry.files.add(file);
        }
      } else {
        const at = Number(readFileSync(path, 'utf8'));
        if (Number.isFinite(at)) entry.lastVerified = at;
      }
    } catch {
      continue; // an unreadable session file costs one row, never the report
    }
    byId.set(id, entry);
  }
  return [...byId.values()].filter(
    (session) => Math.max(session.lastEdit, session.lastVerified) >= sinceMs,
  );
}

function readFindings(sinceMs) {
  const path = join(harnessDir(), 'findings.jsonl');
  if (!existsSync(path)) return [];
  const rows = [];
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        const at = Date.parse(row?.at ?? '');
        if (Number.isFinite(at) && at >= sinceMs) rows.push({ ...row, atMs: at });
      } catch {
        continue; // a torn line costs one finding, never the report
      }
    }
  } catch {
    return [];
  }
  return rows;
}

export function buildHarnessReport({ days = 14, now = Date.now() } = {}) {
  const sinceMs = now - days * 24 * 60 * 60 * 1000;
  const sessions = readSessions(sinceMs);
  const findings = readFindings(sinceMs);

  const withEdits = sessions.filter((session) => session.files.size > 0);
  const unverified = withEdits.filter((session) => session.lastVerified < session.lastEdit);
  const byKind = {};
  for (const finding of findings) {
    const kind = typeof finding.kind === 'string' ? finding.kind : 'unknown';
    byKind[kind] = (byKind[kind] ?? 0) + 1;
  }

  return {
    windowDays: days,
    generatedAt: new Date(now).toISOString(),
    sessions: {
      total: sessions.length,
      withSourceEdits: withEdits.length,
      endedUnverified: unverified.length,
      filesTouched: new Set(withEdits.flatMap((session) => [...session.files])).size,
    },
    sensor: { findings: findings.length, byKind },
    /**
     * The sensor earns its place by catching things. Zero findings across a
     * window with real edits is the falsifier its own header names.
     */
    verdict:
      withEdits.length === 0
        ? 'no-data'
        : findings.length === 0
          ? 'sensor-caught-nothing'
          : 'sensor-earning-its-place',
  };
}

function format(report) {
  const { sessions, sensor } = report;
  const lines = [
    `[harness] last ${report.windowDays} day(s) · ${sessions.total} session(s) with local state`,
    `[harness] source-editing sessions=${sessions.withSourceEdits} · files=${sessions.filesTouched} · ended before verifying=${sessions.endedUnverified}`,
    `[harness] sensor findings=${sensor.findings}${
      sensor.findings > 0
        ? ` (${Object.entries(sensor.byKind)
            .sort((a, b) => b[1] - a[1])
            .map(([kind, count]) => `${kind} ${count}`)
            .join(' · ')})`
        : ''
    }`,
  ];
  if (report.verdict === 'no-data') {
    lines.push('[harness] no source-editing session recorded yet; the lane has nothing to answer for.');
  } else if (report.verdict === 'sensor-caught-nothing') {
    lines.push(
      '[harness] the sensor caught nothing in this window. Its own header says that is the',
      '[harness] falsifier: if this holds over two weeks of real work, remove the lane.',
    );
  }
  return lines.join('\n');
}

export function runHarnessReport(argv, io = console) {
  try {
    const args = parseArgs(argv);
    const report = buildHarnessReport({ days: args.days });
    io.log(args.json ? JSON.stringify(report, null, 2) : format(report));
    return 0;
  } catch (error) {
    io.error(`[harness] ${error.message}`);
    return 2;
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = runHarnessReport(process.argv.slice(2));
}
