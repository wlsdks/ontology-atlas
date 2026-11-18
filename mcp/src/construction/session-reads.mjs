/**
 * The source lines this server process served through `analyze_repo_structure`
 * sourceReads: per repository root, each file with the line ranges and symbols read.
 * Outlines are not reads. The depth check asks this record, not a node's wording,
 * whether a capability's entry file was read; it lives as long as the process, so a
 * restarted server has none and says so instead of guessing.
 */

import { resolve } from 'node:path';

const READS = new Map();

function rootKey(rootPath) {
  return resolve(String(rootPath ?? ''));
}

/** Records every delivered line range, symbol read and context part in a `sourceEvidence:v1` packet. */
export function recordSourceEvidence(rootPath, packet) {
  if (!packet || !Array.isArray(packet.rows)) return;
  const key = rootKey(rootPath);
  const files = READS.get(key) ?? new Map();
  const add = (path, range) => {
    const ranges = files.get(path) ?? [];
    ranges.push(range);
    files.set(path, ranges);
  };
  for (const row of packet.rows) {
    if (row?.status !== 'read' || !row.actualRange || typeof row.path !== 'string') continue;
    add(row.path, {
      startLine: row.actualRange.startLine,
      endLine: row.actualRange.endLine,
      ...(row.symbol ? { symbol: row.symbol } : {}),
    });
    // The context a symbol read returned was served too: a caller's guard, a constructor, a callee.
    for (const part of Array.isArray(row.context) ? row.context : []) {
      if (typeof part?.path !== 'string' || !Number.isSafeInteger(part.startLine) || !Number.isSafeInteger(part.endLine)) continue;
      add(part.path, { startLine: part.startLine, endLine: part.endLine, symbol: part.symbol, role: part.role });
    }
  }
  if (files.size > 0) READS.set(key, files);
}

/** path -> ranges read under `rootPath` in this process; empty when nothing was read. */
export function sessionReads(rootPath) {
  return READS.get(rootKey(rootPath)) ?? new Map();
}

/** Forgets every recorded read; tests only. */
export function resetSessionReads() {
  READS.clear();
}
