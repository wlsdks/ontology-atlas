import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import koMessages from "../../../../messages/ko.json";
import { TaxonomyProvider } from "@/features/taxonomy";
import type { Project } from "@/entities/project";
import { ProjectDrawer } from "./ProjectDrawer";

// jsdom 은 Element.scrollTo 를 구현하지 않는다 — 모드 전환/details 열기 경로가
// aside ref 에서 호출하므로 no-op 으로 stub(환경 갭, 구현 결함 아님).
if (!Element.prototype.scrollTo) {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  Element.prototype.scrollTo = function scrollTo() {};
}

/**
 * design-council B6 rank16 회귀 가드 — ProjectDrawer 임팩트 모드 4필이
 * 서로 다른 그래프 연산을 트리거하는데 도움말이 항상 같은 한 줄이었다.
 * 여기서는 (1) 모드별 도움말이 서로 다르게 렌더되는지, (2) 각 필의
 * title/aria-label 이 개별화됐는지(터치·VoiceOver 도달)를 고정한다.
 */

// jsdom 은 matchMedia 미구현 — framer-motion 의 useReducedMotion() 이 내부적으로
// window.matchMedia 를 호출해 throw 한다 (HubRail.a11y.test.tsx 와 동일 stub).
if (typeof window.matchMedia !== "function") {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    slug: "demo-project",
    name: "데모 프로젝트",
    category: "service",
    status: "active",
    description: "테스트용 프로젝트 설명입니다.",
    tags: [],
    stack: [],
    links: [],
    dependencies: [],
    screenshots: [],
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

function renderDrawer(
  props: Partial<React.ComponentProps<typeof ProjectDrawer>> = {},
) {
  const project = props.project ?? makeProject();
  const result = render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <TaxonomyProvider>
        <ProjectDrawer
          project={project}
          allProjects={props.allProjects ?? (project ? [project] : [])}
          impactMode={props.impactMode ?? "none"}
          onChangeImpactMode={props.onChangeImpactMode ?? vi.fn()}
          onClose={props.onClose ?? vi.fn()}
          onSelectProject={props.onSelectProject ?? vi.fn()}
        />
      </TaxonomyProvider>
    </NextIntlClientProvider>,
  );
  // 임팩트 모드 필은 "기본 정보 더 보기" <details> 안에 있다 — native
  // <details> 는 닫힌 동안 브라우저가 내부적으로 콘텐츠를 접근성 트리에서
  // 숨기므로, role 쿼리 전에 명시적으로 펼친다.
  fireEvent.click(screen.getByTestId("project-drawer-more-info-summary"));
  return result;
}

describe("ProjectDrawer 임팩트 모드 도움말 (rank16)", () => {
  it("4개 모드 필이 서로 다른 title(도움말)을 갖는다", () => {
    renderDrawer();

    const none = screen.getByRole("button", { name: /^기본 —/ });
    const upstream = screen.getByRole("button", { name: /^의존 —/ });
    const downstream = screen.getByRole("button", { name: /^영향 —/ });
    const network = screen.getByRole("button", { name: /^네트워크 —/ });

    const titles = [none, upstream, downstream, network].map((btn) =>
      btn.getAttribute("title"),
    );
    // 4개 모두 값이 있고, 서로 겹치지 않는다 — 이전엔 title 자체가 없었다.
    expect(titles.every((title) => Boolean(title))).toBe(true);
    expect(new Set(titles).size).toBe(4);
  });

  it("의존/영향 필의 aria-label 이 rank13 방향 어휘를 그대로 쓴다", () => {
    renderDrawer();

    const upstream = screen.getByRole("button", { name: /^의존 —/ });
    const downstream = screen.getByRole("button", { name: /^영향 —/ });

    expect(upstream.getAttribute("aria-label")).toContain("기대는 곳");
    expect(downstream.getAttribute("aria-label")).toContain("기대받는 곳");
  });

  it("모드 필 클릭은 콜백을 부르고, 각 모드는 자기 도움말 문구를 보인다", () => {
    // controlled 컴포넌트(impactMode=prop) + AnimatePresence 교체는 jsdom 에서
    // 비결정적이라, 같은 인스턴스를 rerender 하지 않고 모드별 fresh 마운트로
    // 각 도움말을 결정론적으로 고정한다(클릭→콜백 배선은 별도 검증).
    const onChangeImpactMode = vi.fn();
    const first = renderDrawer({ impactMode: "none", onChangeImpactMode });
    expect(
      within(screen.getByTestId("project-drawer-impact-help")).getByText(
        "강조 없이 현재 노드만 봅니다",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^의존 —/ }));
    expect(onChangeImpactMode).toHaveBeenCalledWith("upstream");
    first.unmount();

    renderDrawer({ impactMode: "upstream", onChangeImpactMode });
    expect(
      within(screen.getByTestId("project-drawer-impact-help")).getByText(
        "이게 기대는 곳을 강조합니다",
      ),
    ).toBeInTheDocument();
  });
});
