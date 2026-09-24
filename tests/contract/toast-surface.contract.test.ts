import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { composite, contrastRatio, parseColor } from "../../scripts/lib/contrast.mjs";

/**
 * **The toast is one neutral box whose tone is a small glyph** (owner, 2026-09-24:
 * *"the toast at the top — the design is poor, the colour too, and the position"*).
 *
 * Three claims, each read from the source that makes it true:
 *
 * 1. The box is drawn from the ramps the design system names for a toast: the
 *    elevated surface, `--radius-card`, and tier 1 of the shadow ladder, which
 *    `docs/DESIGN-SYSTEM.md` assigns to "toast" (it had drifted to tier 2).
 * 2. Every tone is a glyph ink with **no fill behind it**, and each ink clears 4.5:1 on
 *    the box — read from `app/globals.css`, so retuning a token re-judges this.
 * 3. The walls the toaster stands between are declared on the surfaces at the map's
 *    sides (rail, INDEX, panel) and floor (readout, first-visit hint); a lost attribute
 *    would put the box back over them.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const toastSource = read("src/shared/ui/toast.tsx");
const css = read("app/globals.css");

function token(name: string): string {
  const match = new RegExp(`${name}:\\s*([^;]+);`).exec(css);
  expect(match, `${name} 가 app/globals.css 에 없다`).not.toBeNull();
  return match![1].trim();
}

function ratioOn(fgToken: string, bgToken: string): number {
  const bg = parseColor(token(bgToken));
  const fg = parseColor(token(fgToken));
  expect(bg, `${bgToken} 를 못 읽었다`).not.toBeNull();
  expect(fg, `${fgToken} 를 못 읽었다`).not.toBeNull();
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
  it("상자는 토스트 몫의 램프로 그린다 — elevated 면, card 반경, 그림자 1단", () => {
    const box = /toast:\s*\n?\s*'([^']+)'/.exec(toastSource)?.[1] ?? "";
    expect(box, "toast 클래스가 없다").toContain("app-toast");
    expect(box).toContain("bg-[color:var(--color-elevated)]");
    expect(box).toContain("rounded-[var(--radius-card)]");
    expect(box).toContain("shadow-[var(--shadow-elevation-1)]");
    expect(box).not.toContain("--shadow-elevation-2");
  });

  it("톤은 넷이고 각자 글리프가 있다", () => {
    expect(toastSource).toMatch(/type ToastTone = 'success' \| 'info' \| 'warning' \| 'error';/);
    for (const tone of Object.keys(TONES)) {
      expect(toastSource, `${tone} 글리프가 없다`).toMatch(new RegExp(`\\b${tone}: <\\w+ size=\\{TONE_GLYPH_SIZE\\}`));
    }
  });

  it("톤은 채움 없는 글리프 잉크다 — 색 타일을 되살리지 않는다", () => {
    expect(toastSource).not.toMatch(/\[data-icon\]\]:bg-/);
    for (const [tone, ink] of Object.entries(TONES)) {
      expect(toastSource, `${tone} 가 ${ink} 를 쓰지 않는다`).toContain(
        `${tone}: '[&_[data-icon]]:text-[color:var(${ink})]'`,
      );
    }
  });

  it.each(Object.entries(TONES))("%s 글리프 잉크가 상자 위에서 4.5:1 을 넘는다", (_tone, ink) => {
    expect(ratioOn(ink, "--color-elevated")).toBeGreaterThanOrEqual(4.5);
  });

  it("본문과 보조 줄 잉크도 상자 위에서 4.5:1 을 넘는다", () => {
    expect(ratioOn("--color-text-primary", "--color-elevated")).toBeGreaterThanOrEqual(4.5);
    expect(ratioOn("--color-text-tertiary", "--color-elevated")).toBeGreaterThanOrEqual(4.5);
  });
});

describe("toast walls", () => {
  it.each([
    ["src/widgets/app-nav-rail/ui/AppNavRail.tsx", 'data-toast-wall="left"'],
    ["src/views/home/ui/TopologyIndexSlot.tsx", 'data-toast-wall={frame.exiting ? undefined : "left"}'],
    ["src/views/home/ui/TopologyAgentDock.tsx", 'data-toast-wall="right"'],
    ["src/views/home/ui/TopologyCanvasSurface.tsx", 'data-toast-wall="bottom"'],
    ["src/features/first-run-starter/ui/SampleNodeHint.tsx", 'data-toast-wall="bottom"'],
  ])("%s 가 벽을 선언한다", (path, marker) => {
    expect(read(path)).toContain(marker);
  });

  it("토스터는 벽 사이 가운데 선다 — CSS 가 두 변수를 읽는다", () => {
    const rule = /html \[data-sonner-toaster\]\[data-x-position='center'\] \{([^}]+)\}/.exec(css)?.[1] ?? "";
    expect(rule).toContain("var(--app-toast-left-wall, 0px)");
    expect(rule).toContain("var(--app-toast-right-wall, 0px)");
  });
});
