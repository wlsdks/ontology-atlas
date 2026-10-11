import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Every starter-vault creation path builds in the screen language: `scaffoldOntology()` must receive
 * an identifier carrying the locale, not a hardcoded string, in either of the two call forms.
 */

const SRC_DIR = path.join(process.cwd(), 'src');

/** `…scaffoldOntology(<args>)` call sites. Requiring a leading `.` excludes the declaration and definition. */
const SCAFFOLD_CALL = /\.scaffoldOntology\(([^)]*)\)/g;

/** `starter: { locale: <arg>` — a creation door's starter request riding `open` / `openRecent`. */
const STARTER_REQUEST = /starter:\s*\{\s*locale:\s*([^,}\s]+)/g;

/** Identifiers that carry the screen's language (locale, activeLocale, starterLocale, …). */
const LOCALE_IDENTIFIER = /^[A-Za-z_$][\w$.]*$/;

/** A comment is not a call site — filters out mentions of `scaffoldOntology()` in prose. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      collectSourceFiles(full, acc);
    } else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

describe('스타터 볼트 언어 — 생성 경로 전부가 화면 언어를 넘긴다', () => {
  it('어떤 scaffoldOntology 호출도 로케일을 빠뜨리거나 하드코딩하지 않는다', () => {
    const files = collectSourceFiles(SRC_DIR);
    expect(files.length).toBeGreaterThan(20);

    const callSites: string[] = [];
    const starterRequests: string[] = [];
    const violations: string[] = [];
    for (const file of files) {
      const source = stripComments(readFileSync(file, 'utf8'));
      const rel = path.relative(process.cwd(), file);
      for (const match of source.matchAll(SCAFFOLD_CALL)) {
        // The locale is the first argument; a second one (the vault shape) is not judged here.
        const arg = (match[1].split(',')[0] ?? '').trim();
        callSites.push(`${rel}: ${match[0]}`);
        if (!LOCALE_IDENTIFIER.test(arg)) {
          violations.push(`${rel}: ${match[0]}`);
        }
      }
      for (const match of source.matchAll(STARTER_REQUEST)) {
        starterRequests.push(`${rel}: ${match[0]}`);
        if (!LOCALE_IDENTIFIER.test(match[1].trim())) {
          violations.push(`${rel}: ${match[0]}`);
        }
      }
    }

    // Guarantees the scanner saw real call sites of both forms — if a rename quietly takes
    // either count to 0, the gate must fail rather than pass.
    expect(
      callSites.length,
      'scaffoldOntology 호출부를 하나도 못 찾았다 — 게이트가 무력화됐다.',
    ).toBeGreaterThan(0);
    expect(
      starterRequests.length,
      '「starter: { locale }」 요청을 하나도 못 찾았다 — 만드는 문 두 곳이 게이트 밖으로 빠졌다.',
    ).toBeGreaterThan(0);
    expect(callSites.length + starterRequests.length).toBeGreaterThanOrEqual(4);

    expect(
      violations,
      `Sites that omit or hard-code the starter locale:\n${violations.join('\n')}\n` +
        `Pass the screen language (useLocale()).`,
    ).toEqual([]);
  });
});
