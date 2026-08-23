import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { AgentProposalCard } from "./AgentProposalCard";
import type { AgentProposal } from "@/features/vault-agent/model/types";

/**
 * **It locks while the write is running.**
 *
 * The draft left the status `pending` throughout `await applyProposal`. So pressing
 * "Apply" twice sent **two simultaneous vault writes**, and "Cancel"
 * could be pressed in between. The screen had **no indication at all** that it was
 * applying — meaning a double click was not an exception for the user but
 * **expected behaviour**. With no response, pressing again is normal.
 *
 * (The design council's "Interaction" rejection rationale, 2026-07-29.)
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
   * These two assertions are this file's reason to exist — **say it, and lock it.**
   * Neither alone is enough: locking only leaves the user not knowing why nothing
   * responds, and saying only means two presses become two writes.
   */
  it("says it is applying, and locks both actions while it does", () => {
    renderCard("applying");

    expect(screen.getByText("적용 중…")).toBeInTheDocument();
    // **Only the write actions** lock. Read actions such as 「Expand」 (expand) stay
    // open — there is no reason to stop someone inspecting what is being written.
    expect(screen.getByTestId("agent-proposal-apply")).toBeDisabled();
    expect(screen.getByTestId("agent-proposal-cancel")).toBeDisabled();
  });

  /**
   * And **it does not lie.** The draft treated `applying` as a terminal state and
   * fell through to the terminal-copy fallback, so the screen said **"cancelled"**
   * while it was writing. That is worse than not locking.
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
