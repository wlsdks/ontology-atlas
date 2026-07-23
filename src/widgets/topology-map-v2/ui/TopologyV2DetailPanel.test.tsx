import { fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { TopologyV2DetailPanel } from "./TopologyV2DetailPanel";

// `@/i18n/navigation`'s Link wraps next-intl's `createNavigation`, which
// pulls in `next/navigation` — unresolvable under vitest's module graph in
// this repo (established pattern, see `DocsVaultViewer.test.tsx`). Mocked to
// a plain anchor so href/click assertions still work.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

const labels = {
  kindLabel: "Domain",
  domainLabel: "domain",
  poweredOn: "fresh",
  poweredOff: "idle",
  metricContains: "contains",
  containsShowAll: "view all",
  containsShowSummary: "summary",
  containsOtherGroup: "other",
  metricUsedBy: "used by",
  metricDependsOn: "leans on",
  metricEvidence: "evidence",
  noConnections: "no relations recorded yet · relations are declared in frontmatter",
  handoff: "Copy next action",
  close: "Close",
  openFullDetail: "Full detail →",
  actionsGroupLabel: "Node actions",
  actionDocument: "Document",
  actionEditRelations: "Edit relations",
  actionCopyHandoff: "Copy handoff",
  actionPath: "Path",
  actionRealm: "Expand realm",
};

function renderPanel(
  onOpenFullDetail?: () => void,
  evidence: { rows: { id: string; title: string; path: string | null }[]; total: number } = {
    rows: [],
    total: 0,
  },
  overrides: {
    documentHref?: string | null;
    onCopyHandoff?: () => void;
    onSetPathSource?: () => void;
    domain?: { id: string; title: string } | null;
    onSelectConnection?: (id: string) => void;
    sourceTitle?: string | null;
  } = {},
) {
  render(
    <TopologyV2DetailPanel
      slug="domains/views"
      title="Views"
      sourceTitle={overrides.sourceTitle ?? null}
      kind="domain"
      domain={overrides.domain !== undefined ? overrides.domain : null}
      powered={false}
      metric={{ contains: 0, usedBy: 1, dependsOn: 2, evidence: evidence.total }}
      groups={{
        contains: { rows: [], total: 0 },
        usedBy: { rows: [], total: 1 },
        dependsOn: { rows: [], total: 2 },
        belongsTo: { rows: [], total: 0 },
      }}
      evidence={evidence}
      handoffText="node: domains/views"
      documentHref={
        overrides.documentHref !== undefined
          ? overrides.documentHref
          : "/docs/domains/views"
      }
      builderEditHref="/ontology/edit/?node=domains%2Fviews"
      labels={labels}
      onSelectConnection={overrides.onSelectConnection ?? (() => {})}
      onCopyHandoff={overrides.onCopyHandoff ?? (() => {})}
      onClose={() => {}}
      onSetPathSource={overrides.onSetPathSource ?? (() => {})}
      onOpenFullDetail={onOpenFullDetail}
    />,
  );
}

describe("TopologyV2DetailPanel — full-detail A1 opt-in link", () => {
  it("renders the '전체 상세 →' link when onOpenFullDetail is provided", () => {
    const onOpenFullDetail = vi.fn();
    renderPanel(onOpenFullDetail);
    fireEvent.click(screen.getByTestId("topology-v2-detail-panel-open-full-detail"));
    expect(onOpenFullDetail).toHaveBeenCalledTimes(1);
  });

  it("hides the link when onOpenFullDetail is omitted", () => {
    renderPanel(undefined);
    expect(
      screen.queryByTestId("topology-v2-detail-panel-open-full-detail"),
    ).not.toBeInTheDocument();
  });
});

// P3-③ (2026-07-21 리텐션 라운드) — 1440×900 에서 연결이 많은 노드는 패널
// 콘텐츠가 뷰포트를 넘겨 "전체 상세 →" 푸터가 화면 밖(y=911)으로 밀려나
// 클릭 불가였다. 패널은 항상 뷰포트 안에서 스스로 스크롤해야 한다 — jsdom 은
// 실제 레이아웃을 하지 않으므로 clamp 계약(토큰 기반 max-height + 내부
// overflow)이 className 에 실제로 걸려 있는지로 회귀를 잡는다.
describe("TopologyV2DetailPanel — viewport clamp (P3-③)", () => {
  it("always carries a viewport-bounded max-height and internal scroll so the footer link stays reachable", () => {
    renderPanel(vi.fn());
    const panel = screen.getByTestId("topology-v2-detail-panel");
    expect(panel.className).toContain("max-h-[var(--topology-v2-panel-max-height)]");
    expect(panel.className).toContain("overflow-y-auto");
    // The full-detail footer link is inside the same clamped/scrollable
    // root, not a sibling escaping the clamp.
    expect(panel).toContainElement(
      screen.getByTestId("topology-v2-detail-panel-open-full-detail"),
    );
  });
});

describe("TopologyV2DetailPanel — 근거(evidence) group promotion (RATIO-SYSTEM §4)", () => {
  it("renders an evidence group with its row's title/path when evidence rows exist", () => {
    renderPanel(undefined, {
      rows: [{ id: "capabilities/product-owner-operating-system", title: "product-owner-operating-system", path: "capabilities/" }],
      total: 1,
    });
    // 잉크 분리 후 메트릭 스트립에도 "evidence" 라벨 span 이 생겨 getByText 는
    // 다중 매치 — 그룹 마커로 직접 조회한다.
    const group = document.querySelector("[data-datasheet-group='evidence']");
    expect(group).not.toBeNull();
    expect(group!.textContent).toContain("evidence");
    expect(screen.getByText("product-owner-operating-system")).toBeInTheDocument();
    expect(screen.getByText("capabilities/")).toBeInTheDocument();
  });

  it("does not render the evidence group when there are no evidence rows", () => {
    renderPanel(undefined, { rows: [], total: 0 });
    expect(document.querySelector("[data-datasheet-group='evidence']")).toBeNull();
  });

  it("renders each evidence row as a link to its vault document", () => {
    renderPanel(undefined, {
      rows: [{ id: "capabilities/product-owner-operating-system", title: "product-owner-operating-system", path: "capabilities/" }],
      total: 1,
    });
    const link = screen.getByText("product-owner-operating-system").closest("a");
    expect(link).not.toBeNull();
    expect(link).toHaveAttribute(
      "href",
      expect.stringContaining("product-owner-operating-system"),
    );
  });
});

// 슬라이스 B (element 라벨 인간화) — display 로 인간화된 title 이 렌더될 때
// 원문 코드 경로를 모노 서브라인으로 보존한다. 호출자가 display !== 원문일
// 때만 sourceTitle 을 넘기는 계약이므로 패널 자체는 sourceTitle 유무 +
// title 과의 동일 여부만으로 렌더 여부를 결정한다.
describe("TopologyV2DetailPanel — 원문 경로 서브라인 (슬라이스 B)", () => {
  it("sourceTitle 이 title 과 다르면 모노 서브라인으로 원문을 보존해 렌더한다", () => {
    renderPanel(undefined, undefined, { sourceTitle: "src/foo/bar-baz.ts" });
    const subline = screen.getByTestId("topology-v2-detail-panel-source-path");
    expect(subline).toHaveTextContent("src/foo/bar-baz.ts");
  });

  it("sourceTitle 이 없으면(null/undefined) 서브라인을 렌더하지 않는다", () => {
    renderPanel(undefined, undefined, {});
    expect(
      screen.queryByTestId("topology-v2-detail-panel-source-path"),
    ).not.toBeInTheDocument();
  });

  it("sourceTitle 이 title 과 같으면(중복) 서브라인을 렌더하지 않는다", () => {
    renderPanel(undefined, undefined, { sourceTitle: "Views" });
    expect(
      screen.queryByTestId("topology-v2-detail-panel-source-path"),
    ).not.toBeInTheDocument();
  });
});

describe("TopologyV2DetailPanel — M-2 typed containment split", () => {
  it("renders a 담는 것(contains) group with the parent's children (not folded into 기대는 곳)", () => {
    render(
      <TopologyV2DetailPanel
        slug="domains/ai-agent-partner"
        title="AI Agent Partner"
        kind="domain"
        domain={null}
        powered={false}
        metric={{ contains: 2, usedBy: 1, dependsOn: 0, evidence: 0 }}
        groups={{
          contains: {
            rows: [
              { id: "capability:mcp-server", title: "MCP Server", kind: "capability", relationType: "contains", direction: "outgoing" },
              { id: "capability:agent-config", title: "Agent Config", kind: "capability", relationType: "contains", direction: "outgoing" },
            ],
            total: 2,
          },
          usedBy: {
            rows: [
              { id: "capability:x", title: "Consumer X", kind: "capability", relationType: "depends_on", direction: "incoming" },
            ],
            total: 1,
          },
          dependsOn: { rows: [], total: 0 },
          belongsTo: { rows: [], total: 0 },
        }}
        evidence={{ rows: [], total: 0 }}
        handoffText="node: domains/ai-agent-partner"
        documentHref={null}
        builderEditHref="/ontology/edit/?node=domains%2Fai-agent-partner"
        labels={labels}
        onSelectConnection={() => {}}
        onCopyHandoff={() => {}}
        onClose={() => {}}
        onSetPathSource={() => {}}
      />,
    );
    // the contains group exists and holds the contained capabilities
    const group = document.querySelector("[data-datasheet-group='contains']");
    expect(group).not.toBeNull();
    expect(screen.getByText("MCP Server")).toBeInTheDocument();
    expect(screen.getByText("Agent Config")).toBeInTheDocument();
    // the metric line leads with the "contains" typed segment
    const metric = screen.getByTestId("topology-v2-detail-panel").querySelector("[data-datasheet-metric='engraved']");
    expect(metric?.textContent).toContain("contains 2");
  });

  it("omits the 담는 것 segment + group for a leaf node (contains 0)", () => {
    renderPanel();
    expect(document.querySelector("[data-datasheet-group='contains']")).toBeNull();
    const metric = screen.getByTestId("topology-v2-detail-panel").querySelector("[data-datasheet-metric='engraved']");
    expect(metric?.textContent).not.toContain("contains");
  });
});

// 데이터시트 내부 정제 (2026-07-23) — 메트릭 스트립이 한 덩어리 문자열로
// 읽히던 문제: 라벨은 tertiary, 값은 `--topology-v2-panel-metric-text` 잉크로
// 분리하고, 그룹 헤더 카운트도 같은 값 잉크를 쓴다 — 스트립의 각 카운트가
// 아래 자기 그룹으로 잉크 페어링만으로 시선 연결되는 계약(신규 인터랙션 0).
describe("TopologyV2DetailPanel — metric strip label/value ink split", () => {
  it("renders each metric segment structured (label + value spans) instead of one joined string", () => {
    renderPanel();
    const metric = screen
      .getByTestId("topology-v2-detail-panel")
      .querySelector("[data-datasheet-metric='engraved']");
    expect(metric).not.toBeNull();
    const seg = metric!.querySelector("[data-metric-segment='usedBy']");
    expect(seg).not.toBeNull();
    expect(seg!.textContent).toContain("used by 1");
    // the value carries the engraved-number ink token, the label does not
    const valueSpan = Array.from(seg!.querySelectorAll("span")).find(
      (s) => s.textContent === "1",
    );
    expect(valueSpan?.className).toContain("--topology-v2-panel-metric-text");
  });

  it("pairs the group header count with the SAME engraved-number ink as the strip value", () => {
    renderPanel();
    const total = document.querySelector("[data-datasheet-group-total='usedBy']");
    expect(total).not.toBeNull();
    expect(total!.className).toContain("--topology-v2-panel-metric-text");
  });
});

describe("TopologyV2DetailPanel — P3-① 미기록 관계 empty-state (0 vs 미기록 disambiguation)", () => {
  it("renders the honest 'no relations recorded yet' empty-state when a node has zero recorded relations", () => {
    // global-search 처럼 코드에선 널리 쓰이지만 vault frontmatter 에는 아직
    // 어떤 관계도 선언되지 않은 노드 — "쓰는 곳 0" 이 "의존 없음" 이 아니라
    // "아직 기록 안 됨" 임을 UI 가 정직하게 말해야 한다.
    render(
      <TopologyV2DetailPanel
        slug="src/widgets/global-search"
        title="global-search"
        kind="element"
        domain={null}
        powered={false}
        metric={{ contains: 0, usedBy: 0, dependsOn: 0, evidence: 0 }}
        groups={{
          contains: { rows: [], total: 0 },
          usedBy: { rows: [], total: 0 },
          dependsOn: { rows: [], total: 0 },
          belongsTo: { rows: [], total: 0 },
        }}
        evidence={{ rows: [], total: 0 }}
        handoffText="node: src/widgets/global-search"
        documentHref={null}
        builderEditHref="/ontology/edit/?node=src%2Fwidgets%2Fglobal-search"
        labels={labels}
        onSelectConnection={() => {}}
        onCopyHandoff={() => {}}
        onClose={() => {}}
        onSetPathSource={() => {}}
      />,
    );
    expect(screen.getByText(labels.noConnections)).toBeInTheDocument();
    // the copy must carry the "recorded / declared" framing, not a bare "no connections"
    expect(labels.noConnections).toMatch(/recorded|declared/i);
  });
});

describe("TopologyV2DetailPanel — N6 소속 도메인 1급 사실", () => {
  it("renders a 도메인 · <이름> fact in the header when the node has an owning domain", () => {
    renderPanel(undefined, undefined, {
      domain: { id: "domains/ai-agent-partner", title: "AI Agent Partner" },
    });
    const fact = screen.getByTestId("topology-v2-detail-panel-domain");
    expect(fact).toHaveTextContent("domain");
    expect(fact).toHaveTextContent("AI Agent Partner");
  });

  it("hides the domain fact when the node has no owning domain", () => {
    renderPanel(undefined, undefined, { domain: null });
    expect(screen.queryByTestId("topology-v2-detail-panel-domain")).not.toBeInTheDocument();
  });

  it("focuses the domain via onSelectConnection when the domain fact is clicked", () => {
    const onSelectConnection = vi.fn();
    renderPanel(undefined, undefined, {
      domain: { id: "domains/ai-agent-partner", title: "AI Agent Partner" },
      onSelectConnection,
    });
    fireEvent.click(screen.getByTestId("topology-v2-detail-panel-domain"));
    expect(onSelectConnection).toHaveBeenCalledWith("domains/ai-agent-partner");
  });
});

describe("TopologyV2DetailPanel — W2-A action row", () => {
  it("links the 문서 tile to the document href when the node has a backing doc", () => {
    renderPanel(undefined, undefined, { documentHref: "/docs/domains/views" });
    const link = screen.getByTestId("topology-v2-detail-panel-action-document");
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", expect.stringContaining("/docs/domains/views"));
  });

  it("disables the 문서 tile when the node has no sourceSlug/document href", () => {
    renderPanel(undefined, undefined, { documentHref: null });
    const tile = screen.getByTestId("topology-v2-detail-panel-action-document");
    expect(tile.tagName).not.toBe("A");
    expect(tile).toHaveAttribute("aria-disabled", "true");
  });

  it("links the 관계 편집 tile to the builder deep link", () => {
    renderPanel();
    const link = screen.getByTestId("topology-v2-detail-panel-action-edit");
    expect(link).toHaveAttribute("href", expect.stringContaining("/ontology/edit/"));
  });

  it("copies the handoff text when the 인계 복사 tile is clicked", () => {
    const onCopyHandoff = vi.fn();
    renderPanel(undefined, undefined, { onCopyHandoff });
    fireEvent.click(screen.getByTestId("topology-v2-detail-panel-action-handoff"));
    expect(onCopyHandoff).toHaveBeenCalledWith("node: domains/views");
  });

  it("calls onSetPathSource when the 경로 tile is clicked", () => {
    const onSetPathSource = vi.fn();
    renderPanel(undefined, undefined, { onSetPathSource });
    fireEvent.click(screen.getByTestId("topology-v2-detail-panel-action-path"));
    expect(onSetPathSource).toHaveBeenCalledTimes(1);
  });

  it("no longer renders a duplicate handoff button in the footer", () => {
    renderPanel();
    expect(
      screen.queryByTestId("topology-v2-detail-panel-handoff"),
    ).not.toBeInTheDocument();
  });

  // S2 파트 3 — 긴 "담는 것"은 경로 프리픽스 요약을 기본으로, "전체 보기"로 리스트.
  it("담는 것이 15개 초과면 경로 프리픽스 요약을 보여주고 '전체 보기'로 리스트를 편다", () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({
      id: `element:cli/src/commands/c${i}`,
      title: `cmd ${i}`,
      kind: "element",
      relationType: "contains",
      direction: "outgoing" as const,
    }));
    render(
      <TopologyV2DetailPanel
        slug="domains/cli"
        title="CLI"
        kind="domain"
        domain={null}
        powered={false}
        metric={{ contains: 60, usedBy: 0, dependsOn: 0, evidence: 0 }}
        groups={{
          contains: {
            rows, // capped preview
            total: 60,
            summary: {
              groups: [
                { key: "cli/src/commands", count: 48 },
                { key: ".claude/skills", count: 6 },
              ],
              otherCount: 6,
              total: 60,
              usable: true,
            },
          },
          usedBy: { rows: [], total: 0 },
          dependsOn: { rows: [], total: 0 },
          belongsTo: { rows: [], total: 0 },
        }}
        evidence={{ rows: [], total: 0 }}
        handoffText="node: domains/cli"
        documentHref={null}
        builderEditHref="/ontology/edit/?node=domains%2Fcli"
        labels={labels}
        onSelectConnection={() => {}}
        onCopyHandoff={() => {}}
        onClose={() => {}}
        onSetPathSource={() => {}}
      />,
    );
    // 기본: 요약이 보이고 개별 행 미리보기는 숨는다.
    expect(screen.getByTestId("topology-v2-contains-summary")).toBeInTheDocument();
    expect(screen.getByText("cli/src/commands")).toBeInTheDocument();
    expect(screen.getByText("48")).toBeInTheDocument();
    expect(screen.getByText(labels.containsOtherGroup)).toBeInTheDocument();
    expect(screen.queryByText("cmd 0")).not.toBeInTheDocument();

    // "전체 보기" 토글 → 리스트 표시.
    fireEvent.click(screen.getByTestId("topology-v2-contains-summary-toggle"));
    expect(screen.queryByTestId("topology-v2-contains-summary")).not.toBeInTheDocument();
    expect(screen.getByText("cmd 0")).toBeInTheDocument();
  });

  it("담는 것이 15개 이하면 요약 없이 기존 리스트를 그대로 쓴다", () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({
      id: `capability:c${i}`,
      title: `cap ${i}`,
      kind: "capability",
      relationType: "contains",
      direction: "outgoing" as const,
    }));
    render(
      <TopologyV2DetailPanel
        slug="domains/small"
        title="Small"
        kind="domain"
        domain={null}
        powered={false}
        metric={{ contains: 3, usedBy: 0, dependsOn: 0, evidence: 0 }}
        groups={{
          contains: { rows, total: 3, summary: { groups: [], otherCount: 3, total: 3, usable: false } },
          usedBy: { rows: [], total: 0 },
          dependsOn: { rows: [], total: 0 },
          belongsTo: { rows: [], total: 0 },
        }}
        evidence={{ rows: [], total: 0 }}
        handoffText="node: domains/small"
        documentHref={null}
        builderEditHref="/ontology/edit/?node=domains%2Fsmall"
        labels={labels}
        onSelectConnection={() => {}}
        onCopyHandoff={() => {}}
        onClose={() => {}}
        onSetPathSource={() => {}}
      />,
    );
    expect(screen.queryByTestId("topology-v2-contains-summary")).not.toBeInTheDocument();
    expect(screen.queryByTestId("topology-v2-contains-summary-toggle")).not.toBeInTheDocument();
    expect(screen.getByText("cap 0")).toBeInTheDocument();
  });

  // B4 (H1) — 요약이 "기타" 한 덩어리로 무너지면(usable=false) 임계를 넘어도
  // 요약/토글을 숨기고 개별 리스트를 렌더한다(정보 0 방지).
  it("담는 것이 15개 초과라도 요약이 usable=false 면 리스트로 폴백한다", () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({
      id: `element:leaf${i}`,
      title: `leaf ${i}`,
      kind: "element",
      relationType: "contains",
      direction: "outgoing" as const,
    }));
    render(
      <TopologyV2DetailPanel
        slug="domains/flat"
        title="Flat"
        kind="domain"
        domain={null}
        powered={false}
        metric={{ contains: 40, usedBy: 0, dependsOn: 0, evidence: 0 }}
        groups={{
          contains: {
            rows,
            total: 40,
            summary: { groups: [], otherCount: 40, total: 40, usable: false },
          },
          usedBy: { rows: [], total: 0 },
          dependsOn: { rows: [], total: 0 },
          belongsTo: { rows: [], total: 0 },
        }}
        evidence={{ rows: [], total: 0 }}
        handoffText="node: domains/flat"
        documentHref={null}
        builderEditHref="/ontology/edit/?node=domains%2Fflat"
        labels={labels}
        onSelectConnection={() => {}}
        onCopyHandoff={() => {}}
        onClose={() => {}}
        onSetPathSource={() => {}}
      />,
    );
    expect(screen.queryByTestId("topology-v2-contains-summary")).not.toBeInTheDocument();
    expect(screen.queryByTestId("topology-v2-contains-summary-toggle")).not.toBeInTheDocument();
    expect(screen.getByText("leaf 0")).toBeInTheDocument();
  });
});
