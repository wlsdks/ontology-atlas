import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Starter-vault language gate — **every** creation path builds the vault in the
 * screen's language.
 *
 * Walkthrough 2026-07-26 D2: on a Korean screen, "create a new vault → start fresh in
 * an empty folder" produced a starter with English bodies. The cause was
 * `scaffoldOntology()`'s default of `'en'` plus two paths that relied on that default
 * and passed no argument. When the same action produces a vault in a different
 * language depending on the entry path, the user cannot tell what they did wrong.
 *
 * The first line of defence is the type: `scaffoldOntology(starterLocale: string)` has
 * no default, so a missing argument fails to compile. This test is the second line and
 * blocks a **hardcoded locale string** — the type accepts `scaffoldOntology('en')`,
 * which is the same defect. The argument must be an identifier carrying the screen's
 * language.
 *
 * Only call sites are scanned; the type declaration
 * (`scaffoldOntology: (starterLocale: string) =>`) and the definition
 * (`const scaffoldOntology = useCallback(async (…)`) carry a type annotation in the
 * argument position and are filtered out naturally.
 */

const SRC_DIR = path.join(process.cwd(), 'src');

/** `…scaffoldOntology(<args>)` call sites. Requiring a leading `.` excludes the declaration and definition. */
const SCAFFOLD_CALL = /\.scaffoldOntology\(([^)]*)\)/g;

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
    const violations: string[] = [];
    for (const file of files) {
      const source = stripComments(readFileSync(file, 'utf8'));
      for (const match of source.matchAll(SCAFFOLD_CALL)) {
        const rel = path.relative(process.cwd(), file);
        const arg = match[1].trim();
        callSites.push(`${rel}: ${match[0]}`);
        if (!LOCALE_IDENTIFIER.test(arg)) {
          violations.push(`${rel}: ${match[0]}`);
        }
      }
    }

    // Guarantees the scanner saw real call sites — if a rename quietly takes the count to
    // 0, the gate must fail rather than pass.
    expect(
      callSites.length,
      'scaffoldOntology 호출부를 하나도 못 찾았다 — 게이트가 무력화됐다.',
    ).toBeGreaterThanOrEqual(4);

    expect(
      violations,
      `스타터 로케일을 빠뜨렸거나 하드코딩한 곳:\n${violations.join('\n')}\n` +
        `→ 화면 언어(useLocale())를 넘기세요.`,
    ).toEqual([]);
  });
});
