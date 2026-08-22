import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * **The main canvas is opaque; offscreen buffers are not.**
 *
 * Per spec, `getContext("2d", { alpha: false })` pins every pixel's alpha to 1.0,
 * and Blink uses that to set `SetContentsOpaque()` on the compositor layer — a
 * hint that blending with page content behind the canvas can be skipped.
 *
 * **This contract is needed because the benefit is invisible where it happens.**
 * The saving occurs at composite, not in JS frame time, so it never shows up in a
 * `performance.mark` profile. That makes it easy for the next person to measure,
 * see no difference, and delete the option — and reverting it leaves the screen
 * looking exactly as fine.
 *
 * ⚠️ **The opposite direction matters just as much.** Offscreen buffers
 * (`render/grid.ts`, `render/animated-background.ts`) are **composited on top of**
 * the main canvas and therefore need alpha. Spreading `alpha: false` to them makes
 * background tiles occlude each other — "it's a good option, put it everywhere"
 * is exactly how that defect arrives.
 *
 * Hence a contract test rather than a global lint rule: `no-restricted-syntax`
 * sees one file's AST and cannot tell whether a canvas is attached to the screen
 * or is a buffer.
 */

const MAIN_CANVAS = "src/widgets/topology-map-v2/ui/use-topology-loop.ts";
const OFFSCREEN = [
  "src/widgets/topology-map-v2/render/grid.ts",
  "src/widgets/topology-map-v2/render/animated-background.ts",
];

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("canvas 2d 컨텍스트 옵션 계약", () => {
  it("소스를 실제로 읽는다 — 빈 스캔은 통과가 아니라 결함이다", () => {
    expect(read(MAIN_CANVAS).length).toBeGreaterThan(1000);
    for (const rel of OFFSCREEN) expect(read(rel).length).toBeGreaterThan(200);
  });

  it("주 캔버스는 `alpha: false` 로 만든다", () => {
    const src = read(MAIN_CANVAS);
    expect(
      /getContext\(\s*["']2d["']\s*,\s*\{[^}]*alpha:\s*false/.test(src),
      "주 캔버스가 불투명 옵션 없이 만들어진다 — 컴포지터가 매 프레임 뒤 콘텐츠와 블렌딩한다",
    ).toBe(true);
  });

  it("오프스크린 버퍼에는 `alpha: false` 를 퍼뜨리지 않는다", () => {
    for (const rel of OFFSCREEN) {
      const src = read(rel);
      expect(
        /getContext\(\s*["']2d["']\s*,\s*\{[^}]*alpha:\s*false/.test(src),
        `${rel} 이 불투명으로 만들어진다 — 이 버퍼는 주 캔버스 위에 합성되므로 알파가 필요하다`,
      ).toBe(false);
    }
  });

  it("`willReadFrequently` 를 켜지 않는다 — 우리는 readback 을 안 한다", () => {
    // Per spec this hint steers toward CPU (software) raster to make readback fast.
    // A renderer that never calls `getImageData` and turns it on is discarding GPU
    // acceleration for nothing.
    const all = [MAIN_CANVAS, ...OFFSCREEN].map(read).join("\n");
    expect(all.includes("willReadFrequently")).toBe(false);
  });

  it("컨텍스트 로스트를 잡는다 — 안 잡으면 브라우저가 복구를 시도하지 않는다", () => {
    // Without preventDefault on `contextlost` there is no recovery and no
    // `contextrestored`. The rAF loop keeps running while the screen stays blank and
    // nothing throws.
    const src = read(MAIN_CANVAS);
    expect(src.includes('addEventListener("contextlost"'), "contextlost 미처리").toBe(true);
    expect(src.includes('addEventListener("contextrestored"'), "contextrestored 미처리").toBe(true);
    expect(src.includes("removeEventListener(\"contextlost\""), "리스너 정리 누락").toBe(true);
  });
});
