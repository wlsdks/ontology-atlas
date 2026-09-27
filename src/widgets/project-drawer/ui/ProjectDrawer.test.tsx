import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import koMessages from "../../../../messages/ko.json";
import { TaxonomyProvider } from "@/features/taxonomy";
import type { Project } from "@/entities/project";
import { ProjectDrawer } from "./ProjectDrawer";

// jsdom has no Element.scrollTo; the mode-switch and details paths call it, so it is a no-op stub.
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = function scrollTo() {};
}

/** Per-mode help renders differently and each pill's title and aria-label are individual. */

// jsdom has no matchMedia, which framer-motion's useReducedMotion calls.
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
    description: "테스트용 프로젝트 설명이에요.",
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
  // The pills sit in a closed <details>, hidden from the accessibility tree, so it is opened before
  // role queries.
  fireEvent.click(screen.getByTestId("project-drawer-more-info-summary"));
  return result;
}

describe('ProjectDrawer impact mode help', () => {
  it('gives the four mode pills distinct help titles', () => {
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

  it('uses the direction vocabulary in the depends-on and impact pill aria-labels', () => {
    renderDrawer();

    const upstream = screen.getByRole("radio", { name: /^의존 —/ });
    const downstream = screen.getByRole("radio", { name: /^영향 —/ });

    expect(upstream.getAttribute("aria-label")).toContain("필요한 대상");
    expect(downstream.getAttribute("aria-label")).toContain("필요로 하는 대상");
  });

  it('calls back on a mode pill click and shows each mode\'s own help', () => {
    // A controlled prop plus AnimatePresence is non-deterministic in jsdom, so each mode gets a
    // fresh mount.
    const onChangeImpactMode = vi.fn();
    const first = renderDrawer({ impactMode: "none", onChangeImpactMode });
    expect(
      within(screen.getByTestId("project-drawer-impact-help")).getByText(
        "강조 없이 현재 노드만 봐요",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /^의존 —/ }));
    expect(onChangeImpactMode).toHaveBeenCalledWith("upstream");
    first.unmount();

    renderDrawer({ impactMode: "upstream", onChangeImpactMode });
    expect(
      within(screen.getByTestId("project-drawer-impact-help")).getByText(
        "이 항목에 필요한 대상을 강조해요",
      ),
    ).toBeInTheDocument();
  });
});
