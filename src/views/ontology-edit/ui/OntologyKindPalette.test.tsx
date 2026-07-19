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

  it("expanded kind 카드는 채색 톤 없이 중립 border-soft 카드로 통일된다", () => {
    renderPalette(false);

    const names = [
      /프로젝트.*최상위 단위/,
      /도메인.*프로젝트 안의 큰 영역/,
      /역량.*도메인 안의 한 기능/,
      /요소.*역량 안의 작은 구성/,
    ];
    for (const name of names) {
      const button = screen.getByRole("button", { name });
      expect(button.className).toContain("border-[color:var(--color-border-soft)]");
      expect(button.className).not.toContain("borderColor");
    }
  });

  it("expanded kind 카드는 지도(Topology)와 같은 kind 글리프를 그린다", () => {
    renderPalette(false);

    const glyphs = document.querySelectorAll("[data-kind-glyph]");
    expect(glyphs.length).toBe(4);
    const kinds = Array.from(glyphs).map((el) => el.getAttribute("data-kind-glyph"));
    expect(kinds).toEqual(["project", "domain", "capability", "element"]);
  });

  it("collapsed 모드는 ChromeTile(44px) 문법으로 kind 글리프만 노출한다", () => {
    renderPalette(true);

    const glyphs = document.querySelectorAll("[data-kind-glyph]");
    expect(glyphs.length).toBe(4);
    const tile = screen.getByRole("button", { name: /^프로젝트 개념 추가/ });
    expect(tile.className).toContain("size-[var(--chrome-tile-size)]");
  });
});
