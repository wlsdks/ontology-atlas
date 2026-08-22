import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **State updater functions are pure** — the body of `setX((prev) => …)` never
 * calls persistence or event dispatch **directly**.
 *
 * **Where it actually bit** (2026-08-13, twice). The studio's `stage()` called
 * `saveStudioDraft` straight from inside an updater. React may run an updater
 * **during render**, and that save synchronously dispatched `DRAFT_EVENT`, waking a
 * setState in the "in progress" list's subscriber mid-render — "Cannot update a
 * component while rendering". An exhaustive sweep the same day found 3 more direct
 * `localStorage.setItem` calls on the docs page (silent, since they dispatch no
 * event, but the same illness — dev's double invocation runs the write twice).
 *
 * **What passes.** Calls deferred **inside a callback**, such as
 * `queueMicrotask(() => save(...))` — a callback runs outside render. So this check
 * catches only the direct calls that remain after **stripping every nested function
 * body** from the updater.
 *
 * Why lint cannot do it: the target is the **structural scope** "inside the updater
 * body but outside any nested function", which no single node selector expresses.
 */

const SIDE_EFFECT_CALL =
  /\b(save[A-Z]\w*|write[A-Z]\w*|dispatchEvent|localStorage\.(?:set|remove)Item)\s*\(/g;

const UPDATER_HEAD = /set[A-Z]\w*\(\s*\(?\s*\w+\s*\)?\s*=>\s*\{/g;

/** Returns the body from an opening brace to its matching closing brace. */
function braceBody(source: string, openIndex: number): string {
  let depth = 1;
  let i = openIndex + 1;
  while (i < source.length && depth > 0) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") depth -= 1;
    i += 1;
  }
  return source.slice(openIndex + 1, i - 1);
}

/**
 * Strips nested function bodies out of a body — arrow functions in both the
 * `=> {}` block form and the `=> expr` concise form. The concise form is deleted up
 * to the paren that closes its expression (the deferral wrapper
 * `queueMicrotask(() => save(x))` is exactly that shape).
 */
export function stripNestedFunctions(body: string): string {
  let out = "";
  let i = 0;
  while (i < body.length) {
    const arrow = body.indexOf("=>", i);
    const fn = body.search(/\bfunction\b/) >= i ? body.slice(i).search(/\bfunction\b/) + i : -1;
    const next = arrow === -1 ? fn : fn === -1 || fn > arrow ? arrow : fn;
    if (next === -1 || next < i) {
      out += body.slice(i);
      break;
    }
    out += body.slice(i, next);
    // Find where the function body starts
    const bodyStart = body.indexOf("{", next);
    const semi = body.indexOf("\n", next);
    if (next === arrow && (bodyStart === -1 || (semi !== -1 && bodyStart > semi))) {
      // Concise arrow — delete to end of line (or the matching closing paren)
      let j = next + 2;
      let paren = 0;
      while (j < body.length) {
        const ch = body[j];
        if (ch === "(") paren += 1;
        else if (ch === ")") {
          if (paren === 0) break;
          paren -= 1;
        } else if ((ch === "," || ch === ";" || ch === "\n") && paren === 0) break;
        j += 1;
      }
      i = j;
      continue;
    }
    if (bodyStart === -1) {
      out += body.slice(next);
      break;
    }
    let depth = 1;
    let j = bodyStart + 1;
    while (j < body.length && depth > 0) {
      if (body[j] === "{") depth += 1;
      else if (body[j] === "}") depth -= 1;
      j += 1;
    }
    i = j;
  }
  return out;
}

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listSourceFiles(full));
    else if (/\.tsx?$/.test(name) && !name.includes(".test.")) out.push(full);
  }
  return out;
}

describe("순수 갱신 함수 계약", () => {
  it("setX 갱신 함수 본문에 직접 부수효과 호출이 없다 (이연 콜백은 허용)", () => {
    const violations: string[] = [];
    let updaters = 0;
    for (const file of listSourceFiles("src")) {
      const source = readFileSync(file, "utf-8");
      for (const match of source.matchAll(UPDATER_HEAD)) {
        updaters += 1;
        const body = braceBody(source, match.index! + match[0].length - 1);
        const direct = stripNestedFunctions(body);
        const bad = [...direct.matchAll(SIDE_EFFECT_CALL)].map((m) => m[1]);
        if (bad.length > 0) {
          const line = source.slice(0, match.index!).split("\n").length;
          violations.push(`${file}:${line} — ${[...new Set(bad)].join(", ")}`);
        }
      }
    }
    // Idling guard — finding no updater at all means this check looked at nothing.
    expect(updaters, "스캐너가 갱신 함수를 하나도 못 찾았다 — 패턴이 죽었다").toBeGreaterThan(15);
    expect(
      violations,
      "갱신 함수는 렌더 중에 실행될 수 있다 — 부수효과는 queueMicrotask 로 이연하라 (스튜디오 임시저장 사고, 2026-08-13)",
    ).toEqual([]);
  });

  // The detector's self-test — does it catch what it must and let deferrals through?
  it("프로브: 직접 호출은 잡히고 이연 콜백은 통과한다", () => {
    const direct = stripNestedFunctions(`
      const next = compute(prev);
      saveStudioDraft(id, label, next);
      return next;
    `);
    expect([...direct.matchAll(SIDE_EFFECT_CALL)].length).toBe(1);

    const deferred = stripNestedFunctions(`
      const next = compute(prev);
      queueMicrotask(() => saveStudioDraft(id, label, next));
      return next;
    `);
    expect([...deferred.matchAll(SIDE_EFFECT_CALL)].length).toBe(0);

    const deferredBlock = stripNestedFunctions(`
      const next = compute(prev);
      queueMicrotask(() => {
        window.localStorage.setItem(key, JSON.stringify(next));
      });
      return next;
    `);
    expect([...deferredBlock.matchAll(SIDE_EFFECT_CALL)].length).toBe(0);
  });
});
