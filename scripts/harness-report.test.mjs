import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { buildHarnessReport, runHarnessReport } from './harness-report.mjs';

/**
 * The report is the instrument the hook falsifiers are written against, so its
 * own failure mode matters: a report that answers "nothing to see" from an
 * unreadable directory would retire a working sensor, and one that counts a
 * stale window would keep a dead one alive.
 */

function withHarnessState(state, run) {
  const dir = mkdtempSync(join(tmpdir(), 'harness-report-'));
  const previous = process.cwd();
  try {
    mkdirSync(join(dir, '.tmp', 'harness'), { recursive: true });
    for (const [name, content] of Object.entries(state)) {
      writeFileSync(join(dir, '.tmp', 'harness', name), content);
    }
    process.chdir(dir);
    return run();
  } finally {
    process.chdir(previous);
    rmSync(dir, { recursive: true, force: true });
  }
}

const NOW = Date.parse('2026-09-01T12:00:00.000Z');
const recent = NOW - 60_000;
const old = NOW - 40 * 24 * 60 * 60 * 1000;

describe('harness report', () => {
  it('counts edits, unverified stops, and findings by kind', () => {
    const report = withHarnessState(
      {
        'session-a.edits': `${recent}\tsrc/a.ts\n${recent}\tsrc/b.ts\n`,
        'session-b.edits': `${recent}\tsrc/c.ts\n`,
        'session-b.verified': String(recent + 1000),
        'findings.jsonl':
          `${JSON.stringify({ at: new Date(recent).toISOString(), session: 'a', kind: 'eslint' })}\n` +
          `${JSON.stringify({ at: new Date(recent).toISOString(), session: 'a', kind: 'em-dash' })}\n` +
          `${JSON.stringify({ at: new Date(recent).toISOString(), session: 'a', kind: 'eslint' })}\n`,
      },
      () => buildHarnessReport({ now: NOW }),
    );

    assert.equal(report.sessions.withSourceEdits, 2);
    assert.equal(report.sessions.filesTouched, 3);
    // Session b verified after its last edit; session a never did.
    assert.equal(report.sessions.endedUnverified, 1);
    assert.deepEqual(report.sensor.byKind, { eslint: 2, 'em-dash': 1 });
    assert.equal(report.verdict, 'sensor-earning-its-place');
  });

  it('reports the last smoke verdict per runtime and flags one older than the window', () => {
    const report = withHarnessState(
      {
        'smoke.jsonl':
          `${JSON.stringify({ at: new Date(old).toISOString(), runtime: 'claude', ok: true, problems: [] })}\n` +
          `${JSON.stringify({ at: new Date(recent).toISOString(), runtime: 'codex', ok: false, problems: ['Stop: 0 completed'] })}\n` +
          `${JSON.stringify({ at: new Date(recent - 5000).toISOString(), runtime: 'codex', ok: true, problems: [] })}\n`,
      },
      () => buildHarnessReport({ now: NOW }),
    );
    assert.equal(report.smoke.claude.ok, true);
    assert.equal(report.smoke.claude.stale, true, 'a pass from 40 days ago proves nothing about today');
    // The newest codex row wins, not the last one written.
    assert.equal(report.smoke.codex.ok, false);
    assert.deepEqual(report.smoke.codex.problems, ['Stop: 0 completed']);
  });

  it('reads the pre-push ledger into the same window as everything else', () => {
    const report = withHarnessState(
      {
        'prepush.jsonl':
          `${JSON.stringify({ at: new Date(recent).toISOString(), files: 3, lanes: ['lint'], failed: ['lint'] })}\n` +
          `${JSON.stringify({ at: new Date(recent).toISOString(), files: 1, lanes: ['docs'], failed: [] })}\n` +
          `${JSON.stringify({ at: new Date(old).toISOString(), files: 1, lanes: ['docs'], failed: ['docs'] })}\n`,
      },
      () => buildHarnessReport({ now: NOW }),
    );
    assert.deepEqual(report.prepush, { pushes: 2, blocked: 1, byLane: { lint: 1 } });
  });

  it('lists the inventoried skills and seats no session used in the 90-day window', () => {
    const dir = mkdtempSync(join(tmpdir(), 'harness-usage-'));
    const previous = process.cwd();
    try {
      for (const skill of ['po-pass', 'gate-probe']) mkdirSync(join(dir, '.claude', 'skills', skill), { recursive: true });
      mkdirSync(join(dir, '.claude', 'agents'), { recursive: true });
      for (const seat of ['chief', 'po-wedge']) writeFileSync(join(dir, '.claude', 'agents', `${seat}.md`), '# seat');
      mkdirSync(join(dir, '.tmp', 'harness'), { recursive: true });
      writeFileSync(
        join(dir, '.tmp', 'harness', 'usage.jsonl'),
        `${JSON.stringify({ at: new Date(recent).toISOString(), kind: 'skill', name: 'po-pass' })}\n` +
          `${JSON.stringify({ at: new Date(old).toISOString(), kind: 'agent', name: 'chief' })}\n` +
          `${JSON.stringify({ at: new Date(NOW - 100 * 24 * 60 * 60 * 1000).toISOString(), kind: 'skill', name: 'gate-probe' })}\n`,
      );
      process.chdir(dir);
      const report = buildHarnessReport({ now: NOW });
      assert.deepEqual(report.usage.skills, { total: 2, used: 1, unused: ['gate-probe'], counts: { 'po-pass': 1 } });
      // 40 days old is inside the 90-day usage window even though it is outside the 14-day sensor window.
      assert.deepEqual(report.usage.agents.unused, ['po-wedge']);
      assert.equal(report.usage.recorded, true);
    } finally {
      process.chdir(previous);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('says so when the smoke has never run, instead of staying silent', () => {
    const lines = [];
    withHarnessState({}, () => runHarnessReport([], { log: (line) => lines.push(line), error: () => {} }));
    assert.match(lines.join('\n'), /runtime smoke: never run here/);
  });

  it('names the sensor falsifier when real edits caught nothing', () => {
    const report = withHarnessState(
      { 'session-a.edits': `${recent}\tsrc/a.ts\n` },
      () => buildHarnessReport({ now: NOW }),
    );
    assert.equal(report.sensor.findings, 0);
    assert.equal(report.verdict, 'sensor-caught-nothing');
  });

  it('keeps a stale window from vouching for the lane', () => {
    const report = withHarnessState(
      {
        'session-old.edits': `${old}\tsrc/a.ts\n`,
        'findings.jsonl': `${JSON.stringify({ at: new Date(old).toISOString(), kind: 'eslint' })}\n`,
      },
      () => buildHarnessReport({ now: NOW }),
    );
    assert.equal(report.sessions.total, 0);
    assert.equal(report.sensor.findings, 0);
    assert.equal(report.verdict, 'no-data', 'an empty window must not read as a working sensor');
  });

  it('survives a torn findings line and an absent directory', () => {
    const torn = withHarnessState(
      {
        'session-a.edits': `${recent}\tsrc/a.ts\n`,
        'findings.jsonl': `{"at":"${new Date(recent).toISOString()}","kind":"eslint"}\n{ not json\n`,
      },
      () => buildHarnessReport({ now: NOW }),
    );
    assert.equal(torn.sensor.findings, 1);

    const empty = withHarnessState({}, () => buildHarnessReport({ now: NOW }));
    assert.equal(empty.verdict, 'no-data');
  });

  it('refuses an unusable window instead of reporting a wrong one', () => {
    const errors = [];
    const status = runHarnessReport(['--days=0'], { log() {}, error: (m) => errors.push(m) });
    assert.equal(status, 2);
    assert.match(errors[0], /--days/);
  });
});
