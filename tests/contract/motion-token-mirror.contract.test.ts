import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  MOTION,
  MOTION_EASE,
  OVERLAY_SPRING,
  OVERLAY_SPRING_REDUCED,
} from "../../src/shared/motion";

/**
 * 모션 토큰의 **CSS ↔ JS 거울 계약**.
 *
 * ## 왜 이 게이트가 없으면 안 되나 (2026-07-28 디자인 카운슬 「체계」 실측)
 *
 * framer-motion 은 `transition` 의 숫자 필드에서 CSS `var()` 를 읽지 못한다.
 * 그래서 `src/shared/motion` 이 `app/globals.css` 의 값을 **복사**하는데, 복사본은
 * 게이트가 없으면 반드시 갈라진다 — 실제로 갈라져 있었다:
 *
 *   JS `MOTION` 이 4단(0.12 / 0.18 / **0.28** / **0.42**)이었고, 뒤 둘은 CSS 램프
 *   어디에도 없는 값이었다. 사용 22건 중 **15건이 램프 밖 duration 으로 렌더 중**.
 *
 * 왜 아무 게이트도 안 잡았나: lint 셀렉터(`duration-<숫자>`)는 **Tailwind 클래스
 * 문자열만** 본다. framer 의 `transition={{ duration: 0.28 }}` 과 이 상수 객체는
 * 어떤 게이트의 사정거리에도 없었다. 값이 게이트가 안 보는 곳에 살아서 갈라졌다.
 *
 * `OVERLAY_SPRING` ↔ `--overlay-spring-*` 의 일치도 그때까지 **주석**이 지키고
 * 있었다("drift 감사는 이 주석을 기준으로"). 주석은 게이트가 아니다.
 *
 * ## 이 파일이 지키는 것
 *
 * 1. JS 의 duration 이 CSS 램프 값과 같다.
 * 2. JS 의 **이름 집합**이 램프 이름을 벗어나지 않는다 — `medium`/`slow` 부활 차단.
 * 3. 스프링 복사본이 CSS 토큰과 같다.
 * 4. 모든 스텝이 같은 이징 패밀리를 탄다(램프 duration 을 받는 원소는 이징도
 *    같은 패밀리 — `design.md`).
 */

const CSS = readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");

/** `:root` 등 어디서 선언됐든 `--name: value;` 의 첫 선언을 읽는다. */
function cssVar(name: string): string {
  const m = CSS.match(new RegExp(`^\\s*${name.replace(/[-]/g, "\\-")}\\s*:\\s*([^;]+);`, "m"));
  if (!m) throw new Error(`${name} 이 app/globals.css 에 없다`);
  return m[1].trim();
}

/** `120ms` → 0.12 (framer 는 초 단위). */
function msTokenToSeconds(name: string): number {
  const raw = cssVar(name);
  const m = raw.match(/^([\d.]+)ms$/);
  if (!m) throw new Error(`${name} 이 ms 값이 아니다: ${raw}`);
  return Number(m[1]) / 1000;
}

describe("모션 토큰 거울 — CSS 램프와 JS 복사본", () => {
  it("duration 3단이 CSS 램프와 정확히 같다", () => {
    expect(MOTION.fast.duration).toBeCloseTo(msTokenToSeconds("--motion-fast"), 6);
    expect(MOTION.base.duration).toBeCloseTo(msTokenToSeconds("--motion-base"), 6);
    expect(MOTION.settle.duration).toBeCloseTo(msTokenToSeconds("--motion-settle"), 6);
  });

  /**
   * 이것이 드리프트의 정확한 재현 방지다 — 이름이 늘면 값도 늘고, 늘어난 값은
   * 램프 밖이다. 새 쓰임이 정말 필요하면 CSS 램프에 먼저 등재하고 여기 목록을
   * 넓혀야 한다(그 순서가 곧 "규격이 먼저" 다).
   */
  it("이름 집합이 램프 3단을 벗어나지 않는다 (medium/slow 부활 차단)", () => {
    expect(Object.keys(MOTION).sort()).toEqual(["base", "fast", "settle"]);
  });

  it("이징이 `--motion-ease` 의 값 복사다", () => {
    const raw = cssVar("--motion-ease");
    const nums = raw.match(/[\d.]+/g)?.map(Number) ?? [];
    expect(nums).toHaveLength(4);
    expect([...MOTION_EASE]).toEqual(nums);
  });

  // 램프 duration 을 받는 원소는 이징도 같은 패밀리로 간다 — duration 만 갈아타면
  // "셋의 공통 이징" 이라는 패밀리 정의가 반쪽만 지켜진다(design.md).
  it("세 스텝이 같은 이징 패밀리를 탄다", () => {
    const eases = Object.values(MOTION).map((m) => JSON.stringify(m.ease));
    expect(new Set(eases).size).toBe(1);
  });

  it("오버레이 스프링이 CSS 토큰의 값 복사다", () => {
    const response = Number(cssVar("--overlay-spring-response"));
    const damping = Number(cssVar("--overlay-spring-damping"));
    expect(OVERLAY_SPRING.duration).toBeCloseTo(response, 6);
    // damping 1.0 = 임계감쇠 = 오버슈트 0 의 framer 표현이 `bounce: 0`.
    expect(damping).toBeCloseTo(1, 6);
    expect(OVERLAY_SPRING.bounce).toBe(0);
  });

  it("감속 동등물이 fast 와 같은 시간이다 (정보 축은 남기고 이동 축만 없앤다)", () => {
    expect(OVERLAY_SPRING_REDUCED.duration).toBeCloseTo(MOTION.fast.duration, 6);
  });
});
