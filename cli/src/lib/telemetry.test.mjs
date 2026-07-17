import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  MOMENT_TARGET_MS,
  TELEMETRY_RELATIVE_PATH,
  momentSummary,
  readTelemetry,
  stampAbsorbWriteCompleted,
  stampInitCompleted,
  stampMomentIfFirst,
} from './telemetry.mjs';

function withTempVault(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'oatlas-telemetry-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('telemetry (Slice 0 magic-moment instrumentation)', () => {
  it('returns an empty-but-shaped record when no telemetry file exists yet', () => {
    withTempVault((vaultRoot) => {
      const telemetry = readTelemetry(vaultRoot);
      assert.equal(telemetry.initCompletedAt, null);
      assert.equal(telemetry.absorbWriteCompletedAt, null);
      assert.equal(telemetry.moment, null);
    });
  });

  it('stamps initCompletedAt into .ontology-atlas/telemetry.local.json (local only)', () => {
    withTempVault((vaultRoot) => {
      stampInitCompleted(vaultRoot, '2026-07-17T12:00:00.000Z');
      const filePath = join(vaultRoot, TELEMETRY_RELATIVE_PATH);
      const onDisk = JSON.parse(readFileSync(filePath, 'utf-8'));
      assert.equal(onDisk.initCompletedAt, '2026-07-17T12:00:00.000Z');
      assert.match(onDisk['//'], /local only, never transmitted/);

      const telemetry = readTelemetry(vaultRoot);
      assert.equal(telemetry.initCompletedAt, '2026-07-17T12:00:00.000Z');
    });
  });

  it('stamps absorbWriteCompletedAt without clobbering an existing initCompletedAt', () => {
    withTempVault((vaultRoot) => {
      stampInitCompleted(vaultRoot, '2026-07-17T12:00:00.000Z');
      stampAbsorbWriteCompleted(vaultRoot, '2026-07-17T12:01:00.000Z');
      const telemetry = readTelemetry(vaultRoot);
      assert.equal(telemetry.initCompletedAt, '2026-07-17T12:00:00.000Z');
      assert.equal(telemetry.absorbWriteCompletedAt, '2026-07-17T12:01:00.000Z');
    });
  });

  it('recovers from a corrupt telemetry file instead of throwing', () => {
    withTempVault((vaultRoot) => {
      const filePath = join(vaultRoot, TELEMETRY_RELATIVE_PATH);
      stampInitCompleted(vaultRoot, '2026-07-17T12:00:00.000Z');
      // corrupt it
      writeFileSync(filePath, '{ not json', 'utf-8');
      const telemetry = readTelemetry(vaultRoot);
      assert.equal(telemetry.initCompletedAt, null);
    });
  });

  it('stampMomentIfFirst records elapsed time from the init baseline and only fires once', () => {
    withTempVault((vaultRoot) => {
      stampInitCompleted(vaultRoot, '2026-07-17T12:00:00.000Z');
      const first = stampMomentIfFirst(vaultRoot, {
        source: 'agent-brief',
        at: '2026-07-17T12:03:00.000Z',
      });
      assert.equal(first.moment.source, 'agent-brief');
      assert.equal(first.moment.elapsedMs, 180000);

      // second call must not overwrite the first moment
      const second = stampMomentIfFirst(vaultRoot, {
        source: 'manual',
        at: '2026-07-17T12:10:00.000Z',
      });
      assert.equal(second.moment.source, 'agent-brief');
      assert.equal(second.moment.elapsedMs, 180000);
    });
  });

  it('stampMomentIfFirst prefers the later of init/absorb as the baseline', () => {
    withTempVault((vaultRoot) => {
      stampInitCompleted(vaultRoot, '2026-07-17T12:00:00.000Z');
      stampAbsorbWriteCompleted(vaultRoot, '2026-07-17T12:05:00.000Z');
      const stamped = stampMomentIfFirst(vaultRoot, {
        source: 'agent-brief',
        at: '2026-07-17T12:06:00.000Z',
      });
      assert.equal(stamped.moment.elapsedMs, 60000);
    });
  });

  it('stampMomentIfFirst records a null elapsedMs when there is no baseline yet', () => {
    withTempVault((vaultRoot) => {
      const stamped = stampMomentIfFirst(vaultRoot, { source: 'agent-brief' });
      assert.equal(stamped.moment.elapsedMs, null);
    });
  });

  it('momentSummary reports whether the north-star ≤5min target was met', () => {
    withTempVault((vaultRoot) => {
      assert.deepEqual(momentSummary(vaultRoot), {
        hasBaseline: false,
        initCompletedAt: null,
        absorbWriteCompletedAt: null,
        moment: null,
        targetMs: MOMENT_TARGET_MS,
        withinTarget: null,
      });

      stampInitCompleted(vaultRoot, '2026-07-17T12:00:00.000Z');
      stampMomentIfFirst(vaultRoot, { source: 'agent-brief', at: '2026-07-17T12:01:00.000Z' });
      const within = momentSummary(vaultRoot);
      assert.equal(within.hasBaseline, true);
      assert.equal(within.withinTarget, true);
    });
  });

  it('momentSummary reports withinTarget:false past the 5-minute north star', () => {
    withTempVault((vaultRoot) => {
      stampInitCompleted(vaultRoot, '2026-07-17T12:00:00.000Z');
      stampMomentIfFirst(vaultRoot, { source: 'agent-brief', at: '2026-07-17T12:06:00.000Z' });
      const summary = momentSummary(vaultRoot);
      assert.equal(summary.withinTarget, false);
    });
  });
});
