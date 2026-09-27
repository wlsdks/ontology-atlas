import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import koMessages from "../../../../../messages/ko.json";
import type { VaultDoc } from "@/entities/docs-vault";
import { DocMetaBar } from "./DocMetaBar";

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    className,
    ...rest
  }: {
    href: string;
    children: ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className} {...rest}>
      {children}
    </a>
  ),
}));

const doc: VaultDoc = {
  slug: "ontology/capabilities/agent-graph-readiness",
  path: "docs/ontology/capabilities/agent-graph-readiness.md",
  title: "Agent Graph Readiness",
  tags: [],
  frontmatter: {
    slug: "capabilities/agent-graph-readiness",
    kind: "capability",
    title: "Agent Graph Readiness",
  },
  headings: [],
  excerpt: "",
  wordCount: 3620,
  updatedAt: "2026-06-05T00:00:00.000Z",
  linksOut: [],
};

function renderMetaBar(targetDoc: VaultDoc = doc) {
  return render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <DocMetaBar doc={targetDoc} />
    </NextIntlClientProvider>,
  );
}

describe("DocMetaBar", () => {
  // A document on the map says so once, as a chip, with words a person reads.
  it("states in-graph status only as a chip without repeating it as a sentence", () => {
    renderMetaBar();

    expect(
      screen.getByRole("region", { name: "지도 근거" }),
    ).toBeInTheDocument();
    expect(screen.getByText("지도 근거")).toBeInTheDocument();
    expect(
      screen.queryByText("docs/ontology/capabilities/agent-graph-readiness.md"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/개념으로 연결됩니다/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/frontmatter/)).not.toBeInTheDocument();
    // The way to the map stays.
    expect(screen.getByTestId("doc-map-open")).toBeInTheDocument();
  });

  // A document absent from the graph must not call itself "map evidence".
  it("tells a non-graph doc that it is not on the map (and offers no map CTA)", () => {
    renderMetaBar({
      ...doc,
      slug: "README",
      path: "docs/README.md",
      frontmatter: {},
    });

    expect(screen.queryByText("docs/README.md")).not.toBeInTheDocument();
    expect(screen.getByTestId("doc-map-evidence")).toHaveAttribute("data-in-graph", "false");
    expect(screen.getByText("지도에 없음")).toBeInTheDocument();
    expect(
      screen.getByText(
        /아직 지도에 그려지지 않아요/,
      ),
    ).toBeInTheDocument();
    // No dead CTAs.
    expect(screen.queryByTestId("doc-map-open")).toBeNull();
    expect(
      screen.queryByRole("link", { name: /의미 지도/ }),
    ).not.toBeInTheDocument();
  });

  /** `/ontology` only redirects, so one direct entrance is kept. */
  it("renders exactly one map entrance, and it goes to the map", () => {
    renderMetaBar();

    const relationMapLink = screen.getByRole("link", { name: "지도" });
    expect(relationMapLink).toHaveAttribute(
      "href",
      "/topology/?mode=focus&p=ontology%2Fcapabilities%2Fagent-graph-readiness",
    );
    expect(relationMapLink).toHaveAttribute("title", "이 개념을 지도에서 열기");
    expect(relationMapLink.className).toContain("min-h-8");
    expect(relationMapLink.className).toContain("active:translate-y-px");

    expect(screen.queryByRole("link", { name: /의미 지도/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link").filter((a) => (a.getAttribute("href") ?? "").includes("/ontology/?node="))).toHaveLength(0);
  });

  it("shows the Git-derived revision only when the manifest carries one", () => {
    const { unmount } = renderMetaBar({ ...doc, revision: 12 });
    expect(screen.getByTestId("doc-revision").textContent).toContain("12");
    unmount();
    renderMetaBar();
    expect(screen.queryByTestId("doc-revision")).not.toBeInTheDocument();
  });
});

/**
 * A wiki page has no `kind:` by contract (`validateWikiPage` reports one as `kind-present`), so
 * it must not be told to add one.
 */
describe("DocMetaBar — a wiki page is not a document that failed to become a node", () => {
  const wikiDoc: VaultDoc = {
    ...doc,
    slug: "wiki/budget",
    path: "wiki/budget.md",
    title: "Budget",
    frontmatter: { title: "Budget", status: "draft", created_by: "human" },
  };

  it("does not tell a write-up to fill in what is missing so it reaches the map", () => {
    renderMetaBar(wikiDoc);
    expect(
      screen.queryByText(koMessages.vaultWidgets.parts.meta.notOnMapBody),
    ).toBeNull();
  });

  it("says instead why a write-up belongs off the map, and where it is read", () => {
    renderMetaBar(wikiDoc);
    expect(
      screen.getByText(koMessages.vaultWidgets.parts.meta.notOnMapWikiBody),
    ).toBeInTheDocument();
  });

  // A file under `wiki/` that has a `kind:` gets the ordinary verdict.
  it("treats a file under wiki/ that really carries a kind as the node it is", () => {
    renderMetaBar({
      ...wikiDoc,
      frontmatter: { ...wikiDoc.frontmatter, kind: "capability", slug: "budget" },
    });
    expect(
      screen.queryByText(koMessages.vaultWidgets.parts.meta.notOnMapWikiBody),
    ).toBeNull();
    expect(screen.getByTestId("doc-map-evidence")).toHaveAttribute("data-in-graph", "true");
  });
});
