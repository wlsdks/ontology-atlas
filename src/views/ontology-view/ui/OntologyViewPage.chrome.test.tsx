import { NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import koMessages from "../../../../messages/ko.json";
import {
  DeeplinkNotFoundNotice,
  OntologyCommandBarHeader,
  OntologyMetaFooter,
  TreeProjectionWarnings,
} from "./OntologyViewPage";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/ko/ontology/",
}));

// jsdom 은 scrollIntoView 를 구현하지 않는다 — overflow 칩 클릭 핸들러가
// 이걸 호출하므로 없으면 throw. 다른 위젯 테스트와 같은 폴리필 패턴.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ replace: vi.fn() }),
}));

describe("DeeplinkNotFoundNotice", () => {
  it("renders nothing when there is no unresolved deeplink query", () => {
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <DeeplinkNotFoundNotice query={null} />
      </NextIntlClientProvider>,
    );

    expect(screen.queryByTestId("ontology-deeplink-not-found")).not.toBeInTheDocument();
  });

  it("shows a visible notice naming the unresolved query instead of a silent no-op", () => {
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <DeeplinkNotFoundNotice query="nonexistent-xyz" />
      </NextIntlClientProvider>,
    );

    const notice = screen.getByTestId("ontology-deeplink-not-found");
    expect(notice).toHaveTextContent("노드를 찾을 수 없음: nonexistent-xyz");
    expect(notice).toHaveAttribute("role", "status");
  });
});

describe("OntologyCommandBarHeader", () => {
  it("keeps raw graph-size counts out of visible and accessibility header chrome", () => {
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <OntologyCommandBarHeader />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("온톨로지")).toBeInTheDocument();
    expect(
      screen.getByText("개념을 선택하면 의미 · 관계 · 구현 근거가 열립니다"),
    ).toBeInTheDocument();
    expect(screen.queryByText("원천 102개 · 계층 행 283개 · 전체 관계 496개")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/원천 102개 · 계층 행 283개 · 전체 관계 496개/)).not.toBeInTheDocument();
    expect(screen.getByText("온톨로지").closest("div")).not.toHaveAttribute("title");
  });
});

describe("TreeProjectionWarnings disclosure", () => {
  it("keeps projection details behind one compact relation summary control", () => {
    const projectionBody =
      "개념 지도는 한 개념당 대표 project → domain → capability → element 경로만 계층선으로 그립니다. 여러 부모, 순환, 중복 도달까지 모두 선으로 그리면 읽기 어려워서, 나머지 관계는 접어두고 그래프 검증과 관계 편집에서 확인하게 둡니다.";

    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <TreeProjectionWarnings
          warnings={[
            'multiple parents for "domain:views"',
            'cycle detected at "capability:mcp-server"',
            'reached twice "element:operations-nav"',
            'self-parent "domain:views"',
          ]}
          open={false}
          activeTab="summary"
          onOpenSummary={() => {}}
          onClose={() => {}}
          onTabChange={() => {}}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("button", { name: "계층에 접은 관계 4건" })).toBeInTheDocument();
    expect(screen.queryByText("계층 지도에 접은 관계 4건")).not.toBeInTheDocument();
    expect(screen.queryByText("그래프 관계 · 검증 가능")).not.toBeInTheDocument();
    expect(screen.queryByText(projectionBody)).not.toBeInTheDocument();
  });
});

describe("OntologyMetaFooter", () => {
  it("does not repeat graph-size counts as visible or accessibility footer chrome", () => {
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <OntologyMetaFooter
          mode="local"
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("모드: 로컬 온톨로지 문서함")).toBeInTheDocument();
    expect(
      screen.queryByText("원천 개념 102 · 표시 행 283 · 관계 496"),
    ).not.toBeInTheDocument();
    const footer = screen.getByRole("contentinfo");
    expect(footer).not.toHaveAttribute("aria-label");
    expect(footer).not.toHaveAttribute("title");
  });
});
