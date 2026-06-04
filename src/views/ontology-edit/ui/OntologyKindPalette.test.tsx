import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import koMessages from "../../../../messages/ko.json";
import { OntologyKindPalette } from "./OntologyKindPalette";

function renderPalette(collapsed: boolean) {
  render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <OntologyKindPalette
        collapsed={collapsed}
        onAddNode={vi.fn()}
        onToggleCollapsed={vi.fn()}
      />
    </NextIntlClientProvider>,
  );
}

describe("OntologyKindPalette", () => {
  it("collapsed expand 버튼은 32px hit target 을 유지한다", () => {
    renderPalette(true);

    expect(screen.getByRole("button", { name: "팔레트 펼치기" }).className).toContain(
      "h-8 w-8",
    );
  });

  it("expanded collapse 버튼도 32px hit target 을 유지한다", () => {
    renderPalette(false);

    expect(screen.getByRole("button", { name: "팔레트 접기 (캔버스 공간 확보)" }).className).toContain(
      "h-8 w-8",
    );
  });
});
