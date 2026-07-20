import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { render as rtlRender } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import koMessages from "../../../../messages/ko.json";
import { OntologyInspector, type VaultSelected } from "./OntologyInspector";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

/**
 * B-3 회귀 가드 — 저장된 엣지를 캔버스에서 클릭하면 부모가
 * `relationsFocusToken` 을 증가시킨다. 인스펙터는 그 신호를 받아 관계 탭으로
 * 전환해, 방금 클릭한 관계를 바로 보고 편집으로 이어갈 진입로를 준다.
 * 예전에는 저장된 엣지 클릭이 선택을 리셋하기만 해 편집 진입로가 없었다.
 */
const node: VaultSelected = {
  slug: "ontology/capabilities/sample",
  kind: "capability",
  title: "Sample",
  description: "a sample node",
  domain: "sample-domain",
  domains: ["d1"],
  capabilities: ["c1"],
  elements: ["e1"],
  dependencies: ["dep1"],
  contains: [],
  describes: [],
  relates: [],
};

function renderInspector(relationsFocusToken: number) {
  return rtlRender(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <OntologyInspector
        ephemeralSelected={null}
        vaultSelected={node}
        vaultReadOnly={false}
        onEditVaultLiteral={() => {}}
        onEditVaultArrayKey={() => {}}
        onRenameEphemeral={() => {}}
        onClearSelection={() => {}}
        relationsFocusToken={relationsFocusToken}
      />
    </NextIntlClientProvider>,
  );
}

function relationsTab(container: HTMLElement): HTMLElement {
  const tab = container.querySelector<HTMLElement>("#vault-detail-tab-relations");
  if (!tab) throw new Error("relations tab not found");
  return tab;
}

describe("OntologyInspector 관계 탭 포커스 (B-3)", () => {
  it("초기(토큰 0)에는 개요 탭이 선택돼 있다", () => {
    const { container } = renderInspector(0);
    expect(relationsTab(container).getAttribute("aria-selected")).toBe("false");
  });

  it("relationsFocusToken 이 증가하면 관계 탭으로 전환한다", () => {
    const { container, rerender } = renderInspector(0);
    expect(relationsTab(container).getAttribute("aria-selected")).toBe("false");

    rerender(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <OntologyInspector
          ephemeralSelected={null}
          vaultSelected={node}
          vaultReadOnly={false}
          onEditVaultLiteral={() => {}}
          onEditVaultArrayKey={() => {}}
          onRenameEphemeral={() => {}}
          onClearSelection={() => {}}
          relationsFocusToken={1}
        />
      </NextIntlClientProvider>,
    );

    expect(relationsTab(container).getAttribute("aria-selected")).toBe("true");
  });
});
