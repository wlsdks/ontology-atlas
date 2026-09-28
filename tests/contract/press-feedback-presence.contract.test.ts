import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { buttonVariants } from "@/shared/ui/button";
import {
  CONTROL_PRESS_TRAVEL,
  CONTROL_TRANSITION,
  controlClass,
  type ControlShape,
  type ControlSize,
  type ControlTone,
} from "@/shared/ui/control-class";

const SHAPES: ControlShape[] = ["chip", "icon", "row", "pill", "card", "link", "tile", "segment"];
const SIZES: ControlSize[] = ["xs", "sm", "md", "lg"];
const TONES: ControlTone[] = ["default", "muted", "secondary", "strong", "accent", "accentOnTint", "warning", "danger", "success", "onAccent"];
const DETACHED = new Set<ControlShape>(["chip", "icon", "pill", "tile"]);

const PRESS = /(?:^|\s)active:(?:translate-y-px|bg-|text-|shadow-)/;
const TRAVEL = /(?:^|\s)active:translate-y-px(?:\s|$)/;
const REDUCED = /(?:^|\s)motion-reduce:active:translate-none(?:\s|$)/;

function pressProblems(cls: string, detached: boolean): string[] {
  const out: string[] = [];
  if (!PRESS.test(cls)) out.push("no press");
  if (!cls.includes(CONTROL_TRANSITION)) out.push("no translate transition");
  if (/\btransition-colors\b/.test(cls)) out.push("transition-colors cannot animate travel");
  if (detached && !TRAVEL.test(cls)) out.push("detached without travel");
  if (detached && !REDUCED.test(cls)) out.push("travel without reduced-motion guard");
  if (!detached && TRAVEL.test(cls)) out.push("flush shape travels");
  return out;
}

describe("press feedback presence", () => {
  it("every shape × size × tone presses", () => {
    const offenders: string[] = [];
    for (const shape of SHAPES)
      for (const size of SIZES)
        for (const tone of TONES)
          for (const scope of ["app", "panel"] as const) {
            const problems = pressProblems(controlClass({ shape, size, tone, scope }), DETACHED.has(shape));
            if (problems.length) offenders.push(`${shape}/${size}/${tone}/${scope}: ${problems.join(", ")}`);
          }
    expect(offenders).toEqual([]);
  });

  it("a pressed (selected) control keeps travel only", () => {
    for (const shape of SHAPES) {
      const cls = controlClass({ shape, active: true });
      expect(cls, shape).not.toMatch(/(?:^|\s)active:bg-/);
      expect(TRAVEL.test(cls), shape).toBe(DETACHED.has(shape));
    }
  });

  it("Button presses in every variant and size", () => {
    for (const variant of ["primary", "ghost", "outline", "danger"] as const)
      for (const size of ["sm", "md", "lg"] as const)
        expect(pressProblems(buttonVariants({ variant, size }), true), `${variant}/${size}`).toEqual([]);
  });

  it("ChromeTile, ChromeChip and the select trigger carry the shared press", () => {
    for (const file of ["src/shared/ui/chrome-tile.tsx", "src/shared/ui/chrome-chip.tsx", "src/shared/ui/select.tsx"]) {
      const src = readFileSync(file, "utf8");
      expect(src, file).toContain("CONTROL_TRANSITION");
      expect(src, file).toContain("CONTROL_PRESS_TRAVEL");
      expect(src, file).not.toMatch(/\btransition-colors\b/);
    }
    expect(CONTROL_PRESS_TRAVEL).toMatch(TRAVEL);
  });

  it("the probe rejects a planted control without press", () => {
    expect(pressProblems("inline-flex transition-colors", true).length).toBeGreaterThan(0);
    expect(pressProblems(`inline-flex ${CONTROL_TRANSITION} active:translate-y-px motion-reduce:translate-none`, true)).toContain(
      "travel without reduced-motion guard",
    );
    expect(pressProblems(`flex ${CONTROL_TRANSITION} active:translate-y-px`, false)).toContain("flush shape travels");
  });
});
