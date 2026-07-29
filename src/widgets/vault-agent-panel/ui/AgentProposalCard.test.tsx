import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { AgentProposalCard } from "./AgentProposalCard";
import type { AgentProposal } from "@/features/vault-agent/model/types";

/**
 * **쓰기가 도는 동안은 잠긴다.**
 *
 * 초안은 `await applyProposal` 내내 상태를 `pending` 으로 두었다. 그래서
 * 「적용」을 두 번 누르면 **볼트 쓰기가 두 번 동시에** 들어갔고, 그 사이
 * 「취소」도 눌렸다. 화면에는 "적용 중" 이라는 구별이 **하나도 없었다** — 즉
 * 사용자에게 이중 클릭은 예외가 아니라 **기대되는 행동**이었다. 아무 반응이
 * 없으면 다시 누르는 것이 정상이다.
 *
 * (디자인 카운슬 「상호작용」 반려 사유, 2026-07-29)
 */

const baseProposal = (status: AgentProposal["status"]): AgentProposal =>
  ({
    id: "p1",
    status,
    snapshotRequested: false,
    readNodesThisTurn: [],
    changes: [
      {
        id: "c1",
        kind: "create",
        summary: "새 개념",
        selected: true,
        files: [
          {
            path: "capabilities/x.md",
            kind: "create",
            before: null,
            after: "---\nkind: capability\n---\n",
            additions: 3,
            deletions: 0,
          },
        ],
      },
    ],
  }) as unknown as AgentProposal;

const labels = {
  title: (n: number) => `변경 ${n}건`,
  readOnlyTitle: "읽기 전용",
  volume: (v: string) => `분량 ${v}`,
  unreadWarning: "안 읽은 파일",
  expandHint: "펼치기",
  apply: (n: number) => `적용 ${n}건`,
  applying: "적용 중…",
  cancel: "취소",
  cancelled: "취소됨",
  conflict: "충돌",
  applied: (sha: string) => `적용됨 ${sha}`,
  appliedNoSnapshot: "적용됨",
  snapshotLabel: "스냅샷",
} as unknown as Parameters<typeof AgentProposalCard>[0]["labels"];

function renderCard(status: AgentProposal["status"]) {
  const onApply = vi.fn();
  const onCancel = vi.fn();
  render(
    <AgentProposalCard
      proposal={baseProposal(status)}
      labels={labels}
      canWrite
      vaultIsGit={false}
      expandedByDefault={false}
      onApply={onApply}
      onCancel={onCancel}
      onCopy={vi.fn()}
      onToggleChange={vi.fn()}
      onToggleSnapshot={vi.fn()}
      onFocusNode={vi.fn()}
    />,
  );
  return { onApply, onCancel };
}

describe("AgentProposalCard — 적용 중 잠금", () => {
  it("offers the action while the proposal is still pending", () => {
    renderCard("pending");
    expect(screen.getByText("적용 1건")).toBeInTheDocument();
  });

  /**
   * 이 두 단언이 이 파일의 존재 이유다 — **말하고, 잠근다.** 둘 중 하나만
   * 있으면 안 된다: 잠그기만 하면 사용자는 왜 안 눌리는지 모르고, 말하기만
   * 하면 두 번 눌러 두 번 쓴다.
   */
  it("says it is applying, and locks both actions while it does", () => {
    renderCard("applying");

    expect(screen.getByText("적용 중…")).toBeInTheDocument();
    // **쓰기 동작만** 잠근다. 「펼치기」 같은 읽기 동작은 열어 둔다 — 쓰는
    // 동안 무엇이 쓰이는지 들여다보는 것을 막을 이유가 없다.
    expect(screen.getByTestId("agent-proposal-apply")).toBeDisabled();
    expect(screen.getByTestId("agent-proposal-cancel")).toBeDisabled();
  });

  /**
   * 그리고 **거짓말을 하지 않는다.** 초안은 `applying` 을 종료 상태로 취급해
   * 종료 문구의 fallback 으로 떨어뜨렸고, 화면이 쓰는 중에 **"취소됨"** 이라고
   * 말했다. 잠그지 않은 것보다 나쁘다.
   */
  it("does not claim the write is over while it is still running", () => {
    renderCard("applying");
    expect(screen.queryByTestId("agent-proposal-outcome")).not.toBeInTheDocument();
    expect(screen.queryByText("취소됨")).not.toBeInTheDocument();
  });

  it("retires the actions once the write settled", () => {
    renderCard("applied");
    expect(screen.queryByTestId("agent-proposal-apply")).not.toBeInTheDocument();
    expect(screen.queryByTestId("agent-proposal-cancel")).not.toBeInTheDocument();
    expect(screen.getByTestId("agent-proposal-outcome")).toBeInTheDocument();
  });
});
