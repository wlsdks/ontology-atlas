import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { TopologyNoMatchesState } from "./TopologyNoMatchesState";

const messages = {
  topology: {
    empty: {
      noMatchesTitle: "필터에 맞는 항목 없음",
      noMatchesBody: "검색어, 깊이, 허브 필터 때문에 개념과 프로젝트가 숨겨졌습니다.",
      clearFilters: "필터 해제",
    },
  },
};

function renderState(onClearFilters = vi.fn()) {
  render(
    <NextIntlClientProvider locale="ko" messages={messages}>
      <TopologyNoMatchesState onClearFilters={onClearFilters} />
    </NextIntlClientProvider>,
  );
  return { onClearFilters };
}

describe("TopologyNoMatchesState", () => {
  it("explains that filters hid topology concepts and projects", () => {
    renderState();

    expect(screen.getByRole("status")).toHaveTextContent("필터에 맞는 항목 없음");
    expect(screen.getByRole("status")).toHaveTextContent("개념과 프로젝트가 숨겨졌습니다");
  });

  it("uses a focus-visible clear action and calls the clear handler", () => {
    const { onClearFilters } = renderState();
    const button = screen.getByRole("button", { name: "필터 해제" });

    expect(button.className).toContain("focus-visible:ring-2");
    fireEvent.click(button);
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });
});
