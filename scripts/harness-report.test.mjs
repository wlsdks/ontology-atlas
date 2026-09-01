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
