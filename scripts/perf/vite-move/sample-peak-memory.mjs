import { setTimeout as sleep } from 'node:timers/promises';
import { createProcessTableReader } from './read-process-table.mjs';
import { sumProcessTree } from './sum-process-tree.mjs';

export const SAMPLE_INTERVAL_MS = 100;

/**
 * Samples the resident memory of `rootPid` and its descendants until `stop()` is called.
 * The next table is read one interval after the previous one finished, never overlapping it, so
 * a slow table read (a loaded machine, PowerShell) stretches the gap instead of piling up reads;
 * the longest gap that resulted is part of the answer.
 */
export function samplePeakMemory(rootPid, { intervalMs = SAMPLE_INTERVAL_MS } = {}) {
  const reader = createProcessTableReader();
  let running = true;
  let peak = { residentKb: 0, processCount: 0 };
  let sampleCount = 0;
  let maxGapMs = 0;
  let lastReadAt = null;

  const loop = (async () => {
    while (running) {
      const table = await reader.read();
      const now = performance.now();
      if (lastReadAt !== null) maxGapMs = Math.max(maxGapMs, now - lastReadAt);
      lastReadAt = now;
      sampleCount += 1;
      const tree = sumProcessTree(table, rootPid);
      if (tree.residentKb > peak.residentKb) peak = tree;
      await sleep(intervalMs);
    }
  })();

  return {
    async stop() {
      running = false;
      await loop;
      reader.close();
      return {
        peakResidentKb: peak.residentKb,
        peakProcessCount: peak.processCount,
        sampleCount,
        maxSampleGapMs: Math.round(maxGapMs),
      };
    },
  };
}
