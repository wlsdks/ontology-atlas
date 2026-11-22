import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { composite, contrastRatio, parseColor } from "../../../scripts/lib/design/contrast.mjs";
import { readGlobalCss } from '../../../scripts/lib/design/global-css.mjs';

/**
 * The toast is one neutral box drawn from the elevated surface, `--radius-card` and shadow tier 1
 * (`docs/DESIGN-SYSTEM.md`); each tone is a glyph ink clearing 4.5:1 on the box with no fill.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const toastSource = read("src/shared/ui/toast/toast.tsx");
const css = readGlobalCss();

function token(name: string): string {
  const match = new RegExp(`${name}:\\s*([^;]+);`).exec(css);
  expect(match, `${name} is missing from app/globals.css`).not.toBeNull();
  return match![1].trim();
}

function ratioOn(fgToken: string, bgToken: string): number {
  const bg = parseColor(token(bgToken));
  const fg = parseColor(token(fgToken));
  expect(bg, `could not read ${bgToken}`).not.toBeNull();
  expect(fg, `could not read ${fgToken}`).not.toBeNull();
  const solidBg = bg!;
  return contrastRatio(composite(fg!, solidBg), solidBg);
}

const TONES = {
  success: "--color-status-success",
  info: "--color-text-tertiary",
  warning: "--color-status-warning",
  error: "--color-danger-text",
} as const;

describe("toast box", () => {
  it("the box is drawn with the toast's share of the ramp — elevated face, card radius, one shadow step", () => {
    const box = /toast:\s*\n?\s*'([^']+)'/.exec(toastSource)?.[1] ?? "";
    expect(box, "no toast class").toContain("app-toast");
    expect(box).toContain("bg-[color:var(--color-elevated)]");
    expect(box).toContain("rounded-[var(--radius-card)]");
    expect(box).toContain("shadow-[var(--shadow-elevation-1)]");
    expect(box).not.toContain("--shadow-elevation-2");
  });

  it("there are four tones and each has a glyph", () => {
    expect(toastSource).toMatch(/type ToastTone = 'success' \| 'info' \| 'warning' \| 'error';/);
    for (const tone of Object.keys(TONES)) {
      expect(toastSource, `${tone} has no glyph`).toMatch(new RegExp(`\\b${tone}: <\\w+ size=\\{TONE_GLYPH_SIZE\\}`));
    }
  });

  it("a tone is an unfilled glyph ink — the colour tile is not revived", () => {
    expect(toastSource).not.toMatch(/\[data-icon\]\]:bg-/);
    for (const [tone, ink] of Object.entries(TONES)) {
      expect(toastSource, `${tone} does not use ${ink}`).toContain(
        `${tone}: '[&_[data-icon]]:text-[color:var(${ink})]'`,
      );
    }
  });

  it.each(Object.entries(TONES))("%s glyph ink exceeds 4.5:1 on the box", (_tone, ink) => {
    expect(ratioOn(ink, "--color-elevated")).toBeGreaterThanOrEqual(4.5);
  });

  it("body and secondary-line ink also exceed 4.5:1 on the box", () => {
    expect(ratioOn("--color-text-primary", "--color-elevated")).toBeGreaterThanOrEqual(4.5);
    expect(ratioOn("--color-text-tertiary", "--color-elevated")).toBeGreaterThanOrEqual(4.5);
  });
});

const WALLS = [
    ["src/widgets/app-nav-rail/ui/AppNavRail.tsx", 'data-toast-wall="left"'],
    ["src/views/home/ui/map-panels/TopologyIndexSlot.tsx", 'data-toast-wall={frame.exiting ? undefined : "left"}'],
    ["src/views/home/ui/map-overlays/TopologyAgentDock.tsx", 'data-toast-wall="right"'],
    ["src/views/home/ui/map-surfaces/TopologyCanvasSurface.tsx", 'data-toast-wall="bottom"'],
] as const;

describe("toast walls", () => {
  it("covers a nonempty set of active wall owners", () => {
    expect(WALLS.length).toBeGreaterThan(0);
  });
  it.each(WALLS)("%s declares the wall", (path, marker) => {
    expect(read(path)).toContain(marker);
  });

  it("the toaster stands centred between the walls — CSS reads the two variables", () => {
    const rule = /html \[data-sonner-toaster\]\[data-x-position='center'\] \{([^}]+)\}/.exec(css)?.[1] ?? "";
    expect(rule).toContain("var(--app-toast-left-wall, 0px)");
    expect(rule).toContain("var(--app-toast-right-wall, 0px)");
  });
});
