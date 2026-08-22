import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import koMessages from "../../../../messages/ko.json";
import { TaxonomyProvider } from "@/features/taxonomy";
import type { Project } from "@/entities/project";
import { ProjectDrawer } from "./ProjectDrawer";

// jsdom does not implement Element.scrollTo — the mode-switch and details-open paths
// call it from the aside ref, so it is stubbed as a no-op (an environment gap, not an
// implementation defect).
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = function scrollTo() {};
}

/**
 * design-council B6 rank16 regression guard — ProjectDrawer's 4 impact-mode pills
 * trigger different graph operations while the help text was always the same line.
 * This pins (1) that the per-mode help renders differently and (2) that each pill's
 * title/aria-label is individualised (reaching touch and VoiceOver).
 */

// jsdom does not implement matchMedia — framer-motion's useReducedMotion() calls
// window.matchMedia internally and throws (the same stub as HubRail.a11y.test.tsx).
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
  // The impact-mode pills sit inside the "기본 정보 더 보기" (show more basic info)
  // <details>. A native <details> hides its content from the accessibility tree while
  // closed, so it is expanded explicitly before any role query.
  fireEvent.click(screen.getByTestId("project-drawer-more-info-summary"));
  return result;
}

describe("ProjectDrawer 임팩트 모드 도움말 (rank16)", () => {
  it("4개 모드 필이 서로 다른 title(도움말)을 갖는다", () => {
    renderDrawer();

    const none = screen.getByRole("radio", { name: /^기본 —/ });
    const upstream = screen.getByRole("radio", { name: /^의존 —/ });
    const downstream = screen.getByRole("radio", { name: /^영향 —/ });
    const network = screen.getByRole("radio", { name: /^네트워크 —/ });

    const titles = [none, upstream, downstream, network].map((btn) =>
      btn.getAttribute("title"),
    );
    // All four have a value and none overlap — previously there was no title at all.
    expect(titles.every((title) => Boolean(title))).toBe(true);
    expect(new Set(titles).size).toBe(4);
  });

  it("의존/영향 필의 aria-label 이 rank13 방향 어휘를 그대로 쓴다", () => {
    renderDrawer();

    const upstream = screen.getByRole("radio", { name: /^의존 —/ });
    const downstream = screen.getByRole("radio", { name: /^영향 —/ });

    expect(upstream.getAttribute("aria-label")).toContain("필요한 대상");
    expect(downstream.getAttribute("aria-label")).toContain("필요로 하는 대상");
  });

  it("모드 필 클릭은 콜백을 부르고, 각 모드는 자기 도움말 문구를 보인다", () => {
    // A controlled component (impactMode=prop) plus an AnimatePresence swap is
    // non-deterministic in jsdom, so each help text is pinned deterministically with a
    // fresh mount per mode rather than re-rendering one instance (the click → callback
    // wiring is verified separately).
    const onChangeImpactMode = vi.fn();
    const first = renderDrawer({ impactMode: "none", onChangeImpactMode });
    expect(
      within(screen.getByTestId("project-drawer-impact-help")).getByText(
        "강조 없이 현재 노드만 봅니다",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /^의존 —/ }));
    expect(onChangeImpactMode).toHaveBeenCalledWith("upstream");
    first.unmount();

    renderDrawer({ impactMode: "upstream", onChangeImpactMode });
    expect(
      within(screen.getByTestId("project-drawer-impact-help")).getByText(
        "이 항목에 필요한 대상을 강조합니다",
      ),
    ).toBeInTheDocument();
  });
});
