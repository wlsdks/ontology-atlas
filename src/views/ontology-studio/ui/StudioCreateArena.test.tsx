import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { candidateFromNode, type CreateCandidate, type CreateDraft } from "../lib/build-create-node";
import { StudioCreateArena, type StudioCreateLabels } from "./StudioCreateArena";

const candidates: CreateCandidate[] = [
  candidateFromNode({ id: "capability:order-cancel", kind: "capability", title: "주문 취소" }),
  candidateFromNode({ id: "capability:refund", kind: "capability", title: "환불 처리" }),
  candidateFromNode({ id: "element:gateway", kind: "element", title: "src/payment/gateway.ts" }),
];

const labels: StudioCreateLabels = {
  mode: "＋ 만들기",
  title: "새 노드 만들기",
  close: "닫기",
  kindLabelHead: "종류",
  nameLabel: "이름",
  namePlaceholder: "이름",
  domainLabel: "소속 도메인",
  domainNone: "도메인 없음",
  definitionLabel: "정의",
  definitionPlaceholder: "정의",
  gaugeLabel: "완성도",
  gaugeNote: (f, t) => `${f}/${t}`,
  assembleTitle: "관계 조립",
  assembleSubtitle: "sub",
  progress: (f, t) => `${f}/${t} 채움`,
  relation: {
    isA: { title: "상위 개념", type: "is-a", hint: "h", add: "상위 잇기" },
    dependsOn: { title: "기대는 곳", type: "depends", hint: "h", add: "연결 추가" },
    contains: { title: "담는 것", type: "contains", hint: "h", add: "요소 담기" },
    relates: { title: "비슷한 것", type: "relates", hint: "h", add: "연결 추가" },
  },
  isaTag: "새 축",
  optionalTag: "선택",
  emptyCard: "아직 없음",
  pickerPlaceholder: "검색",
  pickerEmpty: "없음",
  pickerHint: "클릭",
  previewLabel: "지금까지",
  previewGhostIsa: "ghost",
  similarMessage: (title, kind, domain) => `비슷한 노드 — ${title} (${kind} · ${domain})`,
  similarOpen: "그 노드 열기",
  similarCreateAnyway: "그래도 새로 만들기",
  ledgerCount: () => "가지",
  pendingNode: (k) => `노드 (${k})`,
  pendingRelation: (r, tg) => `${r} → ${tg}`,
  applyDirect: "직접 적용",
  applyDirectSub: "쓰기",
  applyDirectDisabled: "vault 열기",
  applyAgent: "에이전트에게 맡기기",
  applyAgentSub: "복사",
};

const kindLabel = (k: string) =>
  ({ capability: "역량", domain: "도메인", element: "요소", project: "프로젝트" })[k] ?? k;

function setup(overrides: Partial<React.ComponentProps<typeof StudioCreateArena>> = {}) {
  const onApplyDirect = vi.fn();
  const onApplyAgent = vi.fn();
  const onOpenSimilar = vi.fn();
  const onExit = vi.fn();
  render(
    <StudioCreateArena
      labels={labels}
      kindLabel={kindLabel}
      domains={[{ value: "payments", title: "결제" }]}
      candidates={candidates}
      similarCandidates={candidates.map((c) => ({ slug: c.ref, title: c.title, kind: c.kind }))}
      writable={false}
      onApplyDirect={onApplyDirect}
      onApplyAgent={onApplyAgent}
      onOpenSimilar={onOpenSimilar}
      onExit={onExit}
      particleSeeds={[]}
      {...overrides}
    />,
  );
  return { onApplyDirect, onApplyAgent, onOpenSimilar, onExit };
}

function type(title: string) {
  fireEvent.change(screen.getByTestId("studio-create-title"), { target: { value: title } });
}

describe("StudioCreateArena", () => {
  it("adds a pending relation through the node picker", () => {
    setup();
    fireEvent.click(screen.getByTestId("studio-create-add-dependsOn"));
    // element gateway is a valid dependsOn candidate; order-cancel too
    fireEvent.click(screen.getByTestId("studio-create-picker-row-capability:order-cancel"));
    const card = screen.getByTestId("studio-create-card-dependsOn");
    expect(card).toHaveAttribute("data-count", "1");
    expect(within(card).getByText("주문 취소")).toBeInTheDocument();
  });

  it("removes a pending relation via its chip", () => {
    setup();
    fireEvent.click(screen.getByTestId("studio-create-add-contains"));
    fireEvent.click(screen.getByTestId("studio-create-picker-row-element:gateway"));
    const card = screen.getByTestId("studio-create-card-contains");
    expect(card).toHaveAttribute("data-count", "1");
    fireEvent.click(within(card).getByTestId("studio-create-chip-remove"));
    expect(screen.getByTestId("studio-create-card-contains")).toHaveAttribute("data-count", "0");
  });

  it("fires the near-dup guard when the typed title matches an existing node/kind", () => {
    const { onOpenSimilar } = setup();
    type("환불 처리"); // exact title match, kind capability (default)
    const warn = screen.getByTestId("studio-create-similar");
    expect(warn).toHaveTextContent("환불 처리");
    fireEvent.click(within(warn).getByText("그 노드 열기"));
    expect(onOpenSimilar).toHaveBeenCalledWith("capabilities/refund");
  });

  it("agent apply is enabled once a title is set and passes the assembled draft", () => {
    const { onApplyAgent } = setup();
    const agentBtn = screen.getByTestId("studio-create-apply-agent");
    expect(agentBtn).toBeDisabled();
    type("결제 취소");
    fireEvent.click(screen.getByTestId("studio-create-add-dependsOn"));
    fireEvent.click(screen.getByTestId("studio-create-picker-row-capability:order-cancel"));
    expect(agentBtn).not.toBeDisabled();
    fireEvent.click(agentBtn);
    const draft = onApplyAgent.mock.calls[0][0] as CreateDraft;
    expect(draft.title).toBe("결제 취소");
    expect(draft.relations).toHaveLength(1);
    expect(draft.relations[0]).toMatchObject({ type: "dependsOn" });
    expect(draft.relations[0].candidate.ref).toBe("capabilities/order-cancel");
  });

  it("direct apply stays disabled in read-only / sample mode even with a title", () => {
    const { onApplyDirect } = setup({ writable: false });
    type("결제 취소");
    expect(screen.getByTestId("studio-create-apply-direct")).toBeDisabled();
    expect(onApplyDirect).not.toHaveBeenCalled();
  });

  it("direct apply is enabled with a writable vault and passes the draft", () => {
    const { onApplyDirect } = setup({ writable: true });
    type("결제 취소");
    const btn = screen.getByTestId("studio-create-apply-direct");
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(onApplyDirect).toHaveBeenCalledTimes(1);
    expect((onApplyDirect.mock.calls[0][0] as CreateDraft).title).toBe("결제 취소");
  });
});
