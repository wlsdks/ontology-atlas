import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Blocks **`var()` calling a token that does not exist** — a gate for the class of
 * defects that break silently.
 *
 * **Why lint cannot do this in principle.** `var(--color-status-warning-a36)` is
 * **a perfectly valid string syntactically**. Whether the token is declared can
 * only be known from a list in *another file* (`app/globals.css`), and
 * `no-restricted-syntax` matches AST selectors within one file and cannot express
 * that verdict. The same reason `type-ramp-step-defined` exists.
 *
 * **What it caught (measured 2026-07-28).** The "cannot start the MCP server"
 * warning card in
 * `src/features/docs-vault-local/ui/AgentClientButtons.tsx` called
 * `--color-status-warning-a36/-a10` and **neither was declared anywhere**. An
 * undefined `var()` becomes invalid at computed-value time, so `border-color`
 * falls back to `currentColor` and `background-color` to `transparent` — the
 * warning card was rendering with none of its warning colour, while passing tsc,
 * eslint, and the full test suite.
 *
 * This is the same family as the `text-large` incident: **something that does not
 * exist leaves no literal either, so it is outside the reach of hardcoded-value
 * checks.**
 *
 * **What counts as "declared."** The union of these sources, all of which really
 * produce a value at runtime:
 * 1. A `--name:` declaration in `app/globals.css`
 * 2. Injection from JS — `setProperty('--name', …)` and `'--name':` in a style object
 * 3. A Tailwind arbitrary **property** declaration — `[--name:value]` (declared on the element)
 * 4. `next/font`'s `variable: '--name'`
 *
 * **References with a fallback (`var(--x, #08090a)`) are exempt** — the render is
 * defined even without the token, so nothing breaks silently. What this gate
 * blocks is exactly the references whose value disappears when the token is
 * missing.
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

function collectDeclared(): Set<string> {
  const css = readFileSync(path.join(ROOT, "app/globals.css"), "utf8");
  const declared = new Set<string>(
    [...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]),
  );
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const m of source.matchAll(/setProperty\(\s*['"](--[a-z0-9-]+)/g)) {
      declared.add(m[1]);
    }
    // Style-object keys (`{ '--x': v }`) and Tailwind arbitrary properties (`[--x:v]`)
    for (const m of source.matchAll(/['"](--[a-z0-9-]+)['"]\s*:/g)) declared.add(m[1]);
    for (const m of source.matchAll(/\[(--[a-z0-9-]+):/g)) declared.add(m[1]);
    for (const m of source.matchAll(/variable:\s*['"](--[a-z0-9-]+)/g)) declared.add(m[1]);
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
      for (const name of undeclaredRefs(readFileSync(file, "utf8"), declared)) {
        violations.push(`${path.relative(ROOT, file)} → ${name}`);
      }
    }
    expect(violations).toEqual([]);
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
      expect(readFileSync(file, "utf8")).not.toContain(
        "var(--color-status-warning-a36)",
      );
    }
  });
});
