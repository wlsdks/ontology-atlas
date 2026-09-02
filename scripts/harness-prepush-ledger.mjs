#!/usr/bin/env node
/**
 * Append one pre-push outcome to the local harness ledger.
 *
 * Called by `.githooks/pre-push` after its lanes finish, pass or fail. The hook
 * is the layer that turns an eight-minute CI round-trip into a local one, and
 * until 2026-09-02 nothing counted how often it did: the report could say what
 * the edit-time sensor caught, but not whether the push gate ever refused a
 * push, which is the number that says whether the gate is worth its minutes.
 *
 * Written from Node rather than in the hook's POSIX shell so the JSON is
 * always well-formed and the shape is unit-tested; the hook only hands over
 * three strings. Local and gitignored under `.tmp/harness/`, like every other
 * harness measurement.
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const words = (value) => String(value ?? '').split(/\s+/).filter(Boolean);

export function prepushRecord({ files, lanes, failed, now = Date.now() }) {
  const count = Number(files);
  return {
    at: new Date(now).toISOString(),
    files: Number.isFinite(count) ? count : 0,
    lanes: words(lanes),
    failed: words(failed),
  };
}

export function appendPrepushRecord(input, { cwd = process.cwd() } = {}) {
  const record = prepushRecord(input);
  const dir = join(cwd, '.tmp', 'harness');
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, 'prepush.jsonl'), JSON.stringify(record) + '\n');
  return record;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const [files, lanes, failed] = process.argv.slice(2);
  try {
    appendPrepushRecord({ files, lanes, failed });
  } catch {
    // The ledger is a measurement; a failed write must never change a push's fate.
  }
}
