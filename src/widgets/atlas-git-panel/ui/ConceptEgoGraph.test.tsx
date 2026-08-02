import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConceptEgoGraph } from "./ConceptEgoGraph";
import type { ConceptEgo } from "../model/build-concept-ego";

/**
 * **읽기표가 세는 수와 그림이 그리는 수는 같아야 한다.**
 *
 * 2026-08-02 실측: 「담고 있는 것 3」이라고 써 놓고 원은 둘만 보였다. 관계가
 * 한 종류뿐이면 부채가 원 전체를 차지하는데, 슬롯을 `i/(slots-1)` 로 놓으면
 * 첫 슬롯과 끝 슬롯이 **정확히 같은 각도**라 하나가 다른 하나 밑에 숨는다.
 *
 * 겹침은 빈 칸보다 나쁘다 — 사용자가 잃은 것을 모른다.
 */
function ego(count: number): ConceptEgo {
  return {
    id: "self",
    label: "쇼핑",
    kind: "domain",
    domainLabel: null,
    docSlug: "domains/shop",
    total: count,
    neighbors: {
      belongsTo: [],
      contains: Array.from({ length: count }, (_, i) => ({
        id: `n${i}`,
        label: `이웃 ${i}`,
        kind: "capability",
      })),
      dependsOn: [],
      usedBy: [],
    },
  };
}

describe("ConceptEgoGraph — 그린 이웃 수", () => {
  for (const count of [2, 3, 4, 5]) {
    it(`관계가 한 종류뿐이어도 ${count}개를 다 그린다 (겹침 0)`, () => {
      render(
        <ConceptEgoGraph
          ego={ego(count)}
          bearingLabel={() => "담고 있는 것"}
          moreLabel={(n) => `외 ${n}`}
        />,
      );
      const marks = screen.getAllByRole("img")[0].querySelectorAll("title");
      expect(marks.length).toBe(count);

      // 좌표까지 본다 — 같은 자리에 둘이 앉으면 개수는 맞아도 하나는 안 보인다.
      const centers = [...screen.getAllByRole("img")[0].querySelectorAll("circle")]
        .map((c) => `${c.getAttribute("cx")},${c.getAttribute("cy")}`)
        .filter((v) => !v.includes("null"));
      expect(new Set(centers).size).toBe(centers.length);
    });
  }
});
