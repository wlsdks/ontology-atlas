import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Single-source guard: in static mode the answer to which bundled vault is in use must come from
 * `useStaticVaultSource`, which downloads the sample on demand and never in the installed app.
 * `resolveStaticVaultSource` statically imports all five JSON files, so only the build-time and
 * `/download` callers named below may use it. Walks with node:fs and asserts the file count, since a
 * missing external tool returns 0 hits quietly.
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

/**
 * The only files outside the entity that may take bundled JSON statically. Anything else would put
 * the bundled vault back into every route's first load (docs/DECISIONS.md, 2026-07-28, 2026-08-30).
 * `resolveStaticVaultSource` carries all five files and runs only at build time; `dogfoodManifest` is
 * the one manifest `/download` draws before first paint.
 */
const STATIC_IMPORTERS: Record<string, Set<string>> = {
  resolveStaticVaultSource: new Set([
    path.join('src', 'views', 'gateway-doc', 'lib', 'read-vault-doc.ts'),
  ]),
  dogfoodManifest: new Set([
    path.join('src', 'features', 'vault-ontology', 'model', 'use-dogfood-insight.ts'),
  ]),
};

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

describe('static vault single entry point contract', () => {
  it('nothing outside entities/docs-vault imports the bundled vault source directly', () => {
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
        'Screen code uses useStaticVaultSource() instead, so the manifest and bodies arrive as a pair',
        'and only when a web screen shows them.',
        'Offending files:',
        ...offenders,
      ].join('\n'),
    ).toEqual([]);
  });

  it('only the named files take the bundled vault as a static import', () => {
    const used = new Map<string, string[]>();
    for (const file of collectSourceFiles(SRC_DIR)) {
      const rel = path.relative(process.cwd(), file);
      if (rel.startsWith(ALLOWED_PREFIX)) continue;
      const text = readFileSync(file, 'utf8');
      for (const binding of Object.keys(STATIC_IMPORTERS)) {
        if (new RegExp(`\\b${binding}\\b`).test(text)) {
          used.set(binding, [...(used.get(binding) ?? []), rel]);
        }
      }
    }
    for (const [binding, allowed] of Object.entries(STATIC_IMPORTERS)) {
      const callers = used.get(binding) ?? [];
      expect(
        callers.filter((rel) => !allowed.has(rel)),
        `${binding} imports bundled vault JSON statically; screen code uses useStaticVaultSource().`,
      ).toEqual([]);
      // Alive both ways: a renamed caller must leave the list rather than rot in it.
      expect([...allowed].filter((rel) => !callers.includes(rel))).toEqual([]);
    }
  });
});
