import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render as rtlRender, screen } from "@testing-library/react";
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
 * 인스펙터 라벨-입력 연결 회귀 가드 (#296).
 *
 * LiteralEditor / ArrayKeyEditor 의 필드 라벨이 `htmlFor` 로, 입력이 같은 `id` 로
 * 연결돼야 접근성 트리에서 입력의 accessible name 이 visible 라벨이 된다. #296
 * 이전엔 라벨이 `<p>` 라 연결이 없어 accessible name 이 placeholder 로 떨어졌다.
 * editable(writable vault) 분기에서 9개 에디터의 label↔input 연결을 단언한다.
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

function renderInspector() {
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
      />
    </NextIntlClientProvider>,
  );
}

const LITERAL_EDITOR_IDS = [
  "literal-domain",
  "literal-description",
];

const ARRAY_EDITOR_IDS = [
  "array-domains",
  "array-capabilities",
  "array-elements",
  "array-dependencies",
  "array-contains",
  "array-describes",
  "array-relates",
];

describe("OntologyInspector 라벨-입력 연결 (a11y, #296)", () => {
  it.each(LITERAL_EDITOR_IDS)("문서 탭의 '%s' 라벨이 같은 id 의 입력과 연결돼 있다", (id) => {
    const { container } = renderInspector();
    fireEvent.click(screen.getByRole("tab", { name: "문서" }));
    const label = container.querySelector(`label[for="${id}"]`);
    const field = container.querySelector(`#${id}`);
    expect(label, `label[for="${id}"] 가 있어야 한다`).not.toBeNull();
    expect(field, `id="${id}" 입력이 있어야 한다`).not.toBeNull();
    // htmlFor 가 실제 입력 요소(input/textarea)를 가리켜야 한다.
    expect(field?.tagName.toLowerCase()).toMatch(/^(input|textarea)$/);
  });

  it.each(ARRAY_EDITOR_IDS)("관계 탭의 '%s' 라벨이 같은 id 의 입력과 연결돼 있다", (id) => {
    const { container } = renderInspector();
    fireEvent.click(screen.getByRole("tab", { name: "관계" }));
    const label = container.querySelector(`label[for="${id}"]`);
    const field = container.querySelector(`#${id}`);
    expect(label, `label[for="${id}"] 가 있어야 한다`).not.toBeNull();
    expect(field, `id="${id}" 입력이 있어야 한다`).not.toBeNull();
    expect(field?.tagName.toLowerCase()).toMatch(/^(input|textarea)$/);
  });

  it("기본 개요 탭은 이름과 경로만 먼저 보여준다", () => {
    renderInspector();

    expect(screen.getByRole("tab", { name: "개요" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByLabelText("이름")).toBeInTheDocument();
    expect(screen.queryByLabelText("한 줄 설명")).toBeNull();
    expect(screen.queryByLabelText("포함된 도메인")).toBeNull();
  });

  it("vault 편집 footer 가 이름 외 frontmatter 저장 흐름도 설명한다", () => {
    renderInspector();
    fireEvent.click(screen.getByRole("tab", { name: "문서" }));
    const footer = screen.getByText(/설명·도메인은 편집 후 저장되고/);

    expect(footer.textContent).toContain("관계 변경");
    expect(footer.textContent).not.toContain("이름만");
  });

  it("문서 탭에서 같은 원문 마크다운으로 이동할 수 있다", () => {
    renderInspector();
    fireEvent.click(screen.getByRole("tab", { name: "문서" }));

    const sourceLink = screen.getByRole("link", { name: "원문 문서 열기" });

    expect(sourceLink).toHaveAttribute(
      "href",
      "/docs/?slug=ontology%2Fcapabilities%2Fsample",
    );
    expect(screen.getByText("ontology/capabilities/sample.md")).toBeInTheDocument();
  });
});
