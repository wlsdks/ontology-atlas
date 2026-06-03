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
 * 인스펙터 키보드 focus 가시성 회귀 가드 (WCAG 2.4.7).
 *
 * 빌더 인스펙터는 노드 frontmatter 를 쓰는 주요 write surface 인데, 그 동안
 * 액션 버튼(저장·삭제·해제·배열 추가/제거·backlink)에 hover 스타일만 있고
 * focus-visible 링이 0 이라 키보드 사용자가 어느 컨트롤에 focus 했는지 보이지
 * 않았다. 전역 focus 링 규칙이 없어 컴포넌트마다 명시 필요 → 모든 버튼이
 * 코드베이스 표준 focus 링(ring-2)을 갖는지 단언한다.
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

describe("OntologyInspector 키보드 focus 가시성 (a11y, WCAG 2.4.7)", () => {
  it("렌더된 모든 버튼이 focus-visible 링을 갖는다", () => {
    const { container } = renderInspector();
    const buttons = Array.from(container.querySelectorAll("button"));
    // 최소 1개 이상의 버튼이 실제로 렌더돼야 가드가 의미 있다.
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(
        button.className,
        `버튼(aria-label="${button.getAttribute("aria-label") ?? ""}")에 focus-visible 링이 있어야 한다`,
      ).toMatch(/focus-visible:ring-2/);
      expect(button.className).toContain("focus-visible:outline-none");
    }
  });
});
