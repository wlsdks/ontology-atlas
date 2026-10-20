import { execFileSync } from "node:child_process";
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
  STAGGER,
} from "../../../src/shared/motion";
import { readGlobalCss } from '../../../scripts/lib/design/global-css.mjs';

/**
 * CSS and JS mirror for motion tokens: framer-motion cannot read CSS `var()` in numeric transition
 * fields, so `src/shared/motion` copies values from `app/globals.css`. Exits are the one licensed
 * second easing family, reachable in CSS only from leaving rules and in JS only via `EXIT_TRANSITION`.
 */

const RAMP = {
  fast: "--motion-fast",
  base: "--motion-base",
  settle: "--motion-settle",
  slow: "--motion-slow",
  expressive: "--motion-expressive",
  choreography: "--motion-choreography",
} as const;

const SUPPORTS_PROBE = /CSS\.supports\(\s*(['"])transition-timing-function\1\s*,\s*(['"])linear\(0, 1\)\2\s*\)/g;
const HAND_TYPED_LINEAR = /\blinear\(\s*-?\d/;

function writesLinearCurve(text: string): boolean {
  return HAND_TYPED_LINEAR.test(text.replace(/\/\*[\s\S]*?\*\//g, "").replace(SUPPORTS_PROBE, ""));
}

const CSS = readGlobalCss();

/** Reads the first `--name: value;` declaration, wherever it is declared. */
function cssVar(name: string): string {
  const m = CSS.match(new RegExp(`^\\s*${name.replace(/[-]/g, "\\-")}\\s*:\\s*([^;]+);`, "m"));
  if (!m) throw new Error(`${name} is missing from app/globals.css`);
  return m[1].trim();
}

/** `120ms` → 0.12 (framer works in seconds). */
function msTokenToSeconds(name: string): number {
  const raw = cssVar(name);
  const m = raw.match(/^([\d.]+)ms$/);
  if (!m) throw new Error(`${name} is not an ms value: ${raw}`);
  return Number(m[1]) / 1000;
}

describe("motion token mirror: CSS ramp and JS copy", () => {
  it("every ramp step equals its CSS token and the steps ascend", () => {
    for (const [name, token] of Object.entries(RAMP)) {
      expect(MOTION[name as keyof typeof MOTION].duration, token).toBeCloseTo(msTokenToSeconds(token), 6);
    }
    const ordered = Object.values(RAMP).map(msTokenToSeconds);
    expect(ordered).toEqual([...ordered].sort((x, y) => x - y));
    expect(new Set(ordered).size).toBe(ordered.length);
  });

  it("--motion-stagger mirrors STAGGER", () => {
    expect(STAGGER).toBeCloseTo(msTokenToSeconds("--motion-stagger"), 6);
  });

  it("the MOTION keys are the RAMP keys", () => {
    expect(Object.keys(MOTION)).toEqual(Object.keys(RAMP));
  });

  it("the easing is a value copy of `--motion-ease`", () => {
    const raw = cssVar("--motion-ease");
    const nums = raw.match(/[\d.]+/g)?.map(Number) ?? [];
    expect(nums).toHaveLength(4);
    expect([...MOTION_EASE]).toEqual(nums);
  });

  it("every ramp step rides the same easing family", () => {
    const eases = Object.values(MOTION).map((m) => JSON.stringify(m.ease));
    expect(new Set(eases).size).toBe(1);
  });

  it("the exit easing is a value copy of `--motion-ease-exit`", () => {
    const raw = cssVar("--motion-ease-exit");
    const nums = raw.match(/[\d.]+/g)?.map(Number) ?? [];
    expect(nums).toHaveLength(4);
    expect([...MOTION_EASE_EXIT]).toEqual(nums);
  });

  // The families differ by *direction*, not by name. A cubic-bezier whose second control
  // point sits on or below the diagonal (y2 <= x2) is still gaining speed when it ends; one
  // whose second point sits above it (y2 > x2) is slowing down. Exits accelerate away,
  // entries decelerate into place — the property, not the four numbers, is the contract.
  it("the exit curve accelerates to the end and the entrance curve decelerates", () => {
    const [, , exitX2, exitY2] = MOTION_EASE_EXIT;
    const [, , enterX2, enterY2] = MOTION_EASE;
    expect(exitY2).toBeLessThanOrEqual(exitX2);
    expect(enterY2).toBeGreaterThan(enterX2);
    expect(JSON.stringify(MOTION_EASE_EXIT)).not.toBe(JSON.stringify(MOTION_EASE));
  });

  it("every ramp step rides the entrance family, and the exit family rides only EXIT_TRANSITION", () => {
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
  it("MOTION_EASE_EXIT is not used directly outside src/shared/motion, so an entrance cannot ride the exit curve", () => {
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
  it("in CSS `var(--motion-ease-exit)` attaches only to the *Out keyframes of leaving rules", () => {
    /*
     * Split on `}` rather than a global `([^{}]*)\{([^{}]*)\}` match: the leading `[^{}]*` backtracks from
     * every position in the 339 KB stylesheet and is quadratic.
     */
    const rules = CSS.split("}")
      .map((chunk) => {
        const open = chunk.lastIndexOf("{");
        return open === -1
          ? null
          : {
              selector: chunk.slice(0, open).trim().split("\n").pop()!.trim(),
              body: chunk.slice(open + 1),
            };
      })
      .filter((rule): rule is { selector: string; body: string } => rule !== null)
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
    /*
     * 20 seconds: this case runs a backtracking regex over the whole of `app/globals.css` and exceeds the
     * 5-second default under machine load.
     */
  }, 20_000);

  it("the overlay spring is a value copy of the CSS token", () => {
    const response = Number(cssVar("--overlay-spring-response"));
    const damping = Number(cssVar("--overlay-spring-damping"));
    expect(OVERLAY_SPRING.duration).toBeCloseTo(response, 6);
    // damping 1.0 = critically damped = zero overshoot, expressed in framer as `bounce: 0`.
    expect(damping).toBeCloseTo(1, 6);
    expect(OVERLAY_SPRING.bounce).toBe(0);
  });

  it("the reduced-motion equivalent takes the same time as fast, keeping the information axis and removing only the movement axis", () => {
    expect(OVERLAY_SPRING_REDUCED.duration).toBeCloseTo(MOTION.fast.duration, 6);
  });

  it("only springEasing() writes a linear() curve, in CSS and in source", () => {
    expect(writesLinearCurve("a{transition-timing-function:linear(0, 0.5, 1)}")).toBe(true);
    expect(writesLinearCurve("CSS.supports('transition-timing-function', 'linear(0, 1)')")).toBe(false);
    expect(writesLinearCurve(CSS), "a stylesheet rule types a linear() curve").toBe(false);
    const files = execFileSync("git", ["ls-files", "src", "app"], { cwd: process.cwd(), encoding: "utf8" })
      .split("\n")
      .filter((file) => /\.tsx?$/.test(file))
      .filter((file) => !/\.(?:test|spec)\.tsx?$/.test(file) && file !== "src/shared/motion/spring.ts");
    expect(files.length, "the source walk found nothing").toBeGreaterThan(100);
    const offenders = files.filter((file) => writesLinearCurve(readFileSync(path.join(process.cwd(), file), "utf8")));
    expect(offenders, `a hand-typed linear() curve in:\n${offenders.join("\n")}`).toEqual([]);
  });
});
