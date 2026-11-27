import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import koMessages from "../../../../messages/ko.json";
import { TaxonomyProvider } from "@/features/taxonomy";
import type { Project } from "@/entities/project";
import type { VaultDoc } from "@/entities/docs-vault";
import { LocalVaultContext, type LocalVaultValue } from "@/entities/vault-session/model/vault-provider/local-vault-context";
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

/** An open folder holding one document that names the project, readable through its file handle. */
function folderNaming(name: string): LocalVaultValue {
  const doc = {
    slug: "notes/launch",
    path: "notes/launch.md",
    title: `${name} launch`,
    tags: [],
    frontmatter: {},
    headings: [],
    linksOut: [],
    mtime: 1,
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as unknown as VaultDoc;
  const file = { getFile: async () => new File([`# ${name} launch\n\nThe plan for ${name}.`], "launch.md") } as unknown as FileSystemFileHandle;
  return {
    status: "loaded",
    isReloadingSameVault: false,
    handle: {} as FileSystemDirectoryHandle,
    fileHandles: new Map([["notes/launch", file]]),
    manifest: { docs: [doc] },
  } as unknown as LocalVaultValue;
}

function renderDrawer(
  props: Partial<React.ComponentProps<typeof ProjectDrawer>> = {},
  folder: LocalVaultValue | null = null,
) {
  const project = props.project ?? makeProject();
  const result = render(
    <LocalVaultContext.Provider value={folder ?? ({ status: "idle", manifest: null } as unknown as LocalVaultValue)}>
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
      </NextIntlClientProvider>
    </LocalVaultContext.Provider>,
  );
  // The pills sit in a closed <details>, hidden from the accessibility tree, so it is opened before
  // role queries.
  fireEvent.click(screen.getByTestId("project-drawer-more-info-summary"));
  return result;
}

describe("ProjectDrawer related documents", () => {
  it("shows the section only once every row has its excerpt, never empty first", async () => {
    const dependency = makeProject({ slug: "payments", name: "Payments" });
    const project = makeProject({ slug: "storefront", name: "Online Store", dependencies: ["payments"] });
    renderDrawer({ project, allProjects: [project, dependency] }, folderNaming("Online Store"));
    expect(screen.queryByTestId("project-drawer-related-docs")).toBeNull();
    const section = await screen.findByTestId("project-drawer-related-docs");
    const rows = within(section).getAllByRole("listitem");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((row) => (row.querySelector("p")?.textContent ?? "").length > 0)).toBe(true);
  });
});

describe('ProjectDrawer impact mode help', () => {
  it('gives the four mode pills distinct help titles', () => {
    renderDrawer();

    const none = screen.getByRole("radio", { name: /^기본 —/ });
    const upstream = screen.getByRole("radio", { name: /^의존 —/ });
    const downstream = screen.getByRole("radio", { name: /^영향 —/ });
    const network = screen.getByRole("radio", { name: /^네트워크 —/ });

    const titles = [none, upstream, downstream, network].map((button) =>
      button.getAttribute("title"),
    );
    // All four have a value and none overlap.
    expect(titles.every((title) => Boolean(title))).toBe(true);
    expect(new Set(titles).size).toBe(4);
  });

  it('uses the direction vocabulary in the depends-on and impact pill aria-labels', () => {
    renderDrawer();

    const upstream = screen.getByRole("radio", { name: /^의존 —/ });
    const downstream = screen.getByRole("radio", { name: /^영향 —/ });

    expect(upstream.getAttribute("aria-label")).toContain("이 개념이 의존");
    expect(downstream.getAttribute("aria-label")).toContain("이 개념에 의존");
  });

  it('calls back on a mode pill click and shows each mode\'s own help', () => {
    // A controlled prop plus AnimatePresence is non-deterministic in jsdom, so each mode gets a
    // fresh mount.
    const onChangeImpactMode = vi.fn();
    const first = renderDrawer({ impactMode: "none", onChangeImpactMode });
    expect(
      within(screen.getByTestId("project-drawer-impact-help")).getByText(
        "강조 없이 현재 개념만 봐요",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /^의존 —/ }));
    expect(onChangeImpactMode).toHaveBeenCalledWith("upstream");
    first.unmount();

    renderDrawer({ impactMode: "upstream", onChangeImpactMode });
    expect(
      within(screen.getByTestId("project-drawer-impact-help")).getByText(
        /이 개념이 의존하는 개념/,
      ),
    ).toBeInTheDocument();
  });
});
