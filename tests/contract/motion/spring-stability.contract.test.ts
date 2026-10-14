import { describe, expect, it } from "vitest";
import {
  MAX_FRAME_DELTA_SECONDS,
  SPRING_STABILITY_LIMIT,
  stepSpring,
} from "@/widgets/ontology-map/engine/spring";
import { readGlobalCss } from '../../../scripts/lib/design/global-css.mjs';

/**
 * Spring stability margin: semi-implicit Euler diverges as `w*dt` reaches 1.0, and a NaN camera kills
 * the canvas. The token and the dt clamp live in different files, so both are read here.
 */

const CSS = readGlobalCss();

/** Every angular-frequency token declared on the ramp — names are never hand-listed (a missed one is a blind spot). */
function angularFrequencyTokens(): Array<{ name: string; value: number }> {
  return [...CSS.matchAll(/(--map-[a-z0-9-]*angfreq[a-z0-9-]*)\s*:\s*([\d.]+)\s*;/g)]
    .map((m) => ({ name: m[1], value: Number(m[2]) }))
    // By convention the same token is declared twice, in `@theme` and `:root`, so duplicates are folded.
    .filter((entry, index, all) => all.findIndex((o) => o.name === entry.name) === index);
}

/** Converging on the target is stable; a non-finite or growing value is unstable. */
function converges(angularFrequency: number, dt: number): boolean {
  let state = { value: 1000, velocity: 0 };
  for (let i = 0; i < 2000; i += 1) {
    state = stepSpring(state, 0, dt, angularFrequency, 1.0);
    if (!Number.isFinite(state.value) || !Number.isFinite(state.velocity)) return false;
  }
  return Math.abs(state.value) < 1;
}

describe("스프링 안정 여유 — 토큰 × 프레임 클램프", () => {
  it("램프의 각주파수 토큰을 실제로 찾았다", () => {
    // If the regex silently matches nothing, the checks below pass vacuously.
    expect(angularFrequencyTokens().length).toBeGreaterThan(0);
  });

  it("모든 각주파수 토큰이 클램프와 곱해도 안정 경계 안에 있다", () => {
    const violations = angularFrequencyTokens()
      .map((token) => ({ ...token, product: token.value * MAX_FRAME_DELTA_SECONDS }))
      .filter((token) => token.product >= SPRING_STABILITY_LIMIT);

    expect(
      violations,
      `ω·dt 가 안정 경계(${SPRING_STABILITY_LIMIT}) 이상이면 카메라가 NaN 이 되고 캔버스가 죽는다`,
    ).toEqual([]);
  });

  it("그 곱이 실제로 수렴한다 — 산술이 아니라 적분으로 확인", () => {
    for (const token of angularFrequencyTokens()) {
      expect(
        converges(token.value, MAX_FRAME_DELTA_SECONDS),
        `${token.name} = ${token.value} 가 dt=${MAX_FRAME_DELTA_SECONDS} 에서 발산한다`,
      ).toBe(true);
    }
  });

  /**
   * The probe proving the boundary claim is true. Without it the checks above stand on
   * the **unverified premise** that the boundary is 1.0.
   */
  it("프로브: 경계 바로 아래는 수렴하고 경계에서는 발산한다", () => {
    const dt = MAX_FRAME_DELTA_SECONDS;
    expect(converges((SPRING_STABILITY_LIMIT * 0.75) / dt, dt)).toBe(true);
    expect(converges(SPRING_STABILITY_LIMIT / dt, dt)).toBe(false);
  });
});
