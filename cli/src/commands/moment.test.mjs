import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMoment } from './moment.mjs';
import { stampInitCompleted, stampMomentIfFirst } from '../lib/telemetry.mjs';

// `ontology-atlas moment [vault]` — Slice 0 magic-moment instrumentation
// readout (docs/PRODUCT-PLAN-2026-07.md §4/§9). See lib/telemetry.mjs for
// why only init / absorb --write / agent-brief are auto-stamped.

let tmp;
let vault;
let stdout;
let stderr;
let restoreWrite;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'ontology-atlas-moment-test-'));
  vault = join(tmp, 'vault');
  mkdirSync(vault, { recursive: true });
  stdout = [];
  stderr = [];
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = (chunk) => {
    stdout.push(String(chunk));
    return true;
  };
  process.stderr.write = (chunk) => {
    stderr.push(String(chunk));
    return true;
  };
  restoreWrite = () => {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  };
});

afterEach(() => {
  restoreWrite();
  rmSync(tmp, { recursive: true, force: true });
});

const ANSI_RE = /\x1b\[[0-9;]*m/g;
function stripAnsi(text) {
  return text.replace(ANSI_RE, '');
}

describe('runMoment', () => {
  it('reports no baseline yet when init/absorb never stamped', () => {
    const code = runMoment(['--vault', vault]);
    assert.equal(code, 0);
    const out = stripAnsi(stdout.join(''));
    assert.match(out, /no init\/absorb baseline yet/);
  });

  it('reports the init baseline and that the moment has not been reached yet', () => {
    stampInitCompleted(vault, '2026-07-17T12:00:00.000Z');
    const code = runMoment(['--vault', vault]);
    assert.equal(code, 0);
    const out = stripAnsi(stdout.join(''));
    assert.match(out, /2026-07-17T12:00:00\.000Z/);
    assert.match(out, /moment not reached yet/);
    assert.match(out, /agent-brief/);
    assert.match(out, /--mark/);
  });

  it('reports the elapsed time and within-target verdict once the moment is stamped', () => {
    stampInitCompleted(vault, '2026-07-17T12:00:00.000Z');
    stampMomentIfFirst(vault, { source: 'agent-brief', at: '2026-07-17T12:02:00.000Z' });
    const code = runMoment(['--vault', vault]);
    assert.equal(code, 0);
    const out = stripAnsi(stdout.join(''));
    assert.match(out, /agent-brief/);
    assert.match(out, /2m/);
    assert.match(out, /within.*5.?min|≤5min|target/i);
  });

  it('--mark stamps the moment now when it has not fired yet', () => {
    stampInitCompleted(vault, '2026-07-17T12:00:00.000Z');
    const code = runMoment(['--vault', vault, '--mark']);
    assert.equal(code, 0);
    const out = stripAnsi(stdout.join(''));
    assert.match(out, /manual/);
  });

  it('--mark is a no-op once a moment already exists', () => {
    stampInitCompleted(vault, '2026-07-17T12:00:00.000Z');
    stampMomentIfFirst(vault, { source: 'agent-brief', at: '2026-07-17T12:02:00.000Z' });
    runMoment(['--vault', vault, '--mark']);
    const out = stripAnsi(stdout.join(''));
    assert.match(out, /agent-brief/);
    assert.doesNotMatch(out, /manual/);
  });

  it('--json prints the momentSummary shape', () => {
    stampInitCompleted(vault, '2026-07-17T12:00:00.000Z');
    const code = runMoment(['--vault', vault, '--json']);
    assert.equal(code, 0);
    const data = JSON.parse(stdout.join(''));
    assert.equal(data.hasBaseline, true);
    assert.equal(data.initCompletedAt, '2026-07-17T12:00:00.000Z');
    assert.equal(data.moment, null);
  });

  it('exits 1 and errors on an unknown flag', () => {
    const code = runMoment(['--vault', vault, '--bogus']);
    assert.equal(code, 1);
    assert.match(stderr.join(''), /error/);
  });

  it('--help prints usage and exits 0 without touching anything', () => {
    const code = runMoment(['--help']);
    assert.equal(code, 0);
    assert.match(stdout.join(''), /Usage:/);
  });
});
