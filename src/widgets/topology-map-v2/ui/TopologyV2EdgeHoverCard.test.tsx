import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TopologyV2EdgeHoverCard } from "./TopologyV2EdgeHoverCard";

describe("TopologyV2EdgeHoverCard (P3c)", () => {
  it("평문 문장·타입·근거·클릭 힌트를 비인터랙티브 카드로 렌더한다", () => {
    render(
      <TopologyV2EdgeHoverCard
        sentence="A 가 B 에 기대요"
        typeLabel="의존"
        why="쓰기 경로가 B 를 지난다"
        clickHint="클릭하면 상세 · 출처 문서"
        x={300}
        y={200}
      />,
    );
    const card = screen.getByTestId("topology-v2-edge-hover-card");
    expect(card).toHaveTextContent("A 가 B 에 기대요");
    expect(card).toHaveTextContent("의존");
    expect(card).toHaveTextContent("쓰기 경로가 B 를 지난다");
    expect(card).toHaveTextContent("클릭하면 상세");
    expect(card.className).toContain("pointer-events-none");
  });

  it("why 없으면 근거 줄 생략", () => {
    render(
      <TopologyV2EdgeHoverCard sentence="S" typeLabel="포함" why={null} clickHint="힌트" x={0} y={0} />,
    );
    expect(screen.getByTestId("topology-v2-edge-hover-card").querySelectorAll("p")).toHaveLength(3);
  });
});
