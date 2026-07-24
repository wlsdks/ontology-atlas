import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildStudioItem, type StudioSourceEdge, type StudioSourceNode } from "../lib/build-studio-item";
import { buildStudioMap } from "../lib/build-studio-map";
import { StudioArena, type StudioArenaLabels } from "./StudioArena";

// The central visual is now the app's real canvas renderer. jsdom can mount it,
// but the rAF/ResizeObserver loop is noise for a chrome test — mock it to a
// lightweight probe that echoes the focus + node count it was handed, so we can
// assert the arena embeds the map focused on the right node.
vi.mock("@/widgets/topology-map-v2", () => ({
  TopologyMapV2: (props: {
    nodes: unknown[];
    realmRootId?: string | null;
    canvasLabel?: string;
  }) => (
    <div
      data-testid="topology-map-v2"
      data-realm={props.realmRootId ?? ""}
      data-node-count={props.nodes.length}
      aria-label={props.canvasLabel}
    />
  ),
}));

const NODES: StudioSourceNode[] = [
  { id: "domain:payment", title: "결제 도메인", kind: "domain" },
  { id: "cap:pay-approve", title: "결제 승인", kind: "capability", summary: "결제 승인 정의" },
  { id: "cap:stock-check", title: "재고 확인", kind: "capability" },
  { id: "cap:order-create", title: "주문 생성", kind: "capability" },
  { id: "cap:refund", title: "환불", kind: "capability" },
  { id: "el:gateway", title: "src/payment/gateway.ts", kind: "element" },
];
const EDGES: StudioSourceEdge[] = [
  { from: "domain:payment", to: "cap:pay-approve", type: "contains" },
  { from: "cap:pay-approve", to: "el:gateway", type: "contains" },
  { from: "cap:pay-approve", to: "cap:stock-check", type: "depends_on" },
  { from: "cap:pay-approve", to: "cap:order-create", type: "depends_on" },
  { from: "cap:pay-approve", to: "cap:refund", type: "related_to" },
];

const labels: StudioArenaLabels = {
  mode: "강화",
  close: "닫기",
  statsTitle: "능력치",
  socketsTitle: "강화 슬롯",
  axis: {
    definition: "정의 · 경계",
    evidence: "근거 코드",
    contains: "담는 것",
    dependsOn: "기대는 곳",
    relates: "비슷한 것",
    isA: "상위 개념",
  },
  statConfirmed: "확정",
  statMissing: "미정",
  level: (from, to) => `강화 Lv.${from} → Lv.${to}`,
  levelMax: (level) => `강화 Lv.${level} · 최대`,
  gaugeLead: "강화도",
  gaugeTrail: "· 상위 개념을 넣으면",
  gaugeMax: (percent) => `강화도 ${percent}% · 완성`,
  isaTag: "is-a · 새 축",
  isaPrompt: (title) => `"${title}은(는) 무엇의 한 종류인가?"`,
  relationMeta: (count) => `관계 ${count}`,
  relatesPick: "선택",
  relatesEmptyHint: "대체·보완 관계면 연결",
  add: "＋ 넣기",
  readOnlyNote: "읽기 전용",
  enhance: "강화하기",
  enhanceSub: "직접 적용",
  agent: "에이전트에게 맡기기",
  mapAria: "결제 승인 노드 지도",
};

// buildStudioMap wants the richer KnowledgeGraph fields (id/evidenceIds/…),
// absent in these structural fixtures. The arena only forwards the graph to the
// (mocked) renderer, so filling the missing fields keeps the fixture small.
function renderArena(onDeferredAction = vi.fn()) {
  const item = buildStudioItem("cap:pay-approve", NODES, EDGES)!;
  const map = buildStudioMap(
    "cap:pay-approve",
    NODES.map((n) => ({ ...n, projectIds: [], evidenceIds: [], lastApprovedAt: new Date(0), lastApprovedBy: "" })),
    EDGES.map((e, i) => ({
      ...e,
      id: `e${i}`,
      projectIds: [],
      evidenceIds: [],
      lastApprovedAt: new Date(0),
      lastApprovedBy: "",
    })),
  );
  render(
    <StudioArena
      item={item}
      map={map}
      labels={labels}
      onDeferredAction={onDeferredAction}
    />,
  );
  return { item, map, onDeferredAction };
}

describe("StudioArena", () => {
  it("embeds the real topology map focused on the node's ego world", async () => {
    const { map } = renderArena();
    const embed = screen.getByTestId("studio-map");
    const canvas = screen.getByTestId("topology-map-v2");
    expect(embed).toContainElement(canvas);
    // Ego subgraph = focal + its direct neighbors.
    expect(canvas).toHaveAttribute("data-node-count", String(map.nodes.length));
    expect(map.nodes.some((n) => n.id === "cap:pay-approve" && n.isHub)).toBe(true);
    // The map enters the focal node's realm one frame after mount so it frames
    // the node's own world (the amber hub of its ego graph).
    await waitFor(() => expect(canvas).toHaveAttribute("data-realm", "cap:pay-approve"));
  });

  it("no longer hand-draws a hexagon item", () => {
    renderArena();
    expect(screen.queryByTestId("studio-hex")).toBeNull();
  });

  it("renders the node's real relations as filled gem sockets with neighbors", () => {
    renderArena();
    const depends = screen.getByTestId("studio-socket-dependsOn");
    expect(depends).toHaveAttribute("data-filled", "true");
    expect(depends).toHaveTextContent("재고 확인 · 주문 생성");

    const contains = screen.getByTestId("studio-socket-contains");
    expect(contains).toHaveAttribute("data-filled", "true");
    expect(contains).toHaveTextContent("src/payment/gateway.ts");

    const relates = screen.getByTestId("studio-socket-relates");
    expect(relates).toHaveTextContent("환불");
  });

  it("always renders the empty gold is_a socket as the new axis", () => {
    renderArena();
    const isa = screen.getByTestId("studio-socket-isA");
    expect(isa).toHaveTextContent("상위 개념");
    expect(isa).toHaveTextContent("is-a · 새 축");
  });

  it("previews the enhancement gain in the gauge note (80% → 100%)", () => {
    renderArena();
    const note = screen.getByTestId("studio-gauge-note");
    expect(note).toHaveTextContent("80%");
    expect(note).toHaveTextContent("100%");
  });

  it("read-only: enhance/agent/socket buttons fire the deferred handler", async () => {
    const { onDeferredAction } = renderArena();
    screen.getByTestId("studio-enhance").click();
    screen.getByTestId("studio-agent").click();
    screen.getByTestId("studio-socket-isA").click();
    expect(onDeferredAction).toHaveBeenCalledTimes(3);
  });
});
