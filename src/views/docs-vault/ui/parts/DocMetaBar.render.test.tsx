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
  /*
   * **Why this was renamed (2026-08-08)**: this test used to pin, as a contract, that the
   * explanation sentence renders even on a document that **is** on the map. That was waste, not a
   * contract — the sentence repeats what the chip on its left ("map evidence") and the link on its
   * right ("topology") already say, while eating a whole line above the body. Measured: in the
   * shipped sample vault **all 112 documents are nodes**, so the same sentence repeated 112 times.
   *
   * The property held is unchanged — "it is on the map" is stated in **words a person reads**, and
   * no frontmatter jargon appears on screen. The case that does need an explanation (a document not
   * on the map) is held by the test below.
   */
  it("in-graph 문서는 칩으로만 말한다 — 같은 말을 문장으로 되풀이하지 않는다", () => {
    renderMetaBar();

    expect(
      screen.getByRole("region", { name: "지도 근거" }),
    ).toBeInTheDocument();
    expect(screen.getByText("지도 근거")).toBeInTheDocument();
    // The mono path chip was deliberately removed — the canonical path is owned by the editor head
    // and is not duplicated in the meta bar.
    expect(
      screen.queryByText("docs/ontology/capabilities/agent-graph-readiness.md"),
    ).not.toBeInTheDocument();
    // What the chip said is not repeated as a sentence.
    expect(
      screen.queryByText(/개념으로 연결됩니다/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/frontmatter/)).not.toBeInTheDocument();
    // But the way to the map is still there — what was cut is the explanation, not the fact.
    expect(screen.getByTestId("doc-map-open")).toBeInTheDocument();
  });

  // Why this was renamed (2026-08-04): this test used to pin, as a «contract», that a document
  // **absent** from the graph calls itself "map evidence". That was a defect, not a contract —
  // calling something evidence when it is not makes the word evidence mean nothing.
  it("tells a non-graph doc that it is not on the map (and offers no map CTA)", () => {
    renderMetaBar({
      ...doc,
      slug: "README",
      path: "docs/README.md",
      frontmatter: {},
    });

    // The mono path chip was removed — the editor head owns file identity.
    expect(screen.queryByText("docs/README.md")).not.toBeInTheDocument();
    expect(screen.getByTestId("doc-map-evidence")).toHaveAttribute("data-in-graph", "false");
    expect(screen.getByText("지도에 없음")).toBeInTheDocument();
    expect(
      screen.getByText(
        /아직 지도에 그려지지 않아요/,
      ),
    ).toBeInTheDocument();
    // Zero dead CTAs — with no address to build, the link does not exist.
    expect(screen.queryByTestId("doc-map-open")).toBeNull();
    expect(
      screen.queryByRole("link", { name: /의미 지도/ }),
    ).not.toBeInTheDocument();
  });

  /**
   * There is **one** entrance to the map (2026-07-28).
   *
   * "Meaning map" (`/ontology/?node=`) and "topology" (`/topology/?p=`) used to sit side by side.
   * But `/ontology` is a **thin redirect** to the map, so both links arrive at the same screen —
   * two entrances differing only in parameters are not a choice, they are hesitation. Only the
   * direct one was kept.
   *
   * This test holds both "there is one entrance" and "that one really goes to the map" — reducing
   * to one while also losing the path would be loss, not reduction.
   */
  it("renders exactly one map entrance, and it goes to the map", () => {
    renderMetaBar();

    const relationMapLink = screen.getByRole("link", { name: "지도" });
    expect(relationMapLink).toHaveAttribute(
      "href",
      "/topology/?mode=focus&p=ontology%2Fcapabilities%2Fagent-graph-readiness",
    );
    expect(relationMapLink).toHaveAttribute("title", "이 개념을 지도에서 열기");
    // The touch contract is unchanged — what was reduced is the count, not the size.
    expect(relationMapLink.className).toContain("min-h-8");
    expect(relationMapLink.className).toContain("active:translate-y-px");

    // The second entrance, which went through a redirect hop, is gone.
    expect(screen.queryByRole("link", { name: /의미 지도/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link").filter((a) => (a.getAttribute("href") ?? "").includes("/ontology/?node="))).toHaveLength(0);
  });
});
