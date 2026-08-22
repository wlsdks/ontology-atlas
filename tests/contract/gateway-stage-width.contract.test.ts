import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The gateway stage width (`--gateway-stage-max`) — the invariants of the
 * wide-width revision (2026-08-19).
 *
 * Ledger entry (83) brought the demo stage down to 48rem (owner: *"동영상도 지금
 * 너무 커"* — the video is too big right now; at 1512 the clip took 73% of the
 * width). That prescription addressed a **proportion** problem but froze it in
 * absolute px, so on the owner's 2560 screenshot the stage shrank to 30% of the
 * viewport and the screen looked empty. The revision raised the cap to a
 * `clamp(48rem, 40vw, 80rem)` token, and this test locks the **promises** those
 * three values carry:
 *
 *  (a) **Floor = 48rem** — the owner-approved value from ledger (83). The same
 *      form of pinned decision as the footprint bloom exception pinning
 *      "default 0, cap 6".
 *  (b) **No-regression invariant at ≤1920** — the slope (the vw coefficient)
 *      evaluated at 1920 does not exceed the floor. Break this and the
 *      owner-approved 768px render moves silently across the 1440–1920 widths the
 *      gate protects. (40vw×1920 = 768 = 48rem — growth starts only just above the
 *      widest no-regression width.)
 *  (c) **Cap ≤ the clip's source width** — the demo clip's source is 1512px wide.
 *      A larger cap upscales the video at 1x density, and we would be calling a
 *      blurrier picture "bigger".
 *  (d) **One source of truth for the stage width** — the demo section and the
 *      agent scene both consume this token, and no `max-w-[48rem]` setting the
 *      stage width separately remains in `src/views/download/**`. (Write 48rem in
 *      two places and a day comes when only one is updated — the drift this
 *      repository has caught repeatedly.)
 *  (e) **Documented** — the gateway table in `docs/DESIGN-SYSTEM.md` carries the
 *      same formula. A value that exists only in code is a coincidence, not a spec.
 *
 * Whether the rendered stage actually grows with this token (and whether the demo
 * and agent scenes share a width) is measured per width with rects by
 * `tests/e2e/download-gateway-grid.spec.ts` — static invariants here, measurement
 * there.
 */

const repoRoot = join(import.meta.dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(repoRoot, rel), "utf8");

const TOKEN = "--gateway-stage-max";

/** Extracts the three clamp values from the token declaration in globals.css. */
function parseStageClamp(css: string): { floorRem: number; slopeVw: number; capRem: number } {
  const match = css.match(
    /--gateway-stage-max:\s*clamp\(\s*([\d.]+)rem\s*,\s*([\d.]+)vw\s*,\s*([\d.]+)rem\s*\)/,
  );
  expect(
    match,
    `${TOKEN} 이 app/globals.css 에 clamp(<rem>, <vw>, <rem>) 꼴로 선언돼 있어야 한다`,
  ).not.toBeNull();
  const [, floor, slope, cap] = match!;
  return { floorRem: Number(floor), slopeVw: Number(slope), capRem: Number(cap) };
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (/\.(?:ts|tsx|css)$/.test(name)) out.push(full);
  }
  return out;
}

describe("관문 무대 폭 — --gateway-stage-max 의 불변식", () => {
  const css = read("app/globals.css");
  const clamp = parseStageClamp(css);

  it("(a) 바닥은 48rem — 원장 (83) 의 소유자 승인값이다", () => {
    expect(clamp.floorRem).toBe(48);
  });

  it("(b) ≤1920 무회귀 — 기울기가 1920 에서 바닥을 넘지 않는다", () => {
    const slopeAt1920 = (clamp.slopeVw / 100) * 1920;
    const floorPx = clamp.floorRem * 16;
    expect(
      slopeAt1920,
      `기울기 ${clamp.slopeVw}vw 는 1920 에서 ${slopeAt1920}px — 바닥(${floorPx}px)을 넘으면 ` +
        "게이트가 지키는 1440–1920 폭의 렌더가 움직인다",
    ).toBeLessThanOrEqual(floorPx);
  });

  it("(c) 상한은 클립 원본 폭(1512px)을 넘지 않는다", () => {
    const capPx = clamp.capRem * 16;
    expect(capPx).toBeGreaterThanOrEqual(clamp.floorRem * 16);
    expect(
      capPx,
      "상한이 클립 원본(1512px 폭)을 넘으면 1x 밀도에서 영상을 업스케일하게 된다",
    ).toBeLessThanOrEqual(1512);
  });

  it("(d) 무대 폭의 진실원은 토큰 하나다 — 소비 2곳 + 로컬 48rem 0곳", () => {
    const downloadFiles = walk(join(repoRoot, "src", "views", "download"));
    const consumers: string[] = [];
    const strays: string[] = [];
    for (const file of downloadFiles) {
      const text = readFileSync(file, "utf8");
      const rel = relative(repoRoot, file).replace(/\\/g, "/");
      if (text.includes("max-w-[var(--gateway-stage-max)]")) consumers.push(rel);
      // Catches hardcoded stage widths inside className strings, not in comments.
      if (/max-w-\[48rem\]/.test(text)) strays.push(rel);
    }
    expect(
      consumers.sort(),
      "시연 무대(DemoStage)와 에이전트 장면(DownloadPage)이 같은 토큰을 소비해야 한다",
    ).toEqual([
      "src/views/download/ui/DemoStage.tsx",
      "src/views/download/ui/DownloadPage.tsx",
    ]);
    expect(strays, "무대 폭을 따로 정하는 max-w-[48rem] 이 남아 있다").toEqual([]);
  });

  it("(e) DESIGN-SYSTEM.md 관문 표에 같은 공식이 등재돼 있다", () => {
    const doc = read("docs/DESIGN-SYSTEM.md");
    expect(doc).toContain(TOKEN);
    expect(
      doc,
      "문서의 공식이 코드와 다르다 — 값의 정본은 하나여야 한다",
    ).toContain(`clamp(${clamp.floorRem}rem, ${clamp.slopeVw}vw, ${clamp.capRem}rem)`);
  });
});
