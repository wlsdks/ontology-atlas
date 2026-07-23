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
  it("frames ontology records as readable evidence instead of frontmatter jargon", () => {
    renderMetaBar();

    expect(
      screen.getByRole("region", { name: "지도 근거" }),
    ).toBeInTheDocument();
    expect(screen.getByText("지도 근거")).toBeInTheDocument();
    // 경로 mono 칩은 의도적으로 제거됨(qw6) — canonical 경로는 ehead 가 소유해
    // 메타바에서 중복 노출하지 않는다.
    expect(
      screen.queryByText("docs/ontology/capabilities/agent-graph-readiness.md"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "이 문서 속성이 capability 개념으로 연결됩니다. 에이전트는 이 근거를 쿼리, 인용, 갱신할 수 있습니다.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/frontmatter/)).not.toBeInTheDocument();
  });

  it("keeps non-ontology docs framed as source-record evidence", () => {
    renderMetaBar({
      ...doc,
      slug: "README",
      path: "docs/README.md",
      frontmatter: {},
    });

    // 경로 mono 칩 제거(qw6) — ehead 가 파일 정체성을 소유.
    expect(screen.queryByText("docs/README.md")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "그래프를 뒷받침하는 로컬 마크다운 근거로, 에이전트가 지도 갱신 전 인용할 수 있습니다.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /의미 지도/ }),
    ).not.toBeInTheDocument();
  });

  it("renders ontology and relation-map jumps as touch-sized action chips", () => {
    renderMetaBar();

    const conceptLink = screen.getByRole("link", {
      name: /의미 지도 · kind:capability/,
    });
    const relationMapLink = screen.getByRole("link", { name: "지형도" });

    expect(conceptLink).toHaveAttribute(
      "href",
      "/ontology/?node=capability%3Aagent-graph-readiness",
    );
    expect(conceptLink).toHaveAttribute("title", "capability 노드를 지도에서 보기");
    expect(conceptLink.className).toContain("min-h-8");
    expect(conceptLink.className).toContain("rounded-md");
    expect(conceptLink.className).toContain("hover:-translate-y-0.5");

    expect(relationMapLink).toHaveAttribute(
      "href",
      "/topology/?mode=focus&p=ontology%2Fcapabilities%2Fagent-graph-readiness",
    );
    expect(relationMapLink).toHaveAttribute("title", "이 개념을 지형도에서 열기");
    expect(relationMapLink.className).toContain("min-h-8");
    expect(relationMapLink.className).toContain("active:translate-y-px");
  });
});
