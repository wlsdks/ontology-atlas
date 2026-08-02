import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import koMessages from "../../../../messages/ko.json";
import { TopologyEmptyState } from "./TopologyEmptyState";

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

function renderEmpty(projectCount: number, reason?: "no-projects" | "no-relations") {
  return render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <TopologyEmptyState projectCount={projectCount} reason={reason} />
    </NextIntlClientProvider>,
  );
}

describe("TopologyEmptyState", () => {
  it("0 프로젝트일 때 복구 CTA 를 명확한 화면 이름으로 노출", () => {
    renderEmpty(0);
    expect(
      screen.getByRole("status", { name: /지형도에 그릴 프로젝트가 없습니다/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("개념 둘러보기").closest("a")).toHaveAttribute(
      "href",
      expect.stringContaining("/ontology"),
    );
    expect(screen.getByText("저장·편집 열기").closest("a")).toHaveAttribute(
      "href",
      expect.stringContaining("/ontology/studio"),
    );
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("보조 힌트는 별도 안내 박스로 강조하지 않는다", () => {
    renderEmpty(1, "no-relations");
    const hint = screen.getByText(
      "전체 지도 문서와 변경점은 개념 둘러보기·저장·편집에서 이어서 확인할 수 있습니다.",
    );
    expect(hint.className).not.toContain("rounded-md");
    expect(hint.className).not.toContain("border");
  });

  it("관계가 없으면 저장·편집에서 관계를 만들라는 1차 행동을 먼저 제시한다", () => {
    renderEmpty(1, "no-relations");
    const panel = screen.getByRole("status", {
      name: /아직 그릴 관계가 없습니다/,
    });

    expect(panel).toHaveTextContent("지형도 · 개념 1개 · 관계 0개");
    expect(panel).toHaveTextContent(
      "저장·편집에서 개념 사이 관계를 하나 저장하면 이 화면에 선이 나타납니다.",
    );
    expect(screen.getByText("관계 만들기").closest("a")).toHaveAttribute(
      "href",
      expect.stringContaining("/ontology/studio"),
    );
  });

  // 2026-07-24 온보딩 라운드 — 웹에서 방금 로컬 vault 를 연 사용자에게
  // "macOS 앱을 설치하고…" 다운로드 카피는 오안내다. vault 가 열려 있으면
  // picker 경로 카피/링크를 쓴다.
  it("hasOpenVault 면 다운로드 오안내 대신 picker 카피를 쓴다", () => {
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <TopologyEmptyState projectCount={0} reason="no-projects" hasOpenVault />
      </NextIntlClientProvider>,
    );
    const panel = screen.getByRole("status");
    expect(panel).not.toHaveTextContent("macOS 앱");
    expect(panel).toHaveTextContent("폴더를 열고 첫 프로젝트를 만들면 지도가 시작돼요.");
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links).not.toContain("/download/");
  });

  it("reason 이 no-projects 면 projectCount 가 있어도 빈 프로젝트 안내를 우선한다", () => {
    renderEmpty(1, "no-projects");
    expect(
      screen.getByRole("status", { name: /지형도에 그릴 프로젝트가 없습니다/ }),
    ).toBeInTheDocument();
  });

  it("한국어 빈 상태는 topology 내부 용어 대신 지형도 상태를 설명한다", () => {
    renderEmpty(0);
    const panel = screen.getByRole("status");
    expect(panel).toHaveTextContent("지형도 · 프로젝트 0개");
    expect(panel).toHaveTextContent("지형도에 그릴 프로젝트가 없습니다");
    expect(panel).not.toHaveTextContent("TOPOLOGY");
    expect(panel).not.toHaveTextContent("토폴로지");
  });

  it("빈 상태 패널은 큰 카드 대신 작은 상태 패널로 렌더", () => {
    renderEmpty(0);
    const panel = screen.getByRole("status");
    // 반지름은 **램프 토큰**이 정한다. 종전엔 `rounded-lg`(Tailwind 기본)를
    // 못박고 있었는데, 그건 이 저장소의 radius 램프 밖 값이라 규격을 지키는
    // 것처럼 보이면서 실제로는 램프를 벗어난 자리를 고정하고 있었다.
    expect(panel.className).toContain("rounded-[var(--radius-panel)]");
    expect(panel.className).not.toContain("rounded-2xl");
    expect(panel.className).not.toContain("p-8");
  });

  it("복구 행동은 폭이 전부 같다 — 글자 수가 치수를 정하지 않는다", () => {
    /*
     * 종전은 `flex-wrap justify-center` 라 버튼 폭이 글자 수로 정해지고
     * 줄바꿈 자리도 글자 수가 정했다(넷이 1·2·1 계단). 치수 규칙성 위반이고,
     * 되돌리면 여기가 터진다.
     */
    renderEmpty(0);
    const actions = [...screen.queryAllByRole("link"), ...screen.queryAllByRole("button")];
    expect(actions.length).toBeGreaterThan(1);
    for (const action of actions) {
      expect(action.className).toContain("w-full");
    }
  });

  it("모든 복구 CTA 는 키보드 focus 링을 가진다 (focus-visible, WCAG 2.4.7)", () => {
    renderEmpty(0);
    // 키보드 사용자가 어떤 복구 액션에 focus 했는지 보이지 않던 회귀 가드.
    for (const link of screen.getAllByRole("link")) {
      expect(link.className).toContain("focus-visible:ring-2");
      expect(link.className).toContain("focus-visible:outline-none");
    }
  });

  it("기본(canCreateNode 미지정) — 노드 생성 CTA 없음", () => {
    renderEmpty(0);
    expect(screen.queryByTestId("empty-create-node")).not.toBeInTheDocument();
  });

  it("canCreateNode — '개념 만들기' 1차 CTA 노출 + 클릭 시 onCreateNode (S6)", () => {
    const onCreateNode = vi.fn();
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <TopologyEmptyState projectCount={0} canCreateNode onCreateNode={onCreateNode} />
      </NextIntlClientProvider>,
    );
    const btn = screen.getByTestId("empty-create-node");
    expect(btn).toHaveTextContent("개념 만들기");
    btn.click();
    expect(onCreateNode).toHaveBeenCalledTimes(1);
  });

  it("docsFoundCount>0 + onStartFromDocs — '내 문서로 지도 만들기'가 1차 CTA 가 되고 macOS 안내는 내려간다 (Slice 1 F1/F2)", () => {
    const onStartFromDocs = vi.fn();
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <TopologyEmptyState projectCount={0} docsFoundCount={4} onStartFromDocs={onStartFromDocs} />
      </NextIntlClientProvider>,
    );
    const btn = screen.getByTestId("empty-start-from-docs");
    expect(btn).toHaveTextContent("내 문서로 지도 만들기");
    // 방금 vault 를 연 사용자에게 앱 설치를 권하던 오안내가 이 브랜치에서 사라진다
    expect(screen.queryByText(/macOS/)).not.toBeInTheDocument();
    // 사용자의 문서 존재를 먼저 인정한다 (kicker + 본문 양쪽)
    expect(screen.getAllByText(/4개/).length).toBeGreaterThanOrEqual(1);
    btn.click();
    expect(onStartFromDocs).toHaveBeenCalledTimes(1);
  });

  it("docsFoundCount=0 이면 부트스트랩 CTA 없음 — 기존 빈 vault 흐름 유지", () => {
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <TopologyEmptyState projectCount={0} docsFoundCount={0} onStartFromDocs={vi.fn()} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByTestId("empty-start-from-docs")).not.toBeInTheDocument();
  });
});
