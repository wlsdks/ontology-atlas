import { describe, expect, it } from "vitest";
import {
  AMBIENT_SLEEP_DELAY_MS,
  AMBIENT_SLEEP_RAMP_MS,
  ambientSleepFactor,
  isAmbientAsleep,
} from "./ambient-sleep";

describe("ambientSleepFactor", () => {
  const D = AMBIENT_SLEEP_DELAY_MS;
  const R = AMBIENT_SLEEP_RAMP_MS;

  // The awake span must **not differ from before by one pixel** — this fix removes
  // idle cost, it does not change the screen of someone who is looking at it.
  it("입력 직후부터 지연 끝까지는 정확히 1", () => {
    expect(ambientSleepFactor(0, 0)).toBe(1);
    expect(ambientSleepFactor(D / 2, 0)).toBe(1);
    expect(ambientSleepFactor(D, 0)).toBe(1);
  });

  it("지연 뒤 램프 구간에서 1 → 0 으로 단조 감소한다", () => {
    const quarter = ambientSleepFactor(D + R * 0.25, 0);
    const half = ambientSleepFactor(D + R * 0.5, 0);
    const threeQuarter = ambientSleepFactor(D + R * 0.75, 0);
    expect(quarter).toBeCloseTo(0.75, 5);
    expect(half).toBeCloseTo(0.5, 5);
    expect(threeQuarter).toBeCloseTo(0.25, 5);
    expect(quarter).toBeGreaterThan(half);
    expect(half).toBeGreaterThan(threeQuarter);
  });

  it("램프가 끝나면 0 이고 그 뒤로도 0 이다", () => {
    expect(ambientSleepFactor(D + R, 0)).toBe(0);
    expect(ambientSleepFactor(D + R * 10, 0)).toBe(0);
    expect(ambientSleepFactor(D + 3_600_000, 0)).toBe(0);
  });

  // One input restores everything on the next frame. `idle-gate` has no wake
  // wiring by design, so this function returning 1 immediately *is* the contract.
  it("입력이 들어오면 즉시 1 로 복귀한다", () => {
    const deepSleep = D + R * 5;
    expect(ambientSleepFactor(deepSleep, 0)).toBe(0);
    // Input arrives at that moment → lastInput updates
    expect(ambientSleepFactor(deepSleep, deepSleep)).toBe(1);
  });

  it("음수 경과(시계 역행·초기화 직후)는 각성으로 친다", () => {
    expect(ambientSleepFactor(0, 1000)).toBe(1);
  });

  it("NaN 경과에도 각성으로 폴백한다 (얼어붙는 실패 모드 금지)", () => {
    expect(ambientSleepFactor(Number.NaN, 0)).toBe(1);
    expect(ambientSleepFactor(0, Number.NaN)).toBe(1);
  });

  it("rampMs 가 0 이면 지연 직후 바로 0", () => {
    expect(ambientSleepFactor(D + 1, 0, D, 0)).toBe(0);
    expect(ambientSleepFactor(D, 0, D, 0)).toBe(1);
  });
});

describe("isAmbientAsleep", () => {
  // Closing the condition **mid-ramp** freezes the comets at partial speed, which
  // manufactures the "looks broken" it exists to avoid.
  it("램프 중(계수 > 0)에는 아직 잠들지 않은 것으로 친다", () => {
    expect(isAmbientAsleep(1)).toBe(false);
    expect(isAmbientAsleep(0.5)).toBe(false);
    expect(isAmbientAsleep(0.001)).toBe(false);
  });

  it("계수가 0 이어야 잠든 것", () => {
    expect(isAmbientAsleep(0)).toBe(true);
  });
});

describe("휴면 계약 — 통합 시나리오", () => {
  it("30초 무입력이면 잠들고, 클릭 한 번에 깬다", () => {
    let lastInput = 1_000;
    const at = (ms: number) => ambientSleepFactor(ms, lastInput);

    expect(at(1_000)).toBe(1); // moment of input
    expect(at(20_000)).toBe(1); // 19 s — still looking
    expect(at(31_000)).toBe(1); // exactly the 30 s boundary — still awake
    expect(at(32_000)).toBeCloseTo(0.5, 5); // mid-ramp
    expect(isAmbientAsleep(at(32_000))).toBe(false); // keep drawing while ramping
    expect(at(33_000)).toBe(0); // ramp done — asleep
    expect(isAmbientAsleep(at(33_000))).toBe(true);

    lastInput = 40_000; // the user touches it again
    expect(at(40_000)).toBe(1);
    expect(isAmbientAsleep(at(40_000))).toBe(false);
  });
});
