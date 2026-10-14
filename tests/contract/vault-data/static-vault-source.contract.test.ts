import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Single-source guard: in static mode the answer to which bundled vault is in use must come from
 * `resolveStaticVaultSource` / `useStaticVaultSource`. Walks with node:fs and asserts the file count,
 * since a missing external tool returns 0 hits quietly.
 */

const SRC_DIR = path.join(process.cwd(), 'src');

/** The one permitted area — the entity where the resolver lives. Only here is the raw JSON touched. */
const ALLOWED_PREFIX = path.join('src', 'entities', 'docs-vault');

/** Export names of the bundled vault's raw data. Screen code must not use them directly. */
const FORBIDDEN_BINDINGS = [
  'vaultManifest',
  'vaultContent',
  'sampleStorefrontManifest',
  'sampleStorefrontContent',
];

/** Captures an `import ... from '...'` whole, even spanning several lines. */
const IMPORT_STATEMENT = /import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;

/** Paths that bypass the entity and reach the JSON directly (`.../docs-vault/data/manifest.json`). */
const RAW_DATA_SPECIFIER = /docs-vault\/data\/[\w.-]+\.json$/;

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      collectSourceFiles(full, acc);
      continue;
    }
    if (!/\.tsx?$/.test(entry.name)) continue;
    if (/\.(test|spec)\.tsx?$/.test(entry.name)) continue;
    acc.push(full);
  }
  return acc;
}

function findViolations(source: string): string[] {
  const hits: string[] = [];
  for (const match of source.matchAll(IMPORT_STATEMENT)) {
    const clause = match[1];
    const specifier = match[2];
    if (RAW_DATA_SPECIFIER.test(specifier)) {
      hits.push(specifier);
      continue;
    }
    for (const binding of FORBIDDEN_BINDINGS) {
      if (new RegExp(`\\b${binding}\\b`).test(clause)) hits.push(binding);
    }
  }
  return [...new Set(hits)];
}

describe('static 볼트 단일 진입점 계약', () => {
  it('entities/docs-vault 바깥에서는 번들 볼트 원본을 직접 import 하지 않는다', () => {
    const files = collectSourceFiles(SRC_DIR);

    // The guard proves itself alive — if the walk breaks and reads 0 files, violations
    // are also 0 and it passes quietly. That failure is caught here first.
    expect(files.length).toBeGreaterThan(100);

    const offenders: string[] = [];
    for (const file of files) {
      const rel = path.relative(process.cwd(), file);
      if (rel.startsWith(ALLOWED_PREFIX)) continue;
      const violations = findViolations(readFileSync(file, 'utf8'));
      if (violations.length > 0) offenders.push(`${rel} → ${violations.join(', ')}`);
    }

    expect(
      offenders,
      [
        'Importing the bundled vault sources (the dogfood or storefront manifest and bodies) directly',
        'makes that one surface silently ignore the choice to view the sample business.',
        'Screen code uses useStaticVaultSource() instead, and code outside hooks uses',
        'resolveStaticVaultSource(source), so the manifest and bodies arrive as a pair.',
        'Offending files:',
        ...offenders,
      ].join('\n'),
    ).toEqual([]);
  });
});
