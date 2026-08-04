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

  // 이름이 바뀐 이유 (2026-08-04): 종전 이 테스트는 그래프에 **없는** 문서가
  // 「지도 근거」라고 말하는 것을 «계약»으로 못박고 있었다. 그건 계약이 아니라
  // 결함이었다 — 근거가 아닌 것을 근거라고 부르면 근거라는 말이 아무 뜻도 없어진다.
  it("tells a non-graph doc that it is not on the map (and offers no map CTA)", () => {
    renderMetaBar({
      ...doc,
      slug: "README",
      path: "docs/README.md",
      frontmatter: {},
    });

    // 경로 mono 칩 제거(qw6) — ehead 가 파일 정체성을 소유.
    expect(screen.queryByText("docs/README.md")).not.toBeInTheDocument();
    expect(screen.getByTestId("doc-map-evidence")).toHaveAttribute("data-in-graph", "false");
    expect(screen.getByText("지도에 없음")).toBeInTheDocument();
    expect(
      screen.getByText(
        "이 문서는 아직 지도의 노드가 아니에요 — 위쪽 진단에서 무엇이 빠졌는지 볼 수 있어요.",
      ),
    ).toBeInTheDocument();
    // 죽은 CTA 0 — 주소를 못 만들면 링크 자체가 없다.
    expect(screen.queryByTestId("doc-map-open")).toBeNull();
    expect(
      screen.queryByRole("link", { name: /의미 지도/ }),
    ).not.toBeInTheDocument();
  });

  /**
   * 지도로 가는 입구는 **하나**다 (2026-07-28).
   *
   * 종전에는 「의미 지도」(`/ontology/?node=`)와 「지형도」(`/topology/?p=`)가
   * 나란히 있었다. 그런데 `/ontology` 는 지도로 가는 **얇은 리다이렉트**라
   * 두 링크가 같은 화면에 도착한다 — 파라미터만 다른 두 입구는 선택지가
   * 아니라 망설임이다. 직접 가는 쪽만 남겼다.
   *
   * 이 테스트가 지키는 것은 "입구가 하나" 와 "그 하나가 실제로 지도로
   * 간다" 둘 다이다 — 하나로 줄이면서 길까지 잃으면 축소가 아니라 손실이다.
   */
  it("renders exactly one map entrance, and it goes to the map", () => {
    renderMetaBar();

    const relationMapLink = screen.getByRole("link", { name: "지형도" });
    expect(relationMapLink).toHaveAttribute(
      "href",
      "/topology/?mode=focus&p=ontology%2Fcapabilities%2Fagent-graph-readiness",
    );
    expect(relationMapLink).toHaveAttribute("title", "이 개념을 지형도에서 열기");
    // 터치 계약은 그대로 — 줄인 것은 개수이지 크기가 아니다.
    expect(relationMapLink.className).toContain("min-h-8");
    expect(relationMapLink.className).toContain("active:translate-y-px");

    // 리다이렉트를 한 홉 거치던 두 번째 입구는 사라졌다.
    expect(screen.queryByRole("link", { name: /의미 지도/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link").filter((a) => (a.getAttribute("href") ?? "").includes("/ontology/?node="))).toHaveLength(0);
  });
});
