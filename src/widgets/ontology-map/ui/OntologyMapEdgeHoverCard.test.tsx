import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OntologyMapEdgeHoverCard } from "./OntologyMapEdgeHoverCard";

describe("OntologyMapEdgeHoverCard (P3c)", () => {
  it("renders the plain sentence, type, evidence and click hint as a non-interactive card", () => {
    render(
      <OntologyMapEdgeHoverCard
        sentence="A 가 B 를 필요로 해요"
        typeLabel="의존"
        why="쓰기 경로가 B 를 지난다"
        clickHint="클릭하면 상세 · 출처 문서"
        x={300}
        y={200}
      />,
    );
    const card = screen.getByTestId("map-edge-hover-card");
    expect(card).toHaveTextContent("A 가 B 를 필요로 해요");
    expect(card).toHaveTextContent("의존");
    expect(card).toHaveTextContent("쓰기 경로가 B 를 지난다");
    expect(card).toHaveTextContent("클릭하면 상세");
    expect(card.className).toContain("pointer-events-none");
  });

  it("with evidence, the evidence leads and the template sentence drops to a caption", () => {
    render(
      <OntologyMapEdgeHoverCard sentence="A 가 B 를 담고 있어요" typeLabel="포함" why="B 는 A 의 결제 경계 안에서만 뜻이 있다" clickHint="힌트" x={0} y={0} />,
    );
    const why = screen.getByTestId("map-edge-hover-why");
    expect(why.className).toContain("text-body");
    const paragraphs = [...screen.getByTestId("map-edge-hover-card").querySelectorAll("p")];
    expect(paragraphs.indexOf(why as HTMLParagraphElement)).toBe(2);
    expect(paragraphs[1]).toHaveTextContent("A 가 B 를 담고 있어요");
    expect(paragraphs[1].className).toContain("text-label");
  });

  it("omits the evidence line when there is no why", () => {
    render(
      <OntologyMapEdgeHoverCard sentence="S" typeLabel="포함" why={null} clickHint="힌트" x={0} y={0} />,
    );
    expect(screen.getByTestId("map-edge-hover-card").querySelectorAll("p")).toHaveLength(3);
  });
});
