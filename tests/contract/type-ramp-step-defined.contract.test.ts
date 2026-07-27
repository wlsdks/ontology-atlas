import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `text-<스텝>` / `leading-<스텝>` 이 **실제로 정의된 토큰**을 가리키는지 검사한다.
 *
 * ## 왜 이 테스트가 존재하나
 *
 * 2026-07-27 실측: 공방 중심 카드의 노드 이름이 `text-large` 를 부르고 있었는데
 * `--text-large` 는 어디에도 없었다. Tailwind 는 정의되지 않은 스텝에 대해
 * **아무 클래스도 만들지 않는다** — 그래서 그 자리는 루트 16px 을 상속해
 * 렌더됐고, 화면의 주인공(노드 이름)이 위성 카드 이름(12.5px)과 1.28배밖에
 * 안 벌어져 있었다. `.claude/rules/design.md` 의 잠금 계약대로 **루트 16px
 * 상속은 램프 미적용 결함**이다.
 *
 * 이 결함은 **어떤 게이트도 잡지 못했다.** 없는 토큰을 부르는 클래스는 문법상
 * 정상 문자열이라 tsc·eslint·단위 테스트를 전부 통과한다. 존재하지 않는 것은
 * 리터럴도 남기지 않으므로 `type-ramp-coverage` 의 하드코딩 래칫도 못 본다.
 * 같은 파일에서 같은 사고가 이미 한 번 있었다는 것이 결정적이다 — `text-callout`
 * (역시 미등록 스텝)은 #618 에서 손으로 발견돼 고쳐졌는데, 두 자리 남은
 * `text-large` 는 그 검수를 통과해 살아남았다. 사람 눈은 이 계열을 놓친다.
 *
 * ## 왜 ESLint 가 아니라 계약 테스트인가
 *
 * 판정에 **`app/globals.css` 의 토큰 목록**이 필요하다. `no-restricted-syntax`
 * 는 AST 셀렉터 매칭이라 다른 파일의 토큰 정의를 참조할 수 없다 — 스텝 이름을
 * 룰에 복제하면 그 복제본이 램프와 조용히 드리프트해서, 게이트가 지키려는
 * 사각지대를 게이트가 만든다. 그래서 원본(globals.css)을 **읽어서** 판정한다.
 */

/** 주석 줄. 결함 이력을 한국어로 적을 때 옛 스텝 이름을 인용할 수 있어야 한다. */
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*|\{\/\*)/;

/**
 * Tailwind v4 기본 스케일 — `@theme` 에 `--text-*: initial` 리셋이 없으므로
 * 램프와 **공존**한다. 램프 밖이라는 부채는 `type-ramp-coverage` 래칫이 별도로
 * 다루고, 이 테스트는 "정의됐는지" 만 본다.
 */
const TAILWIND_FONT_SIZE = new Set([
  "xs",
  "sm",
  "base",
  "lg",
  "xl",
  "2xl",
  "3xl",
  "4xl",
  "5xl",
  "6xl",
  "7xl",
  "8xl",
  "9xl",
]);

const TAILWIND_LINE_HEIGHT = new Set(["none", "tight", "snug", "normal", "relaxed", "loose"]);

/** 크기가 아닌 `text-*` 유틸리티 — 정렬 · 줄바꿈 · 넘침 · 기본 색 키워드. */
const TEXT_NON_SIZE = new Set([
  "left",
  "center",
  "right",
  "justify",
  "start",
  "end",
  "wrap",
  "nowrap",
  "balance",
  "pretty",
  "ellipsis",
  "clip",
  "transparent",
  "current",
  "inherit",
  "black",
  "white",
]);

const ROOTS = ["src", "app"] as const;

function collectSourceFiles(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, out);
      continue;
    }
    if (!/\.tsx?$/.test(full)) continue;
    if (full.includes(".test.") || full.includes(".spec.")) continue;
    out.push(full);
  }
}

/** `app/globals.css` 의 `--text-*` / `--leading-*` 선언을 스텝 이름으로 읽는다. */
export function readRampSteps(css: string): { text: Set<string>; leading: Set<string> } {
  const text = new Set<string>();
  const leading = new Set<string>();
  for (const m of css.matchAll(/--(text|leading)-([a-z0-9-]+)\s*:/g)) {
    (m[1] === "text" ? text : leading).add(m[2]);
  }
  return { text, leading };
}

/**
 * 소스 한 줄에서 램프 스텝 참조를 뽑는다.
 *
 * 제외 대상 — ① 주석 줄(결함 이력 인용) ② `[text-shadow:…]` 처럼 대괄호 안의
 * **임의 속성**(`[` 선행) ③ `text-align: left` 같은 raw CSS 문자열(`:` 후행)
 * ④ `--color-text-primary` 처럼 토큰 이름의 일부(`-` 선행).
 */
export function extractRampRefs(line: string): Array<{ kind: "text" | "leading"; step: string }> {
  if (COMMENT_LINE.test(line)) return [];
  const out: Array<{ kind: "text" | "leading"; step: string }> = [];
  const re = /(^|[^-\w[])(text|leading)-([a-z0-9][a-z0-9.-]*)/g;
  for (const m of line.matchAll(re)) {
    const step = m[3].replace(/-$/, "");
    const after = line[(m.index ?? 0) + m[0].length];
    if (after === ":") continue;
    out.push({ kind: m[2] as "text" | "leading", step });
  }
  return out;
}

function isDefined(
  ref: { kind: "text" | "leading"; step: string },
  ramp: { text: Set<string>; leading: Set<string> },
): boolean {
  if (ref.kind === "text") {
    return (
      ramp.text.has(ref.step) || TAILWIND_FONT_SIZE.has(ref.step) || TEXT_NON_SIZE.has(ref.step)
    );
  }
  // `leading-4` 처럼 숫자 스텝은 Tailwind 의 spacing 기반 line-height 다.
  if (/^\d+(\.\d+)?$/.test(ref.step)) return true;
  return ramp.leading.has(ref.step) || TAILWIND_LINE_HEIGHT.has(ref.step);
}

function scan(): string[] {
  const ramp = readRampSteps(readFileSync(join(process.cwd(), "app/globals.css"), "utf8"));
  const files: string[] = [];
  for (const root of ROOTS) collectSourceFiles(join(process.cwd(), root), files);

  const bad: string[] = [];
  for (const file of files) {
    const path = relative(process.cwd(), file);
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      for (const ref of extractRampRefs(line)) {
        if (isDefined(ref, ramp)) continue;
        bad.push(`  ${path}:${i + 1} — ${ref.kind}-${ref.step}`);
      }
    });
  }
  return bad;
}

describe("타입/행간 램프 — 존재하지 않는 스텝 차단", () => {
  it("모든 text-*/leading-* 스텝이 정의된 토큰을 가리킨다", () => {
    const bad = scan();
    expect(
      bad,
      `정의되지 않은 램프 스텝이다. Tailwind 는 이 클래스를 아예 만들지 않으므로\n` +
        `그 자리는 루트 16px 을 상속해 렌더된다(= 램프 미적용 결함).\n` +
        `app/globals.css 의 --text-* / --leading-* 중 하나로 수렴시키거나, 정말\n` +
        `새 스텝이 필요하면 ① globals.css 램프 ② docs/DESIGN-SYSTEM.md 등재\n` +
        `③ src/shared/lib/cn.ts 의 TYPE_RAMP_STEPS/LEADING_RAMP_STEPS 등록을\n` +
        `같은 PR 에서 함께 해라.\n${bad.join("\n")}`,
    ).toEqual([]);
  });

  it("램프를 실제로 읽는다 — 스캔이 비면 통과가 아니라 결함이다", () => {
    const ramp = readRampSteps(readFileSync(join(process.cwd(), "app/globals.css"), "utf8"));
    // 7단 램프 + 행간 9단이 최소선. 램프 파싱이 깨지면 위 테스트가 영원히 통과한다.
    expect(ramp.text.size).toBeGreaterThanOrEqual(7);
    expect(ramp.leading.size).toBeGreaterThanOrEqual(9);
    expect(ramp.text.has("display")).toBe(true);
    expect(ramp.text.has("large")).toBe(false);
  });

  it("판정이 실제로 잡는다 (프로브)", () => {
    const ramp = readRampSteps(readFileSync(join(process.cwd(), "app/globals.css"), "utf8"));
    const check = (line: string) =>
      extractRampRefs(line).filter((r) => !isDefined(r, ramp)).length;

    // ① 실제 결함형 — 미등록 스텝 2종.
    expect(check('className="text-large font-semibold leading-oversized"')).toBe(2);
    // ② 정상형 — 램프 스텝 · Tailwind 기본 스케일 · 숫자 행간 · 임의값.
    expect(
      check(
        'className="text-display leading-display-tight text-sm leading-4 leading-relaxed text-[13px] leading-[1.4]"',
      ),
    ).toBe(0);
    // ③ 오검출 금지형 — 토큰 이름 조각 · 임의 속성 · raw CSS · 정렬/줄바꿈.
    expect(
      check(
        'className="text-[color:var(--color-text-primary)] [text-shadow:var(--x)] text-center text-nowrap"',
      ),
    ).toBe(0);
    expect(check("[data-x] a { text-align: left; text-decoration: underline; }")).toBe(0);
    // ④ 주석은 결함 이력을 인용할 수 있다 — 렌더되지 않으므로 판정 대상이 아니다.
    expect(check("        // 예전엔 text-callout 이었다 (미등록 스텝 → 루트 16px)")).toBe(0);
  });
});
