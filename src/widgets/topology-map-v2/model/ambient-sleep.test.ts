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

  // 각성 구간은 **종전과 1픽셀도 달라지면 안 된다** — 이 수리는 유휴 비용을
  // 없애는 것이지 보고 있는 사람의 화면을 바꾸는 것이 아니다.
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

  // 입력 하나로 다음 프레임에 완전 복귀 — idle-gate 는 wake 배선이 없는
  // 설계이므로, 이 함수가 즉시 1 을 돌려주는 것이 곧 복귀 계약이다.
  it("입력이 들어오면 즉시 1 로 복귀한다", () => {
    const deepSleep = D + R * 5;
    expect(ambientSleepFactor(deepSleep, 0)).toBe(0);
    // 그 시점에 입력 발생 → lastInput 갱신
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
  // 램프 **도중**에 게이트가 닫히면 혜성이 중간 속도에서 얼어붙는다 —
  // 없애려던 "고장난 것처럼 보임"을 오히려 만든다.
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

    expect(at(1_000)).toBe(1); // 입력 순간
    expect(at(20_000)).toBe(1); // 19초 — 아직 보고 있다
    expect(at(31_000)).toBe(1); // 정확히 30초 경계 — 아직 각성
    expect(at(32_000)).toBeCloseTo(0.5, 5); // 램프 중간
    expect(isAmbientAsleep(at(32_000))).toBe(false); // 램프 중엔 계속 그린다
    expect(at(33_000)).toBe(0); // 램프 끝 — 잠듦
    expect(isAmbientAsleep(at(33_000))).toBe(true);

    lastInput = 40_000; // 사용자가 다시 만짐
    expect(at(40_000)).toBe(1);
    expect(isAmbientAsleep(at(40_000))).toBe(false);
  });
});
