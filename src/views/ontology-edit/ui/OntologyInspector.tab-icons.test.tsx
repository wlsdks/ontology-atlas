import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render as rtlRender, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import koMessages from "../../../../messages/ko.json";
import enMessages from "../../../../messages/en.json";
import { OntologyInspector, type VaultSelected } from "./OntologyInspector";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

const node: VaultSelected = {
  slug: "ontology/capabilities/sample",
  kind: "capability",
  title: "Sample",
  description: "a sample node",
  domain: "sample-domain",
  domains: [],
  capabilities: [],
  elements: [],
  dependencies: [],
  contains: [],
  describes: [],
  relates: [],
};

function renderInspector(locale: "ko" | "en") {
  const messages = locale === "ko" ? koMessages : enMessages;
  return rtlRender(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <OntologyInspector
        ephemeralSelected={null}
        vaultSelected={node}
        vaultReadOnly={false}
        onEditVaultLiteral={() => {}}
        onEditVaultArrayKey={() => {}}
        onRenameEphemeral={() => {}}
        onClearSelection={() => {}}
        onToggleCollapsed={() => {}}
      />
    </NextIntlClientProvider>,
  );
}

/**
 * 인스펙터 상세 탭(개요/관계/문서)에 아이콘 + 툴팁을 붙였다(빌더 소형 UX 큐
 * #5). 아이콘은 스캔 보조용이라 접근성 이름을 바꾸면 안 되고("문서" 그대로),
 * 툴팁은 짧은 레이블만으론 모호할 수 있는 탭 의미를 hover 로 보강한다.
 */
describe("OntologyInspector — 상세 탭 아이콘 · 툴팁", () => {
  it("ko: 탭 접근성 이름은 아이콘 추가 후에도 평문 레이블 그대로다", () => {
    renderInspector("ko");

    expect(screen.getByRole("tab", { name: "개요" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "관계" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "문서" })).toBeInTheDocument();
  });

  it("en: 탭 접근성 이름은 아이콘 추가 후에도 평문 레이블 그대로다", () => {
    renderInspector("en");

    expect(screen.getByRole("tab", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Relations" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Document" })).toBeInTheDocument();
  });

  it("각 탭은 장식용 아이콘(svg, aria-hidden)을 정확히 하나씩 그린다", () => {
    renderInspector("ko");

    for (const name of ["개요", "관계", "문서"]) {
      const tab = screen.getByRole("tab", { name });
      const icons = tab.querySelectorAll('svg[aria-hidden="true"]');
      expect(icons.length).toBe(1);
    }
  });

  // Radix TooltipTrigger 는 pointermove(hover) 는 delayDuration(300ms) 뒤,
  // focus 는 즉시 연다(onFocus → context.onOpen, 지연 없음) — 키보드
  // 사용자가 탭 사이를 이동할 때 툴팁이 늦게 뜨면 안 되기 때문. jsdom 에서
  // pointer hover + 타이머 조합은 신뢰도가 낮아, 두 트리거 경로 중 동기적인
  // focus 경로로 콘텐츠 등장을 검증한다(hover 경로와 열리는 콘텐츠는 동일).
  it("탭에 포커스가 가면 평문 툴팁이 뜬다 (ko)", async () => {
    renderInspector("ko");

    fireEvent.focus(screen.getByRole("tab", { name: "관계" }));
    // Radix 는 시각 콘텐츠 div + sr-only role="tooltip" span 두 곳에 같은
    // 텍스트를 렌더한다(스크린리더 라벨링용 중복) — getByText 단수 쿼리는
    // "Found multiple elements" 로 실패하므로 role 로 정확히 하나만 짚는다.
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("이 카드와 연결된 다른 카드들");
  });

  it("탭에 포커스가 가면 평문 툴팁이 뜬다 (en)", async () => {
    renderInspector("en");

    fireEvent.focus(screen.getByRole("tab", { name: "Document" }));
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent(
      "The actual document content that gets saved",
    );
  });

  it("탭 클릭 전환은 툴팁 도입 후에도 그대로 동작한다", () => {
    renderInspector("ko");

    fireEvent.click(screen.getByRole("tab", { name: "관계" }));
    expect(screen.getByRole("tab", { name: "관계" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
