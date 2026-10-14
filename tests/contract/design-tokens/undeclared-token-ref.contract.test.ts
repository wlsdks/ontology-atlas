import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readGlobalCss } from '../../../scripts/lib/design/global-css.mjs';
import { blankComments } from '../../../scripts/quality/source-language/inventory.mjs';

/**
 * Blocks `var()` calling a token that does not exist: it becomes invalid at computed-value time and
 * drops the colour silently. Declared means `--name:` in `app/globals.css`, JS injection, a Tailwind
 * `[--name:value]` property or `next/font`; references with a fallback are exempt.
 */

const ROOT = process.cwd();
const SOURCE_ROOTS = ["src", "app"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
      continue;
    }
    if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const files = SOURCE_ROOTS.flatMap((root) => walk(path.join(ROOT, root)));
const sources = new Map(files.map((file) => [file, readFileSync(file, "utf8")]));

const DECLARATIONS = [
  /setProperty\(\s*['"](--[a-z0-9-]+)/g,
  // Style-object keys (`{ '--x': v }`) and Tailwind arbitrary properties (`[--x:v]`)
  /['"](--[a-z0-9-]+)['"]\s*:/g,
  /\[(--[a-z0-9-]+):/g,
  /variable:\s*['"](--[a-z0-9-]+)/g,
];
// Every match keeps one of these runs whole; a comment can sit only where a pattern allows space.
const DECLARATION_SHAPE = /setProperty\(|variable:|['"]--|\[--/;
const REFERENCE_SHAPE = /var\(/;

const blanked = new Map<string, string>();
/** The file's code, parsed only when its text has `shape`: without it, its code cannot match. */
function codeOf(file: string, shape: RegExp): string {
  const text = sources.get(file)!;
  if (!shape.test(text)) return "";
  let code = blanked.get(file);
  if (code === undefined) blanked.set(file, (code = blankComments(file, text) as string));
  return code;
}

function declarationsIn(code: string): string[] {
  return DECLARATIONS.flatMap((pattern) => Array.from(code.matchAll(pattern), (m) => m[1]));
}

function collectDeclared(): Set<string> {
  const css = readGlobalCss();
  const declared = new Set<string>(
    [...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]),
  );
  for (const file of files) {
    for (const name of declarationsIn(codeOf(file, DECLARATION_SHAPE))) declared.add(name);
  }
  return declared;
}

/** Only `var(--x)` without a fallback — with one, the render is defined and it is outside this gate. */
function undeclaredRefs(source: string, declared: Set<string>): string[] {
  return [...source.matchAll(/var\(\s*(--[a-z0-9-]+)\s*\)/g)]
    .map((m) => m[1])
    .filter((name) => !declared.has(name));
}

describe("없는 토큰을 부르는 var() — 조용히 깨지는 것을 막는다", () => {
  const declared = collectDeclared();

  it("src·app 의 모든 fallback 없는 var() 가 선언된 토큰을 가리킨다", () => {
    const violations: string[] = [];
    for (const file of files) {
      if (/\.test\.tsx?$/.test(file)) continue;
      for (const name of undeclaredRefs(codeOf(file, REFERENCE_SHAPE), declared)) {
        violations.push(`${path.relative(ROOT, file)} → ${name}`);
      }
    }
    expect(files.length, "the scan read no source files").toBeGreaterThan(1000);
    expect(violations).toEqual([]);
  });

  it("reads code, not comments — the probe", () => {
    const code = blankComments(
      "probe.ts",
      "// el.style.setProperty('--probe-ghost', '1px') would declare it; this comment does not.\n" +
        "/* var(--probe-retired) is history, not a reference. */\n" +
        "export const cls = 'h-[var(--probe-ghost)]';\n",
    ) as string;
    expect(declarationsIn(code)).toEqual([]);
    expect(undeclaredRefs(code, new Set())).toEqual(["--probe-ghost"]);
  });

  // A silently disabled detector fails here first. The check above claims "0
  // violations", and it must be possible to tell whether that 0 means "really
  // clean" or "the regex saw nothing".
  it("프로브 — 미선언 참조는 잡고, 선언·fallback·arbitrary property 는 통과시킨다", () => {
    const probe = new Set(["--color-real"]);
    expect(undeclaredRefs('var(--color-ghost)', probe)).toEqual(["--color-ghost"]);
    expect(undeclaredRefs('var(--color-real)', probe)).toEqual([]);
    // With a fallback the render is defined even without the token — exempt.
    expect(undeclaredRefs('var(--color-ghost, #08090a)', probe)).toEqual([]);
    // Declaring on the element and using it immediately is correct.
    const inline = 'className="[--cell:2rem] h-[var(--cell)]"';
    const inlineDeclared = new Set([
      ...probe,
      ...[...inline.matchAll(/\[(--[a-z0-9-]+):/g)].map((m) => m[1]),
    ]);
    expect(undeclaredRefs(inline, inlineDeclared)).toEqual([]);
  });

  // The name it actually caught — a regression fails here by name.
  it("2026-07-28 에 잡힌 유령 토큰이 되살아나지 않는다", () => {
    expect(declared.has("--color-status-warning-a36")).toBe(false);
    for (const file of files) {
      expect(codeOf(file, REFERENCE_SHAPE)).not.toContain(
        "var(--color-status-warning-a36)",
      );
    }
  });
});
