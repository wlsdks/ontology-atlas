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
 * lives in `mcp/src/absorb.mjs`, which the CLI re-exports.
 */
const KOREAN_MATCHER_DATA = new Set<string>([]);

/** Where the Korean matcher data lives now that the CLI re-exports it. */
const KOREAN_MATCHER_MODULE = join(process.cwd(), 'mcp', 'src', 'absorb.mjs');

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

describe('CLI가 찍는 말은 한 언어로 쓴다', () => {
  it('사용자에게 출력하는 파일에는 한글이 없다', () => {
    const files = collectSources(CLI_SOURCE_ROOT);
    // A silent zero would make this gate pass forever if the walk ever broke.
    expect(files.length).toBeGreaterThan(30);

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

  it('예외로 둔 파일은 실제로 한국어 문서를 읽는 데이터다', () => {
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

  it('한국어 문서를 읽는 매처는 사라진 게 아니라 mcp 로 옮겨갔다', () => {
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
