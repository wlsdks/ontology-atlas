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

  it("근거가 있으면 근거가 주인공이고 템플릿 문장은 캡션으로 내려간다", () => {
    render(
      <TopologyV2EdgeHoverCard sentence="A 가 B 를 담고 있어요" typeLabel="포함" why="B 는 A 의 결제 경계 안에서만 뜻이 있다" clickHint="힌트" x={0} y={0} />,
    );
    const why = screen.getByTestId("topology-v2-edge-hover-why");
    expect(why.className).toContain("text-body");
    const paragraphs = [...screen.getByTestId("topology-v2-edge-hover-card").querySelectorAll("p")];
    expect(paragraphs.indexOf(why as HTMLParagraphElement)).toBe(2);
    expect(paragraphs[1]).toHaveTextContent("A 가 B 를 담고 있어요");
    expect(paragraphs[1].className).toContain("text-label");
  });

  it("why 없으면 근거 줄 생략", () => {
    render(
      <TopologyV2EdgeHoverCard sentence="S" typeLabel="포함" why={null} clickHint="힌트" x={0} y={0} />,
    );
    expect(screen.getByTestId("topology-v2-edge-hover-card").querySelectorAll("p")).toHaveLength(3);
  });
});
