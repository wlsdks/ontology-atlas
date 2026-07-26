import { describe, expect, it } from "vitest";
import en from "../../../../messages/en.json";
import ko from "../../../../messages/ko.json";
import {
  computeVisibleSteps,
  DESTINATION_TOURS,
  type DestinationTourId,
} from "./tour-steps";
import { destinationTourStatusKey } from "./tour-storage";

const DESTINATIONS = Object.keys(DESTINATION_TOURS) as DestinationTourId[];

/** 레일 목적지 6개 중 지도를 뺀 다섯 — 하나라도 빠지면 그 화면만 안내가 없다. */
describe("목적지 안내", () => {
  it("지도를 뺀 다섯 목적지가 모두 자기 안내를 갖는다", () => {
    expect(DESTINATIONS.sort()).toEqual(["docs", "git", "insights", "projects", "studio"]);
  });

  it("각 안내는 '무엇을 하는 곳' 한 장 + 실제 요소 한 장이다", () => {
    for (const id of DESTINATIONS) {
      const steps = DESTINATION_TOURS[id];
      expect(steps).toHaveLength(2);
      // 첫 장은 앵커 없는 중앙 카드 — 화면 어디를 가리키는지와 무관하게 뜬다.
      expect(steps[0].anchor).toBeNull();
      // 둘째 장은 화면에 실제로 있는 요소를 가리킨다(캔버스 앵커는 지도 전용).
      expect(steps[1].anchor).toEqual({ type: "testid", value: expect.any(String) });
      expect(steps.every((s) => s.persona === "all")).toBe(true);
    }
  });

  it("문구가 ko/en 양쪽에 모두 있다 — 한쪽만 채우면 다른 언어에서 키가 노출된다", () => {
    for (const id of DESTINATIONS) {
      for (const step of DESTINATION_TOURS[id]) {
        for (const [locale, messages] of [
          ["ko", ko],
          ["en", en],
        ] as const) {
          const copy = (messages.guidedTour.steps as Record<string, unknown>)[step.copyKey] as
            | { title?: string; body?: string }
            | undefined;
          expect(copy?.title, `${locale}.${step.copyKey}.title`).toBeTruthy();
          expect(copy?.body, `${locale}.${step.copyKey}.body`).toBeTruthy();
        }
      }
    }
  });

  it("'봤음' 기록은 목적지마다 따로다 — 한 화면을 본다고 나머지가 삼켜지면 안 된다", () => {
    const keys = DESTINATIONS.map((id) => destinationTourStatusKey(id));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).not.toContain("guided-tour:v1");
  });

  it("둘째 장의 앵커가 지금 화면에 없으면 한 장짜리로 접힌다", () => {
    const visible = computeVisibleSteps(DESTINATION_TOURS.docs, {
      persona: "all",
      hasSelection: false,
      canResolveAnchor: (anchor) => anchor === null,
    });
    expect(visible.map((s) => s.id)).toEqual(["docs-what"]);
  });
});
