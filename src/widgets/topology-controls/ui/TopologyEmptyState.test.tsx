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

/*
 * Read from the catalogue, not pinned as literals: these tests guard which string is chosen
 * (`documentation.md`).
 */
const EMPTY = koMessages.topology.empty;

function renderEmpty(conceptCount: number, reason?: "no-projects" | "no-relations") {
  return render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <TopologyEmptyState conceptCount={conceptCount} reason={reason} />
    </NextIntlClientProvider>,
  );
}

describe("TopologyEmptyState", () => {
  it('stands under the same constellation as the start steps', () => {
    renderEmpty(3, "no-relations");
    expect(document.querySelector('[data-map-start-art] [data-constellation-mark="project"]')).not.toBeNull();
  });

  it('shows the recovery CTA with a clear screen name when there are no projects', () => {
    renderEmpty(0);
    expect(
      screen.getByRole("status", { name: new RegExp(EMPTY.titleNoProjects) }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  /*
   * The `/ontology/` route redirects back to this screen with INDEX expanded, so with no concepts
   * the offer
   * is a dead end; the link itself is asserted, not only the count.
   */
  it('does not suggest browsing when there are no concepts', () => {
    renderEmpty(0);
    expect(screen.queryByText(EMPTY.ctaTree)).not.toBeInTheDocument();
  });

  it('lets the user expand the list by browsing when concepts exist', () => {
    renderEmpty(1, "no-relations");
    expect(screen.getByText(EMPTY.ctaTree).closest("a")).toHaveAttribute(
      "href",
      expect.stringContaining("/ontology"),
    );
  });

  it('does not frame the secondary hint as a separate notice box', () => {
    renderEmpty(1, "no-relations");
    const hint = screen.getByText(
      EMPTY.crossViewHint,
    );
    expect(hint.className).not.toContain("rounded-md");
    expect(hint.className).not.toContain("border");
  });

  it('leads with creating a relation in storage and editing when there are no relations', () => {
    renderEmpty(1, "no-relations");
    const panel = screen.getByRole("status", {
      name: /아직 그릴 관계가 없어요/,
    });

    expect(panel).toHaveTextContent("지도 · 개념 1개 · 관계 0개");
    expect(panel).toHaveTextContent(EMPTY.bodyNoDeps);
  });

  // Capability decides: a browser that can open a folder gets picker copy, not an app-install
  // prompt.
  it('uses picker copy instead of a download prompt when a folder can be opened', () => {
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <TopologyEmptyState conceptCount={0} reason="no-projects" canPickFolder />
      </NextIntlClientProvider>,
    );
    const panel = screen.getByRole("status");
    expect(panel).not.toHaveTextContent("macOS 앱");
    expect(panel).toHaveTextContent(EMPTY.bodyNoProjectsPicker);
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links).not.toContain("/download/");
  });

  // Negative control: without the capability the copy still degrades to download.
  it('falls back to download when a folder cannot be opened', () => {
    renderEmpty(0, "no-projects");
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links).toContain("/download/");
  });

  it('prefers the empty-project notice for reason no-projects even with a projectCount', () => {
    renderEmpty(1, "no-projects");
    expect(
      screen.getByRole("status", { name: new RegExp(EMPTY.titleNoProjects) }),
    ).toBeInTheDocument();
  });

  it('describes the map state instead of internal topology terms in Korean', () => {
    renderEmpty(0);
    const panel = screen.getByRole("status");
    expect(panel).toHaveTextContent(EMPTY.titleNoProjects);
    expect(panel).not.toHaveTextContent("TOPOLOGY");
    expect(panel).not.toHaveTextContent("토폴로지");
    /*
     * The first sentence must not use the schema kind `project`; the count is the graph's node
     * count.
     */
    expect(panel).not.toHaveTextContent("프로젝트");
    expect(panel).toHaveTextContent("개념");
  });

  it('renders as a small status panel rather than a large card', () => {
    renderEmpty(0);
    const panel = screen.getByRole("status");
    // The radius comes from a ramp token.
    expect(panel.className).toContain("rounded-[var(--radius-panel)]");
    expect(panel.className).not.toContain("rounded-2xl");
    expect(panel.className).not.toContain("p-8");
  });

  it('gives every recovery action the same width', () => {
    /* Actions are one equal-width vertical set, not width-by-copy wrapping. */
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <TopologyEmptyState conceptCount={0} canCreateNode onCreateNode={vi.fn()} />
      </NextIntlClientProvider>,
    );
    const actions = [...screen.queryAllByRole("link"), ...screen.queryAllByRole("button")];
    expect(actions.length).toBeGreaterThan(1);
    for (const action of actions) {
      expect(action.className).toContain("w-full");
    }
  });

  it('gives every recovery CTA a keyboard focus ring', () => {
    renderEmpty(0);
    // Guards the regression where a keyboard user could not see which recovery action had focus.
    for (const link of screen.getAllByRole("link")) {
      expect(link.className).toContain("focus-visible:ring-2");
      expect(link.className).toContain("focus-visible:outline-hidden");
    }
  });

  it('shows no create-node CTA by default', () => {
    renderEmpty(0);
    expect(screen.queryByTestId("empty-create-node")).not.toBeInTheDocument();
  });

  it('offers one create door, the create card, when a folder is open', () => {
    const onCreateNode = vi.fn();
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <TopologyEmptyState conceptCount={0} canCreateNode onCreateNode={onCreateNode} />
      </NextIntlClientProvider>,
    );
    const button = screen.getByTestId("empty-create-node");
    expect(button).toHaveTextContent(EMPTY.ctaCreateNode);
    expect(document.querySelectorAll('a[href*="workbench=create"]')).toHaveLength(0);
    button.click();
    expect(onCreateNode).toHaveBeenCalledTimes(1);
  });

  it('makes start-from-docs the primary CTA and demotes the macOS notice when docs exist', () => {
    const onStartFromDocs = vi.fn();
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <TopologyEmptyState conceptCount={0} docsFoundCount={4} onStartFromDocs={onStartFromDocs} />
      </NextIntlClientProvider>,
    );
    const button = screen.getByTestId("empty-start-from-docs");
    expect(button).toHaveTextContent("내 문서로 지도 만들기");
    // The misdirection that offered an app install to someone who just opened a vault disappears on this branch.
    expect(screen.queryByText(/macOS/)).not.toBeInTheDocument();
    // The user's documents are acknowledged first (both the kicker and the body).
    expect(screen.getAllByText(/4개/).length).toBeGreaterThanOrEqual(1);
    button.click();
    expect(onStartFromDocs).toHaveBeenCalledTimes(1);
  });

  it('shows no bootstrap CTA when docsFoundCount is 0', () => {
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <TopologyEmptyState conceptCount={0} docsFoundCount={0} onStartFromDocs={vi.fn()} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByTestId("empty-start-from-docs")).not.toBeInTheDocument();
  });
});
