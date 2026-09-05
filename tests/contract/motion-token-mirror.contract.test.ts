import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  EXIT_TRANSITION,
  MOTION,
  MOTION_EASE,
  MOTION_EASE_EXIT,
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
 * 5. **Exits are the one licensed second family.** `--motion-ease-exit` accelerates
 *    away; entries keep decelerating. A leaving surface reached through `--motion-ease`
 *    is the entrance clock played backwards (design-system seat, 2026-09-05), and an
 *    arriving surface reached through the exit curve pops in on its last frame. The
 *    rule is directional in both syntaxes: CSS may reference the exit token only from
 *    a rule that leaves (`-out` / `[data-state="closed"]`) on a keyframe named `*Out`,
 *    and JS may reach it only through `EXIT_TRANSITION`.
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

  it("퇴장 이징이 `--motion-ease-exit` 의 값 복사다", () => {
    const raw = cssVar("--motion-ease-exit");
    const nums = raw.match(/[\d.]+/g)?.map(Number) ?? [];
    expect(nums).toHaveLength(4);
    expect([...MOTION_EASE_EXIT]).toEqual(nums);
  });

  // The families differ by *direction*, not by name. A cubic-bezier whose second control
  // point sits on or below the diagonal (y2 <= x2) is still gaining speed when it ends; one
  // whose second point sits above it (y2 > x2) is slowing down. Exits accelerate away,
  // entries decelerate into place — the property, not the four numbers, is the contract.
  it("퇴장 곡선은 끝까지 가속하고 등장 곡선은 감속한다", () => {
    const [, , exitX2, exitY2] = MOTION_EASE_EXIT;
    const [, , enterX2, enterY2] = MOTION_EASE;
    expect(exitY2).toBeLessThanOrEqual(exitX2);
    expect(enterY2).toBeGreaterThan(enterX2);
    expect(JSON.stringify(MOTION_EASE_EXIT)).not.toBe(JSON.stringify(MOTION_EASE));
  });

  it("램프 세 스텝은 등장 패밀리를 타고, 퇴장 패밀리는 EXIT_TRANSITION 만 탄다", () => {
    for (const [name, step] of Object.entries(MOTION)) {
      expect(JSON.stringify(step.ease), `MOTION.${name} rides the exit curve`).toBe(
        JSON.stringify(MOTION_EASE),
      );
    }
    expect(JSON.stringify(EXIT_TRANSITION.ease)).toBe(JSON.stringify(MOTION_EASE_EXIT));
  });

  /**
   * JS side of the directional rule. `framer-exit-asymmetry` already forces every framer
   * `exit` onto `EXIT_TRANSITION`, so the only way an *entry* could take the exit curve is
   * to import `MOTION_EASE_EXIT` directly and hand it to `transition=`. Closing the import
   * closes that door without a second AST selector.
   */
  it("MOTION_EASE_EXIT 은 src/shared/motion 밖에서 직접 쓰이지 않는다 — 등장은 퇴장 곡선을 못 탄다", () => {
    const root = path.join(process.cwd(), "src");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(tsx?|mjs|jsx?)$/.test(entry)) files.push(full);
      }
    };
    walk(root);
    expect(files.length, "the source walk found nothing").toBeGreaterThan(100);
    const offenders = files
      .filter((file) => !file.startsWith(path.join(root, "shared", "motion") + path.sep))
      .filter((file) => /\bMOTION_EASE_EXIT\b/.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(process.cwd(), file));
    expect(offenders, `an entry can reach the exit curve from:\n${offenders.join("\n")}`).toEqual([]);
  });

  /**
   * CSS side of the directional rule. Rules are read flat — the same `selector { body }`
   * shape `exit-motion-restart` uses — and every `var(--motion-ease-exit)` reference must
   * sit inside a leaving rule, on an `animation` shorthand whose keyframe name ends in
   * `Out`. A `transition:` reference is refused too: a transition runs both ways on one
   * curve, so it would hand the accelerating curve to the entrance as well.
   */
  it("CSS 에서 `var(--motion-ease-exit)` 는 나가는 규칙의 *Out 키프레임에만 붙는다", () => {
    const rules = [...CSS.matchAll(/([^{}]*)\{([^{}]*)\}/g)]
      .map(([, selector, body]) => ({
        selector: selector.trim().split("\n").pop()!.trim(),
        body,
      }))
      .filter((rule) => /var\(--motion-ease-exit\)/.test(rule.body));
    expect(rules.length, "no CSS rule consumes --motion-ease-exit — an unused token is misinformation").toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const rule of rules) {
      const leaves = /-out(?![\w-])|\[data-state="closed"\]/.test(rule.selector);
      if (!leaves) offenders.push(`${rule.selector} — not a leaving rule`);
      if (/transition[^;]*var\(--motion-ease-exit\)/.test(rule.body)) {
        offenders.push(`${rule.selector} — transition runs both ways; use an animation`);
      }
      // Each animation shorthand segment carrying the exit token names a `*Out` keyframe.
      const animation = rule.body.match(/animation\s*:\s*([^;]*);/)?.[1] ?? "";
      for (const segment of animation.split(",")) {
        if (!/var\(--motion-ease-exit\)/.test(segment)) continue;
        const name = segment.trim().match(/^([A-Za-z][\w-]*)/)?.[1] ?? "";
        if (!/Out$/.test(name)) offenders.push(`${rule.selector} → ${name || "(no keyframe)"} is not an exit keyframe`);
      }
    }
    expect(offenders, `the exit curve reached an entrance:\n${offenders.join("\n")}`).toEqual([]);
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
