import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 오류 화면의 두 행동은 **라벨이 있는 버튼**이다 (2026-08-17 소유자 지적).
 *
 * 둘 다 `shape: "icon"` 이었다. 그건 정사각 아이콘 전용 모양이라
 * (`justify-center` · `shrink-0` · 가로 여백 없음) 라벨을 넣으면 글자가 상자를
 * 넘어 두 줄로 접히며 서로 겹친다 — 화면에 그대로 그렇게 나왔다. 하필 이
 * 화면은 **뭔가 잘못됐을 때만** 보이는 자리라, 깨진 채로도 아무도 안 마주친다.
 *
 * lint 는 이걸 못 본다: `icon` 도 `pill` 도 정당한 모양이고, 틀린 것은 값이
 * 아니라 **내용과 모양의 짝**이다.
 */
const SOURCE = readFileSync(join(process.cwd(), "app", "error.tsx"), "utf8");

/** `controlClass({ … })` 호출 하나하나. */
const controlCalls = [...SOURCE.matchAll(/controlClass\(\{[\s\S]*?\}\)/gu)].map((m) => m[0]);

describe("오류 화면의 컨트롤", () => {
  it("컨트롤을 실제로 찾았다 — 아니면 아래가 헛돈다", () => {
    expect(controlCalls.length).toBe(2);
  });

  it("라벨이 있으므로 아이콘 전용 모양을 쓰지 않는다", () => {
    const iconShaped = controlCalls.filter((call) => /shape:\s*["']icon["']/u.test(call));
    expect(iconShaped, "정사각 아이콘 모양에 글자를 넣으면 겹친다").toEqual([]);
  });

  it("두 행동 다 라벨 있는 모양(pill)이다", () => {
    for (const call of controlCalls) {
      expect(call).toMatch(/shape:\s*["']pill["']/u);
    }
  });

  it("모양이 이미 주는 것을 손으로 다시 적지 않는다", () => {
    // `pill` 이 `rounded-full` 과 `border` 를 갖는다 — 겹쳐 적으면 다음 사람이
    // 어느 쪽이 규격인지 알 수 없다.
    for (const call of controlCalls) {
      expect(call).not.toMatch(/\brounded-full\b/u);
      expect(call).not.toMatch(/className:[^}]*\bborder\s/u);
    }
  });

  it("두 행동의 라벨이 화면에 실제로 있다", () => {
    expect(SOURCE).toContain("Try again");
    expect(SOURCE).toContain("Topology home");
  });
});
