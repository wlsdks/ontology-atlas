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
 * ⚠️ Read from the catalogue, not pinned as literals. These tests guard **which** string the screen
 * chooses, not how it is worded — and `documentation.md` is explicit that checks derive facts rather
 * than pin human prose. Pinning it meant a copy repair (owner, 2026-08-25: the empty state was
 * leaking the `project` kind at a newcomer) broke four tests that had no opinion about wording.
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
  it('shows the recovery CTA with a clear screen name when there are no projects', () => {
    renderEmpty(0);
    expect(
      screen.getByRole("status", { name: new RegExp(EMPTY.titleNoProjects) }),
    ).toBeInTheDocument();
    expect(screen.getByText("저장·편집 열기").closest("a")).toHaveAttribute(
      "href",
      expect.stringContaining("/topology/?workbench=create"),
    );
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  /*
   * ⚠️ `/ontology/` is not a destination — it redirects to `/topology/` with INDEX expanded, which
   * is the screen this panel is drawn on. With concepts that round trip is worth taking: it opens
   * the list. With none it ends where it started, showing an empty index, so the offer is a dead
   * end rather than a slow route. Asserting the *count* alone would pass with the row present and
   * some other row gone, so the link itself is named.
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
    expect(panel).toHaveTextContent(
      "저장·편집에서 개념 사이 관계를 하나 저장하면 이 화면에 선이 나타나요.",
    );
    expect(screen.getByText("관계 만들기").closest("a")).toHaveAttribute(
      "href",
      expect.stringContaining("/topology/?workbench=create"),
    );
  });

  // For a user who just opened a local vault, download copy saying "install the macOS
  // app…" is misdirection.
  //
  // 2026-08-08 council — the decision was widened to **capability**. The old condition
  // (`isTauriVaultRuntime() || hasOpenVault`) answered someone who is neither — a
  // **first-time web visitor on an FSA-capable browser** — with 「install the app」,
  // when that browser can open a folder right now.
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

  // The negative control — without the capability (Firefox and the like) it **still**
  // degrades to the download. Without this, the test above stays green even if the
  // picker copy were used unconditionally.
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
     * ⚠️ The hole this very test was written to close, and did not (owner, 2026-08-25: *"what is 'a
     * project to draw'? it just means there are no ontology concepts, right?"*).
     *
     * It banned the renderer's name and then asserted a count phrased as projects in the same breath — so the
     * screen's first sentence to a newcomer was built from `project`, a schema kind, and the guard
     * against internal vocabulary held the door open for it. The count is the graph's **node** count,
     * which makes the word wrong about the data as well as unreadable.
     */
    expect(panel).not.toHaveTextContent("프로젝트");
    expect(panel).toHaveTextContent("개념");
  });

  it('renders as a small status panel rather than a large card', () => {
    renderEmpty(0);
    const panel = screen.getByRole("status");
    // The radius is decided by a **ramp token**. It used to pin `rounded-lg`
    // (Tailwind's default), a value outside this repository's radius ramp — so it
    // looked like conformance while actually fixing a position off the ramp.
    expect(panel.className).toContain("rounded-[var(--radius-panel)]");
    expect(panel.className).not.toContain("rounded-2xl");
    expect(panel.className).not.toContain("p-8");
  });

  it('gives every recovery action the same width', () => {
    /*
     * It used to be `flex-wrap justify-center`, so a button's width was set by its
     * character count and so was the wrap point (four buttons stepping 1·2·1). That
     * violates dimension regularity, and reverting it breaks here.
     */
    renderEmpty(0);
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
      expect(link.className).toContain("focus-visible:outline-none");
    }
  });

  it('shows no create-node CTA by default', () => {
    renderEmpty(0);
    expect(screen.queryByTestId("empty-create-node")).not.toBeInTheDocument();
  });

  it('shows the create-concept primary CTA and calls onCreateNode when canCreateNode', () => {
    const onCreateNode = vi.fn();
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <TopologyEmptyState conceptCount={0} canCreateNode onCreateNode={onCreateNode} />
      </NextIntlClientProvider>,
    );
    const btn = screen.getByTestId("empty-create-node");
    expect(btn).toHaveTextContent("개념 만들기");
    btn.click();
    expect(onCreateNode).toHaveBeenCalledTimes(1);
  });

  it('makes start-from-docs the primary CTA and demotes the macOS notice when docs exist', () => {
    const onStartFromDocs = vi.fn();
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <TopologyEmptyState conceptCount={0} docsFoundCount={4} onStartFromDocs={onStartFromDocs} />
      </NextIntlClientProvider>,
    );
    const btn = screen.getByTestId("empty-start-from-docs");
    expect(btn).toHaveTextContent("내 문서로 지도 만들기");
    // The misdirection that offered an app install to someone who just opened a vault disappears on this branch.
    expect(screen.queryByText(/macOS/)).not.toBeInTheDocument();
    // The user's documents are acknowledged first (both the kicker and the body).
    expect(screen.getAllByText(/4개/).length).toBeGreaterThanOrEqual(1);
    btn.click();
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
