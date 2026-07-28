import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **없는 토큰을 부르는 `var()`** 차단 — 조용히 깨지는 부류의 게이트.
 *
 * ## 왜 lint 가 원리적으로 못 하나
 *
 * `var(--color-status-warning-a36)` 은 **문법상 완전히 정상인 문자열**이다.
 * 그 토큰이 선언돼 있는지는 *다른 파일*(`app/globals.css`)의 목록을 봐야
 * 알 수 있고, `no-restricted-syntax` 는 한 파일의 AST 셀렉터 매칭이라
 * 그 판정을 표현할 수 없다. `type-ramp-step-defined` 가 있는 이유와 같다.
 *
 * ## 잡은 것 (2026-07-28 실측)
 *
 * `src/features/docs-vault-local/ui/AgentClientButtons.tsx` 의 「MCP 서버를
 * 실행할 수 없다」 경고 카드가 `--color-status-warning-a36/-a10` 을 불렀는데
 * **둘 다 어디에도 선언돼 있지 않았다**. 미정의 `var()` 는 computed-value
 * time 에 무효가 되므로 `border-color` 는 `currentColor`, `background-color`
 * 는 `transparent` 로 떨어진다 — 즉 경고 카드가 경고색을 하나도 안 입은 채
 * 렌더되고 있었다. tsc·eslint·전체 테스트를 전부 통과하면서.
 *
 * 이건 `text-large` 사고와 같은 계열이다: **존재하지 않는 것은 리터럴도
 * 남기지 않으므로 하드코딩 검사의 시야 밖이다.**
 *
 * ## 무엇을 "선언됨" 으로 치는가
 *
 * 세 출처를 합집합으로 본다 — 셋 다 실제로 런타임에 값을 만든다:
 * 1. `app/globals.css` 의 `--name:` 선언
 * 2. JS 가 주입하는 것 — `setProperty('--name', …)` · 스타일 객체의 `'--name':`
 * 3. Tailwind arbitrary **property** 선언 — `[--name:value]` (요소에 직접 선언)
 * 4. `next/font` 의 `variable: '--name'`
 *
 * **fallback 이 있는 참조(`var(--x, #08090a)`)는 면제**다 — 토큰이 없어도
 * 렌더가 정의되므로 조용히 깨지지 않는다. 이 게이트가 막는 것은 정확히
 * "없으면 값이 사라지는" 참조뿐이다.
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
    // 스타일 객체 키 (`{ '--x': v }`) 와 Tailwind arbitrary property (`[--x:v]`)
    for (const m of source.matchAll(/['"](--[a-z0-9-]+)['"]\s*:/g)) declared.add(m[1]);
    for (const m of source.matchAll(/\[(--[a-z0-9-]+):/g)) declared.add(m[1]);
    for (const m of source.matchAll(/variable:\s*['"](--[a-z0-9-]+)/g)) declared.add(m[1]);
  }
  return declared;
}

/** fallback 없는 `var(--x)` 만 — 있는 쪽은 렌더가 정의되므로 이 게이트 밖이다. */
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

  // 탐지기가 조용히 무력화되면 여기서 먼저 터진다. 위 검사가 "위반 0" 을
  // 주장하는데, 그 0 이 "정말 깨끗해서" 인지 "정규식이 아무것도 안 봐서" 인지
  // 구분할 수 있어야 한다.
  it("프로브 — 미선언 참조는 잡고, 선언·fallback·arbitrary property 는 통과시킨다", () => {
    const probe = new Set(["--color-real"]);
    expect(undeclaredRefs('var(--color-ghost)', probe)).toEqual(["--color-ghost"]);
    expect(undeclaredRefs('var(--color-real)', probe)).toEqual([]);
    // fallback 이 있으면 토큰이 없어도 렌더가 정의된다 — 면제.
    expect(undeclaredRefs('var(--color-ghost, #08090a)', probe)).toEqual([]);
    // 요소에 직접 선언하고 바로 쓰는 형태는 정상이다.
    const inline = 'className="[--cell:2rem] h-[var(--cell)]"';
    const inlineDeclared = new Set([
      ...probe,
      ...[...inline.matchAll(/\[(--[a-z0-9-]+):/g)].map((m) => m[1]),
    ]);
    expect(undeclaredRefs(inline, inlineDeclared)).toEqual([]);
  });

  // 실제로 잡았던 그 이름 — 회귀하면 여기서 이름으로 터진다.
  it("2026-07-28 에 잡힌 유령 토큰이 되살아나지 않는다", () => {
    expect(declared.has("--color-status-warning-a36")).toBe(false);
    for (const file of files) {
      expect(readFileSync(file, "utf8")).not.toContain(
        "var(--color-status-warning-a36)",
      );
    }
  });
});
