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
  statsConnected: "Connected",
  statsEvidenceDocs: "Source docs",
  codeLocationsLabel: "code location",
  codeLocationsCopyLabel: "copy",
  codeLocationsCopiedLabel: "copied",
  editSubjectPrefix: "Last edited",
  editSubjectAgent: "AI agent",
  editSubjectHuman: "me",
  editConflictMessage: "This document changed elsewhere — check before you overwrite",
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
    showHandoff?: boolean;
    showSourcePath?: boolean;
    codeLocations?: readonly string[];
    lastEditSubject?: { kind: "agent" | "human"; ageLabel: string } | null;
    mtimeConflict?: boolean;
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
      codeLocations={overrides.codeLocations ?? []}
      handoffText="node: domains/views"
      documentHref={
        overrides.documentHref !== undefined
          ? overrides.documentHref
          : "/docs/domains/views"
      }
      studioEditHref="/ontology/studio/?node=domains%2Fviews"
      labels={labels}
      lastEditSubject={overrides.lastEditSubject ?? null}
      mtimeConflict={overrides.mtimeConflict ?? false}
      onSelectConnection={overrides.onSelectConnection ?? (() => {})}
      onCopyHandoff={overrides.onCopyHandoff ?? (() => {})}
      onClose={() => {}}
      onSetPathSource={overrides.onSetPathSource ?? (() => {})}
      onOpenFullDetail={onOpenFullDetail}
      showHandoff={overrides.showHandoff}
      showSourcePath={overrides.showSourcePath}
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
  it("renders an evidence group with its row's title when evidence rows exist", () => {
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
  });

  // Toss C2 (2026-07-24) — the raw vault-path prefix (`row.path`) used to
  // render as an always-visible mono span next to the title, opaque to a
  // non-developer. It no longer renders in the visible DOM text; the row's
  // link carries the full `row.id` slug as a native `title=` hover instead
  // (information preserved, just no longer competing for first-read
  // attention with the "근거" plain label).
  it("folds the evidence row's path behind a hover title instead of always-visible text", () => {
    renderPanel(undefined, {
      rows: [{ id: "capabilities/product-owner-operating-system", title: "product-owner-operating-system", path: "capabilities/" }],
      total: 1,
    });
    expect(screen.queryByText("capabilities/")).not.toBeInTheDocument();
    const link = screen.getByText("product-owner-operating-system").closest("a");
    expect(link).toHaveAttribute("title", "capabilities/product-owner-operating-system");
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

// 시안 재설계 (2026-07-24) — the engraved per-type metric strip is replaced by
// a plain aggregate stats line ("Connected N · Source docs M"); the per-type
// counts now live once each in their own relation-group header count chips.
describe("TopologyV2DetailPanel — 근거 evidence count (numeric, in stats + group)", () => {
  it("shows the evidence total in the plain stats line (Source docs M)", () => {
    renderPanel(undefined, {
      rows: [{ id: "capabilities/mcp-server", title: "mcp-server", path: "capabilities/" }],
      total: 1,
    });
    const stats = screen.getByTestId("topology-v2-detail-panel-stats");
    expect(stats.textContent).toContain(labels.statsEvidenceDocs);
    expect(stats.textContent).toContain("1");
    // the old engraved metric strip is gone
    expect(
      screen.getByTestId("topology-v2-detail-panel").querySelector("[data-datasheet-metric='engraved']"),
    ).toBeNull();
  });

  it("shows the evidence count as a number in the group header total (matches the mockup)", () => {
    renderPanel(undefined, {
      rows: [{ id: "capabilities/mcp-server", title: "mcp-server", path: "capabilities/" }],
      total: 1,
    });
    const total = document.querySelector("[data-datasheet-group-total='evidence']");
    expect(total!.textContent).toBe("1");
  });
});

// R+ "코드 위치" (code location) — the REAL code evidence (raw file paths),
// distinct from the "근거" group above (source-doc slug reference).
describe("TopologyV2DetailPanel — 코드 위치 (code location) group", () => {
  it("renders a code-location row for each path when codeLocations is non-empty", () => {
    renderPanel(undefined, undefined, {
      codeLocations: ["mcp/src/index.js", "mcp/src/verify.mjs"],
    });
    const group = document.querySelector("[data-datasheet-group='code-locations']");
    expect(group).not.toBeNull();
    expect(screen.getByText("mcp/src/index.js")).toBeInTheDocument();
    expect(screen.getByText("mcp/src/verify.mjs")).toBeInTheDocument();
  });

  it("does not render the code-location group when there are no code paths", () => {
    renderPanel(undefined, undefined, { codeLocations: [] });
    expect(document.querySelector("[data-datasheet-group='code-locations']")).toBeNull();
  });

  it("renders a plain (non-link) row for a raw code path — distinguishable from the clickable evidence/connection rows", () => {
    renderPanel(undefined, undefined, { codeLocations: ["mcp/src/index.js"] });
    const row = screen.getByText("mcp/src/index.js").closest("li");
    expect(row).not.toBeNull();
    expect(row!.querySelector("a")).toBeNull();
  });

  it("copies the path when the row's copy button is clicked", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderPanel(undefined, undefined, { codeLocations: ["mcp/src/index.js"] });
    fireEvent.click(screen.getByTestId("topology-v2-detail-panel-code-location-copy"));
    expect(writeText).toHaveBeenCalledWith("mcp/src/index.js");
  });
});

// Toss C2 (2026-07-24) — the sticky footer used to show the FULL `slug`
// (`ontology/capabilities/mcp-server`) always visible, mono/quaternary but
// still raw and unreadable to a non-developer. It now shows only the last
// path segment and folds the full slug behind a native `title=` hover — the
// "전체 상세 →" link already owns navigating to the full record.
describe("TopologyV2DetailPanel — sticky 푸터 slug 평문화 (Toss C2)", () => {
  it("shows only the slug's last segment in visible text, with the full slug as a hover title", () => {
    render(
      <TopologyV2DetailPanel
        slug="ontology/capabilities/mcp-server"
        title="MCP Server"
        kind="capability"
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
        codeLocations={[]}
        handoffText="node: ontology/capabilities/mcp-server"
        documentHref={null}
        studioEditHref="/ontology/studio/?node=ontology%2Fcapabilities%2Fmcp-server"
        labels={labels}
        onSelectConnection={() => {}}
        onCopyHandoff={() => {}}
        onClose={() => {}}
        onSetPathSource={() => {}}
      />,
    );
    const slugEl = screen.getByTestId("topology-v2-detail-panel-slug");
    expect(slugEl).toHaveTextContent("mcp-server");
    expect(slugEl.textContent).not.toContain("ontology/capabilities");
    expect(slugEl).toHaveAttribute("title", "ontology/capabilities/mcp-server");
  });

  it("shows the slug as-is when it has no path segment to fold", () => {
    renderPanel();
    // fixture slug is "domains/views" — but a slug with no "/" should render
    // unchanged (nothing to fold).
    const slugEl = screen.getByTestId("topology-v2-detail-panel-slug");
    expect(slugEl).toHaveTextContent("views");
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

// 슬라이스 C (개발/비개발 모드 토글) — 비개발(plain) 모드는 인계 복사 액션과
// 원문 경로 서브라인을 개발자 크롬으로 간주해 숨긴다. 기본(생략)은 둘 다 true
// (기존 렌더 유지 — 회귀 0).
describe("TopologyV2DetailPanel — showHandoff / showSourcePath (슬라이스 C)", () => {
  it("showHandoff 생략 시 기본으로 인계 복사 타일을 렌더한다", () => {
    renderPanel();
    expect(screen.getByTestId("topology-v2-detail-panel-action-handoff")).toBeInTheDocument();
  });

  it("showHandoff=false 면 인계 복사 타일을 렌더하지 않는다", () => {
    renderPanel(undefined, undefined, { showHandoff: false });
    expect(
      screen.queryByTestId("topology-v2-detail-panel-action-handoff"),
    ).not.toBeInTheDocument();
  });

  it("showSourcePath 생략 시 기본으로 원문 경로 서브라인을 렌더한다 (sourceTitle 이 있을 때)", () => {
    renderPanel(undefined, undefined, { sourceTitle: "src/foo/bar-baz.ts" });
    expect(screen.getByTestId("topology-v2-detail-panel-source-path")).toBeInTheDocument();
  });

  it("showSourcePath=false 면 sourceTitle 이 있어도 원문 경로 서브라인을 렌더하지 않는다", () => {
    renderPanel(undefined, undefined, {
      sourceTitle: "src/foo/bar-baz.ts",
      showSourcePath: false,
    });
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
        codeLocations={[]}
        handoffText="node: domains/ai-agent-partner"
        documentHref={null}
        studioEditHref="/ontology/studio/?node=domains%2Fai-agent-partner"
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
    // the contains group header carries the typed label + its own count chip
    expect(group!.textContent).toContain("contains");
    expect(document.querySelector("[data-datasheet-group-total='contains']")!.textContent).toBe("2");
  });

  it("omits the 담는 것 group for a leaf node (contains 0)", () => {
    renderPanel();
    expect(document.querySelector("[data-datasheet-group='contains']")).toBeNull();
    expect(document.querySelector("[data-datasheet-group-total='contains']")).toBeNull();
  });
});

// 시안 재설계 (2026-07-24) — plain aggregate stats line: "Connected <N> ·
// Source docs <M>". N = contains + usedBy + dependsOn totals; per-type detail
// lives in each relation group's own indigo count chip.
describe("TopologyV2DetailPanel — plain stats line + group count chips", () => {
  it("renders the aggregate stats line with the connected total (usedBy 1 + dependsOn 2)", () => {
    renderPanel();
    const stats = screen.getByTestId("topology-v2-detail-panel-stats");
    expect(stats.textContent).toContain(labels.statsConnected);
    // contains 0 + usedBy 1 + dependsOn 2 = 3
    expect(stats.textContent).toContain("3");
  });

  it("gives each relation group header an indigo count chip (not the old metric ink)", () => {
    renderPanel();
    const total = document.querySelector("[data-datasheet-group-total='usedBy']");
    expect(total).not.toBeNull();
    expect(total!.className).toContain("--topology-v2-panel-count-text");
    expect(total!.textContent).toBe("1");
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
        codeLocations={[]}
        handoffText="node: src/widgets/global-search"
        documentHref={null}
        studioEditHref="/ontology/studio/?node=src%2Fwidgets%2Fglobal-search"
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

  it("hides the 문서 tile when the node has no sourceSlug/document href (no dead affordance)", () => {
    renderPanel(undefined, undefined, { documentHref: null });
    expect(
      screen.queryByTestId("topology-v2-detail-panel-action-document"),
    ).not.toBeInTheDocument();
  });

  it("links the 관계 편집 tile to the studio deep link", () => {
    renderPanel();
    const link = screen.getByTestId("topology-v2-detail-panel-action-edit");
    expect(link).toHaveAttribute("href", expect.stringContaining("/ontology/studio/"));
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
        codeLocations={[]}
        handoffText="node: domains/cli"
        documentHref={null}
        studioEditHref="/ontology/studio/?node=domains%2Fcli"
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
        codeLocations={[]}
        handoffText="node: domains/small"
        documentHref={null}
        studioEditHref="/ontology/studio/?node=domains%2Fsmall"
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
        codeLocations={[]}
        handoffText="node: domains/flat"
        documentHref={null}
        studioEditHref="/ontology/studio/?node=domains%2Fflat"
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

// rank7 (design-council B5) — last-edit provenance + expected_mtime conflict.
describe("TopologyV2DetailPanel — last-edit provenance", () => {
  it("renders no subject row when lastEditSubject is null (no fabrication)", () => {
    renderPanel();
    expect(screen.queryByTestId("last-edit-subject-row")).not.toBeInTheDocument();
  });

  it("renders the AI agent subject row from a real, caller-resolved fact", () => {
    renderPanel(undefined, undefined, {
      lastEditSubject: { kind: "agent", ageLabel: "3m ago" },
    });
    const row = screen.getByTestId("last-edit-subject-row");
    expect(row).toHaveAttribute("data-edit-subject-kind", "agent");
    expect(row).toHaveTextContent("AI agent");
    expect(row).toHaveTextContent("3m ago");
  });

  it("renders the human subject row from a real, caller-resolved fact", () => {
    renderPanel(undefined, undefined, {
      lastEditSubject: { kind: "human", ageLabel: "yesterday" },
    });
    const row = screen.getByTestId("last-edit-subject-row");
    expect(row).toHaveAttribute("data-edit-subject-kind", "human");
    expect(row).toHaveTextContent("me");
  });

  it("renders no conflict badge when mtimeConflict is false (default)", () => {
    renderPanel();
    expect(screen.queryByTestId("mtime-conflict-badge")).not.toBeInTheDocument();
  });

  it("renders the conflict badge only when the caller resolved a real mtime mismatch", () => {
    renderPanel(undefined, undefined, { mtimeConflict: true });
    expect(screen.getByTestId("mtime-conflict-badge")).toBeInTheDocument();
  });
});

// 시안 재설계 (2026-07-24, 소유자 승인 mockup-panel-detail) — 균형 헤더(이름
// hero + kind 배지 + 도메인 칩), 방향 아이콘 + 카운트 칩 + 언더라인 그룹 헤더,
// 행 왼쪽 kind 글리프, 조용한 액션 스트립, 인디고 primary 푸터.
describe("TopologyV2DetailPanel — 시안 재설계 구조", () => {
  it("renders the node name as the header hero (title2/650, truncatable)", () => {
    renderPanel();
    const name = screen.getByRole("heading", { level: 2 });
    expect(name).toHaveTextContent("Views");
    expect(name.className).toContain("text-[20px]");
    expect(name.className).toContain("truncate");
  });

  it("renders a quiet kind badge with the localized kind word next to the name", () => {
    renderPanel();
    const panel = screen.getByTestId("topology-v2-detail-panel");
    // kindLabel appears in the header badge (fixture kind = 'domain' → 'Domain')
    expect(panel.textContent).toContain(labels.kindLabel);
    // the header badge carries the kind-badge surface token
    const badge = Array.from(panel.querySelectorAll("span")).find((s) =>
      s.className.includes("--topology-v2-panel-kind-badge-surface"),
    );
    expect(badge).toBeTruthy();
    expect(badge!.textContent).toContain(labels.kindLabel);
  });

  it("no longer renders the floating power-state dot", () => {
    renderPanel();
    expect(
      screen.getByTestId("topology-v2-detail-panel").querySelector("[data-power-state]"),
    ).toBeNull();
  });

  it("renders each relation group header with an underline divider + directional glyph + count chip", () => {
    render(
      <TopologyV2DetailPanel
        slug="domains/ai-agent-partner"
        title="AI Agent Partner"
        kind="domain"
        domain={null}
        powered={false}
        metric={{ contains: 2, usedBy: 0, dependsOn: 0, evidence: 0 }}
        groups={{
          contains: {
            rows: [
              { id: "capability:mcp-server", title: "MCP Server", kind: "capability", relationType: "contains", direction: "outgoing" },
              { id: "element:agent-config", title: "Agent Config", kind: "element", relationType: "contains", direction: "outgoing" },
            ],
            total: 2,
          },
          usedBy: { rows: [], total: 0 },
          dependsOn: { rows: [], total: 0 },
          belongsTo: { rows: [], total: 0 },
        }}
        evidence={{ rows: [], total: 0 }}
        codeLocations={[]}
        handoffText="node: domains/ai-agent-partner"
        documentHref={null}
        studioEditHref="/ontology/studio/?node=domains%2Fai-agent-partner"
        labels={labels}
        onSelectConnection={() => {}}
        onCopyHandoff={() => {}}
        onClose={() => {}}
        onSetPathSource={() => {}}
      />,
    );
    const group = document.querySelector("[data-datasheet-group='contains']");
    expect(group).not.toBeNull();
    // header underline token present
    const header = group!.querySelector("[class*='--topology-v2-panel-group-underline']");
    expect(header).not.toBeNull();
    // count chip carries the indigo count token
    const chip = group!.querySelector("[data-datasheet-group-total='contains']");
    expect(chip!.className).toContain("--topology-v2-panel-count-text");
    // each row carries the canvas kind glyph (data-kind-glyph), no right-aligned kind word
    const glyphs = group!.querySelectorAll("[data-kind-glyph]");
    expect(glyphs.length).toBe(2);
  });

  it("renders the relation zone with the enlarged between-group gap token (28px rhythm)", () => {
    render(
      <TopologyV2DetailPanel
        slug="domains/ai-agent-partner"
        title="AI Agent Partner"
        kind="domain"
        domain={null}
        powered={false}
        metric={{ contains: 1, usedBy: 0, dependsOn: 0, evidence: 0 }}
        groups={{
          contains: {
            rows: [{ id: "capability:x", title: "X", kind: "capability", relationType: "contains", direction: "outgoing" }],
            total: 1,
          },
          usedBy: { rows: [], total: 0 },
          dependsOn: { rows: [], total: 0 },
          belongsTo: { rows: [], total: 0 },
        }}
        evidence={{ rows: [], total: 0 }}
        codeLocations={[]}
        handoffText="node: domains/ai-agent-partner"
        documentHref={null}
        studioEditHref="/ontology/studio/?node=domains%2Fai-agent-partner"
        labels={labels}
        onSelectConnection={() => {}}
        onCopyHandoff={() => {}}
        onClose={() => {}}
        onSetPathSource={() => {}}
      />,
    );
    const zone = document
      .querySelector("[data-datasheet-group='contains']")!
      .closest("div[class*='--topology-v2-panel-zone-gap']");
    expect(zone).not.toBeNull();
  });

  it("renders the footer '전체 상세' as the single indigo-filled primary", () => {
    renderPanel(vi.fn());
    const primary = screen.getByTestId("topology-v2-detail-panel-open-full-detail");
    expect(primary.className).toContain("--topology-v2-panel-primary-surface");
    expect(primary.className).toContain("--topology-v2-panel-primary-text");
  });

  it("renders the domain chip as an indigo-tinted navigable chip (surface token + chevron)", () => {
    renderPanel(undefined, undefined, {
      domain: { id: "domains/ai-agent-partner", title: "AI Agent Partner" },
    });
    const chip = screen.getByTestId("topology-v2-detail-panel-domain");
    expect(chip.className).toContain("--topology-v2-panel-domain-surface");
    expect(chip).toHaveAttribute("aria-label", expect.stringContaining("AI Agent Partner"));
    // a chevron (svg) affordance is present
    expect(chip.querySelector("svg")).not.toBeNull();
  });
});
