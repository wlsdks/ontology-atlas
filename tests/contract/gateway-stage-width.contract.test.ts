import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 관문 무대 폭(`--gateway-stage-max`) — 넓은 폭 개정(2026-08-19)의 불변식.
 *
 * 원장 (83) 은 시연 무대를 48rem 으로 내렸다(소유자: *"동영상도 지금 너무
 * 커"* — 1512 에서 클립이 폭의 73%). 그 처방은 **비례** 문제였는데 절대 px 로
 * 굳혀서, 소유자의 2560 스크린샷에서는 반대로 무대가 뷰포트의 30%로 쪼그라들어
 * 화면이 비어 보였다. 개정은 상한을 `clamp(48rem, 40vw, 80rem)` 토큰으로
 * 올렸고, 이 시험은 그 세 값이 지는 **약속**을 잠근다:
 *
 *  (a) **바닥 = 48rem** — 원장 (83) 의 소유자 승인값. 발자국 번짐 예외가
 *      「기본 0 · 상한 6」을 못박는 것과 같은 형식의 결정값 고정이다.
 *  (b) **≤1920 무회귀 불변식** — 기울기(vw 계수)로 1920 에서 계산한 값이
 *      바닥을 넘지 않는다. 이 성질이 깨지면 게이트가 지키는 1440–1920 폭에서
 *      소유자가 승인한 768px 렌더가 조용히 움직인다. (40vw×1920 = 768 = 48rem
 *      — 성장은 가장 넓은 무회귀 폭 바로 위에서만 시작한다.)
 *  (c) **상한 ≤ 클립 원본 폭** — 시연 클립 원본은 1512px 폭이다. 상한이 그걸
 *      넘으면 1x 밀도에서 영상을 업스케일해 흐려진 것을 «더 크게» 라고 부르게
 *      된다.
 *  (d) **무대 폭의 진실원은 하나다** — 시연 절과 에이전트 장면이 전부 이
 *      토큰을 소비하고, `src/views/download/**` 에 무대 폭을 따로 정하는
 *      `max-w-[48rem]` 이 남아 있지 않다. (48rem 이 두 곳에 적히면 한쪽만
 *      고쳐지는 날이 온다 — 이 저장소가 반복해서 잡아 온 그 드리프트다.)
 *  (e) **문서 등재** — `docs/DESIGN-SYSTEM.md` 관문 표에 같은 공식이 있다.
 *      값이 코드에만 있으면 규격이 아니라 우연이다.
 *
 * 렌더된 무대가 실제로 이 토큰을 따라 자라는지(그리고 시연·에이전트 두 장면이
 * 같은 폭인지)는 `tests/e2e/download-gateway-grid.spec.ts` 가 폭별 rect 로
 * 잰다 — 여기는 정적 불변식, 거기는 실측이다.
 */

const repoRoot = join(import.meta.dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(repoRoot, rel), "utf8");

const TOKEN = "--gateway-stage-max";

/** globals.css 의 토큰 선언에서 clamp 세 값을 뽑는다. */
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
      // 주석이 아니라 className 문자열 안의 무대 폭 하드코딩만 잡는다.
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
