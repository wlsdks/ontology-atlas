import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The error screen's two actions are **buttons with labels** (owner, 2026-08-17).
 *
 * Both used `shape: "icon"`, which is the square icon-only shape
 * (`justify-center` · `shrink-0` · no horizontal padding). With a label the text
 * overflows the box, wraps to two lines, and overlaps itself — which is exactly
 * how it rendered. And this screen is only visible **when something has already
 * gone wrong**, so it can stay broken without anyone meeting it.
 *
 * lint cannot see this: `icon` and `pill` are both legitimate shapes, and what is
 * wrong is not a value but **the pairing of content and shape.**
 */
const SOURCE = readFileSync(join(process.cwd(), "app", "error.tsx"), "utf8");

/** Each individual `controlClass({ … })` call. */
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
    // `pill` already carries `rounded-full` and `border` — repeating them leaves the
    // next person unable to tell which side is the spec.
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
