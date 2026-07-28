import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  MAX_FRAME_DELTA_SECONDS,
  SPRING_STABILITY_LIMIT,
  stepSpring,
} from "@/widgets/topology-map-v2/engine/spring";

/**
 * 스프링의 **안정 여유**를 잰다 — 토큰과 클램프가 다른 파일에 살아서 생긴 구멍.
 *
 * ## 무엇이 걸려 있나
 *
 * 카메라는 semi-implicit Euler 로 적분한다. 이 적분기는 `ω·dt` 가 커지면
 * 발산하고, **실측 경계는 1.0** 이다 (아래 프로브가 그 경계를 케이스로 든다).
 * 발산은 곧 NaN 이고, **NaN 카메라는 모든 투영으로 전파돼 캔버스 전체가
 * 죽는다** — 지도가 통째로 사라지는 실패다.
 *
 * 오늘의 실제 여유(2026-07-28 실측):
 *   ω(interactive) = 15 · dt clamp = 0.05 → ω·dt = **0.75**
 *
 * 경계까지 1.33배뿐이다. 토큰을 20 으로만 올려도 넘어간다. 그런데 ω 는
 * `app/globals.css` 에, dt 클램프는 렌더 루프에 있어서 **한쪽만 만지는
 * 사람에게는 다른 쪽이 안 보인다.**
 *
 * ## 왜 lint 가 못 하나
 *
 * 판정에 **다른 파일의 값**이 필요하다 — `no-restricted-syntax` 는 한 파일의
 * AST 셀렉터 매칭이라 표현할 수 없다. `type-ramp-step-defined` 와 같은 근거.
 */

const CSS = readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");

/** 램프에 선언된 모든 각주파수 토큰 — 이름을 손으로 적지 않는다(빠뜨리면 사각지대). */
function angularFrequencyTokens(): Array<{ name: string; value: number }> {
  return [...CSS.matchAll(/(--topology-v2-[a-z0-9-]*angfreq[a-z0-9-]*)\s*:\s*([\d.]+)\s*;/g)]
    .map((m) => ({ name: m[1], value: Number(m[2]) }))
    // 같은 토큰이 `@theme` 와 `:root` 에 두 번 선언되는 관례라 중복을 접는다.
    .filter((entry, index, all) => all.findIndex((o) => o.name === entry.name) === index);
}

/** 목표로 수렴하면 안정, 값이 유한하지 않거나 커지면 불안정. */
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
    // 정규식이 조용히 아무것도 안 잡으면 아래 검사가 공허하게 통과한다.
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
   * 프로브 — 경계 주장이 참인지 여기서 증명한다. 이게 없으면 위 검사가
   * "경계가 1.0" 이라는 **미검증 전제** 위에 서 있다.
   */
  it("프로브: 경계 바로 아래는 수렴하고 경계에서는 발산한다", () => {
    const dt = MAX_FRAME_DELTA_SECONDS;
    expect(converges((SPRING_STABILITY_LIMIT * 0.75) / dt, dt)).toBe(true);
    expect(converges(SPRING_STABILITY_LIMIT / dt, dt)).toBe(false);
  });
});
