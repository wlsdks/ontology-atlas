import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **상태 갱신 함수는 순수하다** — `setX((prev) => …)` 본문에서 저장·이벤트
 * 발신을 **직접** 부르지 않는다.
 *
 * ## 실제로 물린 자리 (2026-08-13, 두 번)
 *
 * 스튜디오 `stage()` 가 갱신 함수 안에서 `saveStudioDraft` 를 곧장 불렀다.
 * 갱신 함수는 React 가 **렌더 중에** 실행할 수 있고, 그 저장이 `DRAFT_EVENT`
 * 를 동기 dispatch 해 「작업중」 목록 구독자의 setState 를 렌더 한가운데서
 * 깨웠다 — "Cannot update a component while rendering". 같은 날 전수에서
 * 문서함 페이지의 `localStorage.setItem` 직접 호출 3곳이 더 나왔다(이벤트는
 * 없어 조용했지만 같은 병 — dev 이중 호출이 쓰기를 두 번 실행한다).
 *
 * ## 무엇이 통과하나
 *
 * `queueMicrotask(() => save(...))` 처럼 **콜백 안**으로 이연한 호출 — 콜백은
 * 렌더 밖에서 돈다. 그래서 이 검사는 갱신 함수 본문에서 **중첩 함수 본문을
 * 전부 걷어낸 뒤** 남는 직접 호출만 잡는다.
 *
 * lint 로 못 거는 이유: 판정 대상이 「갱신 함수 본문 중 중첩 함수 밖」이라는
 * **구조적 범위**라 한 노드 셀렉터로 표현되지 않는다.
 */

const SIDE_EFFECT_CALL =
  /\b(save[A-Z]\w*|write[A-Z]\w*|dispatchEvent|localStorage\.(?:set|remove)Item)\s*\(/g;

const UPDATER_HEAD = /set[A-Z]\w*\(\s*\(?\s*\w+\s*\)?\s*=>\s*\{/g;

/** 여는 중괄호 위치부터 짝이 맞는 닫는 중괄호까지의 본문을 돌려준다. */
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
 * 본문에서 중첩 함수 본문을 걷어낸다 — 화살표 함수는 `=> {}` 블록형과
 * `=> expr` 간결형 둘 다. 간결형은 그 표현식이 끝나는 괄호 짝까지 지운다
 * (지연 래퍼 `queueMicrotask(() => save(x))` 가 정확히 이 모양이다).
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
    // 함수 본문 시작 위치 찾기
    const bodyStart = body.indexOf("{", next);
    const semi = body.indexOf("\n", next);
    if (next === arrow && (bodyStart === -1 || (semi !== -1 && bodyStart > semi))) {
      // 간결 화살표 — 줄 끝(또는 닫는 괄호 짝)까지 지운다
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
    // 공회전 차단 — 갱신 함수를 하나도 못 찾으면 이 검사는 아무것도 안 본 것이다.
    expect(updaters, "스캐너가 갱신 함수를 하나도 못 찾았다 — 패턴이 죽었다").toBeGreaterThan(15);
    expect(
      violations,
      "갱신 함수는 렌더 중에 실행될 수 있다 — 부수효과는 queueMicrotask 로 이연하라 (스튜디오 임시저장 사고, 2026-08-13)",
    ).toEqual([]);
  });

  // 검사기 자기 시험 — 잡아야 할 것을 잡고, 이연은 통과시키는가.
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
