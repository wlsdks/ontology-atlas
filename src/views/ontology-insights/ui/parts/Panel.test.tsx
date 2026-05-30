import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Panel } from "./Panel";

describe("Panel", () => {
  it("renders the title as a level-2 heading (insights 페이지 document outline / SR 탐색)", () => {
    // 인사이트 페이지는 h1 "Insights" 아래 여러 Panel 섹션 — 각 패널 제목이
    // h2 라야 시각적 위계 + 스크린리더 heading 탐색이 동작한다. 이전엔 <p> 라
    // 12개 섹션에 heading 이 1~2개뿐이었다.
    render(
      <Panel title="Hub nodes">
        <div>body</div>
      </Panel>,
    );
    const heading = screen.getByRole("heading", { level: 2, name: "Hub nodes" });
    expect(heading).toBeTruthy();
  });

  it("keeps the subtitle as non-heading descriptive text", () => {
    render(
      <Panel title="Domain coupling" subtitle="boundary pressure">
        x
      </Panel>,
    );
    expect(
      screen.getByRole("heading", { level: 2, name: "Domain coupling" }),
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "boundary pressure" })).toBeNull();
  });
});
