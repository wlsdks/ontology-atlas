// @vitest-environment node
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateScaleVault } from '../../../../../scripts/perf/gen-scale-vault.mjs';
import { buildMdEntry, createMetadataStringPool, mdEntryRowValue, type BuiltVaultEntry } from './md-entry';

/** Budgets of docs/specs/2026-11-20-performance-strategy.md, "S8 plan": the spine row and one row lookup. */
const MEDIAN_ROW_MAX_BYTES = 600;
const LOOKUP_PATHS = 2048;
const LOOKUP_MAX_BYTES = 4 * 1024 * 1024;
const DETAIL_FIELDS = ['headings', 'excerpt', 'wordCount'] as const;

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

describe('a generated 2,000-document key folder builds spine documents only', () => {
  const work = mkdtempSync(join(tmpdir(), 'atlas-spine-'));
  const built: BuiltVaultEntry[] = [];
  const rowBytes: number[] = [];

  beforeAll(() => {
    generateScaleVault(work, 2000, 'key');
    const intern = createMetadataStringPool();
    const files = readdirSync(work, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => join(entry.parentPath, entry.name))
      .sort();
    for (const file of files) {
      const relativePath = relative(work, file).split(sep).join('/');
      const entry = buildMdEntry({ relativePath, kind: 'md', handle: {} as FileSystemFileHandle }, readFileSync(file, 'utf8'), 1, intern);
      built.push(entry);
      const value = mdEntryRowValue(entry);
      if (value !== null) rowBytes.push(Buffer.byteLength(value));
    }
  });
  afterAll(() => rmSync(work, { recursive: true, force: true }));

  it('holds no detail field on any document or entry', () => {
    expect(built.length).toBeGreaterThanOrEqual(2000);
    const withDetail = built.filter(
      (entry) => 'linkContexts' in entry || DETAIL_FIELDS.some((field) => entry.doc && field in entry.doc),
    );
    expect(withDetail.map((entry) => entry.relativePath)).toEqual([]);
  });

  it('keeps the median stored row within its budget', () => {
    expect(rowBytes.length).toBeGreaterThanOrEqual(2000);
    const measured = median(rowBytes);
    console.info(`spine row: median ${measured} B, largest ${Math.max(...rowBytes)} B over ${rowBytes.length} rows`);
    expect(measured).toBeLessThanOrEqual(MEDIAN_ROW_MAX_BYTES);
  });

  it('keeps the rows one lookup returns within the reply budget', () => {
    const lookup = rowBytes.slice(0, LOOKUP_PATHS);
    const total = lookup.reduce((sum, bytes) => sum + bytes, 0);
    console.info(`one lookup: ${lookup.length} rows, ${(total / 1024).toFixed(0)} KiB`);
    expect(lookup.length).toBeGreaterThanOrEqual(2000);
    expect(total).toBeLessThanOrEqual(LOOKUP_MAX_BYTES);
  });
});
