import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import koMessages from "../../../../messages/ko.json";
import { getOntologyKindTone } from "@/entities/ontology-class";
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

  it("expanded kind buttons expose distinct ontology tones", () => {
    renderPalette(false);

    expect(
      screen.getByRole("button", {
        name: /프로젝트.*최상위 단위/,
      }),
    ).toHaveStyle({ borderColor: getOntologyKindTone("project").chipBorder });
    expect(
      screen.getByRole("button", {
        name: /도메인.*프로젝트 안의 큰 영역/,
      }),
    ).toHaveStyle({ borderColor: getOntologyKindTone("domain").chipBorder });
    expect(
      screen.getByRole("button", {
        name: /역량.*도메인 안의 한 기능/,
      }),
    ).toHaveStyle({ borderColor: getOntologyKindTone("capability").chipBorder });
    expect(
      screen.getByRole("button", {
        name: /요소.*역량 안의 작은 구성/,
      }),
    ).toHaveStyle({ borderColor: getOntologyKindTone("element").chipBorder });
  });
});
