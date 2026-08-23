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
 * The **CSS ↔ JS mirror contract** for motion tokens.
 *
 * **Why this gate is required** (design council "system" measurement, 2026-07-28).
 * framer-motion cannot read a CSS `var()` in `transition`'s numeric fields, so
 * `src/shared/motion` **copies** the values from `app/globals.css` — and without a
 * gate a copy inevitably diverges. It had:
 *
 *   JS `MOTION` had four steps (0.12 / 0.18 / **0.28** / **0.42**), and the last two
 *   were values found nowhere in the CSS ramp. Of 22 usages, **15 were rendering
 *   with off-ramp durations**.
 *
 * Why no gate caught it: the lint selector (`duration-<number>`) sees **Tailwind
 * class strings only**. framer's `transition={{ duration: 0.28 }}` and this constant
 * object were within no gate's reach. The value diverged because it lived where no
 * gate looked.
 *
 * The agreement between `OVERLAY_SPRING` and `--overlay-spring-*` was until then
 * guarded by **a comment** ("drift audits use this comment as the reference"). A
 * comment is not a gate.
 *
 * **What this file guards:**
 *
 * 1. The JS durations equal the CSS ramp values.
 * 2. The JS **name set** does not exceed the ramp's names — blocking the return of
 *    `medium`/`slow`.
 * 3. The spring copy equals the CSS tokens.
 * 4. Every step rides the same easing family (an element receiving a ramp duration
 *    also takes the family's easing — `design.md`).
 */

const CSS = readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");

/** Reads the first `--name: value;` declaration, wherever it is declared. */
function cssVar(name: string): string {
  const m = CSS.match(new RegExp(`^\\s*${name.replace(/[-]/g, "\\-")}\\s*:\\s*([^;]+);`, "m"));
  if (!m) throw new Error(`${name} 이 app/globals.css 에 없다`);
  return m[1].trim();
}

/** `120ms` → 0.12 (framer works in seconds). */
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
   * This prevents the exact drift from recurring — more names means more values, and
   * the added values are off-ramp. A genuinely new usage must be registered on the CSS
   * ramp first and then widened here. That order is what "the spec comes first"
   * means.
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

  // An element receiving a ramp duration also takes the family's easing — swapping
  // only the duration keeps half of the family definition, "one shared easing across
  // the three" (design.md).
  it("세 스텝이 같은 이징 패밀리를 탄다", () => {
    const eases = Object.values(MOTION).map((m) => JSON.stringify(m.ease));
    expect(new Set(eases).size).toBe(1);
  });

  it("오버레이 스프링이 CSS 토큰의 값 복사다", () => {
    const response = Number(cssVar("--overlay-spring-response"));
    const damping = Number(cssVar("--overlay-spring-damping"));
    expect(OVERLAY_SPRING.duration).toBeCloseTo(response, 6);
    // damping 1.0 = critically damped = zero overshoot, expressed in framer as `bounce: 0`.
    expect(damping).toBeCloseTo(1, 6);
    expect(OVERLAY_SPRING.bounce).toBe(0);
  });

  it("감속 동등물이 fast 와 같은 시간이다 (정보 축은 남기고 이동 축만 없앤다)", () => {
    expect(OVERLAY_SPRING_REDUCED.duration).toBeCloseTo(MOTION.fast.duration, 6);
  });
});
