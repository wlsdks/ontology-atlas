import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 크기 스텝이 행간을 함께 싣는(companion) 뒤에 생긴 실패 모드를 막는다:
 * **조건부로 글자 크기만 갈아끼워 짝이 어긋나는 원소.**
 *
 * ## 결함의 모양
 *
 * `text-<스텝>` 은 이제 그 단의 행간까지 싣는다. 그런데 같은 원소에 arbitrary
 * 크기(`text-[Npx]` · `text-[length:…]` · clamp)를 조건부로 얹으면 **크기만
 * 바뀌고 행간은 원래 단의 것이 그대로 남는다** — arbitrary 크기에는 companion
 * 이 없기 때문이다. 아무도 고른 적 없는 비율이 그 브레이크포인트에서만 만들어
 * 진다. 2026-07-27 실측: /git 헤드라인이 넓은 폭에서 23px 글자에 title 짝인
 * 24px 행간(1.04)을 달고 있었고, 이 저장소에서 가장 큰 이탈이었다.
 *
 * 처방은 둘 중 하나다 — ① 조건부 크기도 램프 유틸리티로 쓰거나(그러면 짝이
 * 따라온다) ② 명시 `leading-*` 을 달아 두 크기 모두에서 행간을 직접 정한다.
 * ②는 실재하는 정당한 선택이라(단일행 응집 히어로) 위반으로 세지 않는다.
 *
 * ## 왜 ESLint 가 아니라 계약 테스트인가
 *
 * `no-restricted-syntax` 는 **AST 노드 하나**에 셀렉터를 맞춘다. 이 판정은
 * 한 원소의 클래스 **전체**를 봐야 하는데, className 은 `cn()` 인자로 여러
 * 리터럴에 쪼개지므로 셀렉터 하나에 담기지 않는다. 램프 토큰을 arbitrary
 * length 로 우회하는 **부분집합**만 lint 가 잡고(`eslint.config.mjs` 의
 * `arbitrarySizeSelectors`), 나머지 일반형을 여기서 붙든다.
 * (`design.md` 「lint 가 못 보는 층은 계약 테스트가 맡는다」)
 */

const ROOTS = ["src", "app"] as const;

/** 램프 크기 스텝 — 이 클래스가 companion 행간을 싣는다. */
const RAMP_STEP =
  /(?:^|[\s"'`{(])(?:[a-z0-9-]+:)*text-(?:caption|label|body-lg|body|title|display|hero)(?![\w-])/;

/**
 * companion 이 **없는** 크기 덮어쓰기 — Tailwind 는 arbitrary 크기에 행간을
 * 붙이지 않는다. 기본 스케일(text-sm 등)은 자기 행간을 싣고 오므로 제외한다.
 */
const SIZE_OVERRIDE_WITHOUT_PAIR =
  /(?:^|[\s"'`{(])(?:[a-z0-9-]+:)*text-\[(?:length:|clamp|[0-9])/;

/** 명시 행간 — 두 크기 모두를 덮으므로 짝 어긋남이 성립하지 않는다. */
const EXPLICIT_LEADING = /(?:^|[\s"'`{(])(?:[a-z0-9-]+:)*leading-[\w[.\]]/;

function collectSourceFiles(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, out);
      continue;
    }
    if (!/\.tsx$/.test(full)) continue;
    if (full.includes(".test.") || full.includes(".spec.")) continue;
    out.push(full);
  }
}

/**
 * `className` 이 실어 나르는 문자열 영역을 통째로 뽑는다. `cn(...)` 로 여러
 * 인자에 쪼개진 클래스도 한 덩어리로 봐야 판정이 성립하므로, 중괄호 표현식은
 * 짝을 세어 끝까지 읽는다.
 */
export function extractClassNameRegions(source: string): string[] {
  const out: string[] = [];
  const re = /className=(["'{])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const open = m[1];
    const start = m.index + m[0].length;
    if (open !== "{") {
      const end = source.indexOf(open, start);
      if (end === -1) continue;
      out.push(source.slice(start, end));
      continue;
    }
    let depth = 1;
    let i = start;
    for (; i < source.length && depth > 0; i += 1) {
      if (source[i] === "{") depth += 1;
      else if (source[i] === "}") depth -= 1;
    }
    out.push(source.slice(start, i - 1));
  }
  return out;
}

/** 한 원소의 클래스 영역이 짝 어긋남인지 판정한다. */
export function isMismatchedPair(region: string): boolean {
  if (!RAMP_STEP.test(region)) return false;
  if (!SIZE_OVERRIDE_WITHOUT_PAIR.test(region)) return false;
  return !EXPLICIT_LEADING.test(region);
}

function scan(): string[] {
  const files: string[] = [];
  for (const root of ROOTS) collectSourceFiles(join(process.cwd(), root), files);

  const bad: string[] = [];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const path = relative(process.cwd(), file);
    for (const region of extractClassNameRegions(source)) {
      if (!isMismatchedPair(region)) continue;
      const line = source.split("\n").findIndex((l) => l.includes(region.split("\n")[0].trim()));
      bad.push(`  ${path}:${line + 1} — ${region.replace(/\s+/g, " ").slice(0, 120)}`);
    }
  }
  return bad;
}

describe("타입 램프 × 행간 짝 — 조건부 크기 어긋남 차단", () => {
  it("램프 클래스와 arbitrary 크기가 한 원소에 공존하면 명시 행간이 있다", () => {
    const bad = scan();
    expect(
      bad,
      `조건부로 글자 크기만 갈아끼워 행간 짝이 어긋난다. arbitrary 크기에는\n` +
        `companion 행간이 없으므로, 원래 단의 행간이 그 브레이크포인트에서도\n` +
        `그대로 남는다(아무도 고른 적 없는 비율).\n` +
        `① 조건부 크기도 램프 유틸리티로 쓰거나 ② 명시 leading 을 달아 두 크기\n` +
        `모두에서 행간을 직접 정해라.\n${bad.join("\n")}`,
    ).toEqual([]);
  });

  it("스캔이 실제로 램프를 읽는다 — 0건이 '안 봄'이 아니어야 한다", () => {
    const files: string[] = [];
    for (const root of ROOTS) collectSourceFiles(join(process.cwd(), root), files);
    const regions = files.flatMap((f) => extractClassNameRegions(readFileSync(f, "utf8")));
    expect(regions.length).toBeGreaterThan(500);
    expect(regions.filter((r) => RAMP_STEP.test(r)).length).toBeGreaterThan(300);
  });

  it("판정이 실제로 잡는다 (프로브)", () => {
    // ① 결함형 — 램프 단 + 조건부 arbitrary 크기 + 행간 없음.
    expect(isMismatchedPair('"text-title font-semibold sm:text-[length:var(--text-display)]"')).toBe(
      true,
    );
    expect(isMismatchedPair('"text-hero md:text-[34px]"')).toBe(true);
    // ② 명시 행간이 있으면 두 크기 모두를 덮으므로 위반이 아니다.
    expect(isMismatchedPair('"text-hero leading-tight md:text-[34px]"')).toBe(false);
    // ③ 조건부 크기도 램프면 짝이 따라온다.
    expect(isMismatchedPair('"text-title font-semibold sm:text-display"')).toBe(false);
    // ④ 색/그림자 arbitrary 는 크기가 아니다 — 오검출 금지.
    expect(isMismatchedPair('"text-body text-[color:var(--color-text-primary)]"')).toBe(false);
    // ⑤ cn() 인자로 쪼개져도 한 원소로 본다.
    expect(isMismatchedPair('cn("text-title", wide && "sm:text-[23px]")')).toBe(true);
  });
});
