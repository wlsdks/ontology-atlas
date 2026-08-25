import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **The CLI speaks one language in the strings it prints.**
 *
 * ⚠️ **Why.** `documentation.md` settles authored contributor prose as English and names
 * `cli/templates/vault-ko/**` as the one intentionally localized CLI tree. `forbidden.md` says the
 * same from the other side. The CLI had drifted anyway: measured 2026-08-25, **140 lines across 23
 * files** carried Korean in strings the command prints, and sixteen of them switched language
 * *inside one sentence* — `Frontmatter + graph-reference check (…)` with a Korean clause in the
 * parenthesis. That reads badly in either language.
 *
 * Nothing caught it. `pnpm source:language` tokenizes **comments** and reported a clean zero the
 * whole time, because a string literal is not a comment. The debt was then paid rather than
 * recorded — all 140 lines translated in one round — so the baseline below is zero and any Hangul
 * this gate finds is new drift rather than an old file finally being seen.
 *
 * This counts code points. It does not pin anybody's sentence, which `documentation.md` forbids.
 */

const CLI_SOURCE_ROOT = join(process.cwd(), 'cli', 'src');

/**
 * ⚠️ The one file that must keep Hangul, and why the exception is a path rather than a count.
 *
 * `cli/src/lib/absorb.mjs` holds regexes that **match the user's own Korean document**: an
 * alternation of the Korean words for rule, policy and guide is how it recognises a policy heading
 * in a Korean CLAUDE.md. That is typed data in the same sense as `display_ko`, not prose the CLI
 * writes. Translating it would silently stop `absorb` reading Korean documents at all, which is the
 * opposite of what this gate is for.
 */
const KOREAN_MATCHER_DATA = new Set(['lib/absorb.mjs']);

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
});
