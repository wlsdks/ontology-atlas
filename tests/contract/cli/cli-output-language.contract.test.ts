import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Strings the CLI prints are English. `pnpm source:language` tokenizes only comments, so this
 * counts Hangul code points in string literals under `cli/src` against a baseline of zero.
 */

const CLI_SOURCE_ROOT = join(process.cwd(), 'cli', 'src');

/**
 * Files under `cli/src` allowed to keep Hangul, by path. The set is empty: the Korean matcher data
 * lives in `mcp/src/vault/absorb.mjs`, which the CLI re-exports.
 */
const KOREAN_MATCHER_DATA = new Set<string>([]);

/** Where the Korean matcher data lives now that the CLI re-exports it. */
const KOREAN_MATCHER_MODULE = join(process.cwd(), 'mcp', 'src', 'vault', 'absorb.mjs');

/** Test names in this repository are Korean by convention; this gate is about printed output. */
const isScannedSource = (name: string) => name.endsWith('.mjs') && !name.endsWith('.test.mjs');

function collectSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectSources(full));
      continue;
    }
    if (isScannedSource(entry)) out.push(full);
  }
  return out;
}

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/u;

describe('what the CLI prints is written in one language', () => {
  it('files that print to the user contain no Hangul', () => {
    const files = collectSources(CLI_SOURCE_ROOT);
    // A silent zero would make this gate pass forever if the walk ever broke.
    expect(files.length).toBeGreaterThan(10);

    const offenders = files
      .map((file) => ({ file, rel: relative(CLI_SOURCE_ROOT, file).replaceAll('\\', '/') }))
      .filter(({ rel }) => !KOREAN_MATCHER_DATA.has(rel))
      .flatMap(({ file, rel }) =>
        readFileSync(file, 'utf-8')
          .split('\n')
          .map((line, index) => ({ rel, line: index + 1, text: line.trim() }))
          .filter((row) => HANGUL.test(row.text)),
      )
      .map((row) => `${row.rel}:${row.line}  ${row.text.slice(0, 90)}`);

    expect(offenders).toEqual([]);
  });

  it('the excepted files are data that really read Korean documents', () => {
    // ⚠️ Without this the allowlist could quietly grow to cover a file that simply was not
    // translated, and the gate above would keep passing while the drift came back.
    for (const rel of KOREAN_MATCHER_DATA) {
      const source = readFileSync(join(CLI_SOURCE_ROOT, rel), 'utf-8');
      const hangulLines = source.split('\n').filter((line) => HANGUL.test(line));
      expect(hangulLines.length).toBeGreaterThan(0);
      for (const line of hangulLines) {
        expect(line).toMatch(/\/\(|\[\^|replace\(/);
      }
    }
  });

  it('the matcher that reads Korean documents did not vanish but moved to mcp', () => {
    // The loop above runs over an empty set; this locates the Korean matcher data where the CLI
    // re-exports it from, which the CLI-only scan cannot see.
    const hangulLines = readFileSync(KOREAN_MATCHER_MODULE, 'utf-8')
      .split('\n')
      .filter((line) => HANGUL.test(line));
    expect(hangulLines.length).toBeGreaterThan(0);
    for (const line of hangulLines) {
      expect(line).toMatch(/\/\(|\[\^|replace\(/);
    }
  });
});
