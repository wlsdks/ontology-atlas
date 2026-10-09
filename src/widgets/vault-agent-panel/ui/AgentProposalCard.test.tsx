import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

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

function renderCard(status: AgentProposal["status"], overrides: Partial<AgentProposal> = {}) {
  const onApply = vi.fn();
  const onCancel = vi.fn();
  render(
    <AgentProposalCard
      proposal={{ ...baseProposal(status), ...overrides }}
      labels={{ ...labels, failed: (message) => message,
        partialWrites: (paths) => `Confirmed saved files: ${paths}`,
        refreshFailed: (message) => `Reload failed: ${message}` }}
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

describe("AgentProposalCard while applying", () => {
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

  it('keeps a partial write failed while naming only confirmed saved files and reload errors', () => {
    renderCard('failed', {
      applyErrorMessage: 'disk full', writtenPaths: ['capabilities/x.md'],
      refreshErrorMessage: 'cannot reload',
    });
    const outcome = screen.getByTestId('agent-proposal-outcome');
    expect(outcome).toHaveTextContent('disk full');
    expect(outcome).toHaveTextContent('Confirmed saved files: capabilities/x.md');
    expect(outcome).toHaveTextContent('Reload failed: cannot reload');
    expect(screen.queryByTestId('agent-proposal-apply')).not.toBeInTheDocument();
    expect(screen.queryByTestId('agent-proposal-show-on-map')).not.toBeInTheDocument();
  });
});

const copyLabels = {
  ...labels, copy: 'Copy', copied: 'Copied', copying: 'Copying', copyFailed: 'Copy failed; retry',
  selectionConflict: (path: string) => 'Repair selection for ' + path,
  volume: ({ files, added, removed }: { files: number; added: number; removed: number }) => files + ' files; +' + added + '; -' + removed,
};

function copyCard(target: AgentProposal, onCopy: () => Promise<boolean>, canWrite = false) {
  return <AgentProposalCard proposal={target} labels={copyLabels} canWrite={canWrite}
    vaultIsGit={false} expandedByDefault onApply={vi.fn()} onCancel={vi.fn()} onCopy={onCopy}
    onToggleChange={vi.fn()} onToggleSnapshot={vi.fn()} onFocusNode={vi.fn()} />;
}

function sameFileChain(): AgentProposal {
  const target = baseProposal('pending');
  target.changes[0].files[0] = { path: 'capabilities/x.md', kind: 'modify', before: 'a', after: 'a\nb' };
  target.changes.push({ id: 'c2', tool: 'patch_concept', summary: 'Later edit', selected: true,
    files: [{ path: 'capabilities/x.md', kind: 'modify', before: 'a\nb', after: 'a\nb\nc' }] });
  return target;
}

describe('AgentProposalCard copy feedback', () => {
  it('waits for successful clipboard completion and ignores repeated presses', async () => {
    const pending = Promise.withResolvers<boolean>();
    const onCopy = vi.fn(() => pending.promise);
    render(copyCard(baseProposal('pending'), onCopy));
    const button = screen.getByTestId('agent-proposal-copy');
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent(copyLabels.copying);
    expect(button).not.toHaveTextContent(copyLabels.copied);
    expect(onCopy).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve(true); });
    expect(button).toHaveTextContent(copyLabels.copied);
  });

  it.each(['false', 'throw'] as const)('keeps failed copy retryable after %s', async mode => {
    const onCopy = vi.fn<() => Promise<boolean>>();
    if (mode === 'false') onCopy.mockResolvedValueOnce(false);
    else onCopy.mockRejectedValueOnce(new Error('denied'));
    onCopy.mockResolvedValueOnce(true);
    render(copyCard(baseProposal('pending'), onCopy));
    const button = screen.getByTestId('agent-proposal-copy');
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(copyLabels.copyFailed));
    expect(button).not.toHaveTextContent(copyLabels.copied);
    expect(button).toBeEnabled();
    fireEvent.click(button);
    await waitFor(() => expect(button).toHaveTextContent(copyLabels.copied));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([false, true])('blocks selection gaps and restores the action after repair with canWrite=%s', canWrite => {
    const target = sameFileChain();
    target.changes[0].selected = false;
    const onCopy = vi.fn(async () => true);
    const view = render(copyCard(target, onCopy, canWrite));
    const action = screen.getByTestId(canWrite ? 'agent-proposal-apply' : 'agent-proposal-copy');
    expect(action).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('capabilities/x.md');
    expect(screen.getByTestId('agent-proposal-volume')).not.toHaveTextContent('+');
    fireEvent.click(action);
    expect(onCopy).not.toHaveBeenCalled();
    target.changes[0].selected = true;
    view.rerender(copyCard({ ...target, changes: [...target.changes] }, onCopy, canWrite));
    expect(action).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('disables empty clipboard selection', () => {
    const target = baseProposal('pending');
    target.changes[0].selected = false;
    const onCopy = vi.fn(async () => true);
    render(copyCard(target, onCopy));
    fireEvent.click(screen.getByTestId('agent-proposal-copy'));
    expect(screen.getByTestId('agent-proposal-copy')).toBeDisabled();
    expect(onCopy).not.toHaveBeenCalled();
  });

  it('clears copied feedback when selected changes change', async () => {
    const target = sameFileChain();
    const onCopy = vi.fn(async () => true);
    const view = render(copyCard(target, onCopy));
    fireEvent.click(screen.getByTestId('agent-proposal-copy'));
    await waitFor(() => expect(screen.getByTestId('agent-proposal-copy')).toHaveTextContent(copyLabels.copied));
    view.rerender(copyCard({ ...target, changes: target.changes.map(change => ({ ...change, selected: false })) }, onCopy));
    expect(screen.getByTestId('agent-proposal-copy')).not.toHaveTextContent(copyLabels.copied);
  });


  it('waits for an old clipboard fallback before copying a new selection', async () => {
    const { copyText } = await import('@/shared/lib/copy-text');
    const { proposalToClipboardPacket } = await import('@/features/vault-agent');
    const previousClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const previousExec = Object.getOwnPropertyDescriptor(document, 'execCommand');
    const oldNative = Promise.withResolvers<void>();
    let delivered = '';
    const writeText = vi.fn<(text: string) => Promise<void>>()
      .mockReturnValueOnce(oldNative.promise)
      .mockImplementation(async text => { delivered = text; });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: () => {
      delivered = document.querySelector('textarea')!.value;
      return true;
    } });
    try {
      const target = sameFileChain();
      const oldText = proposalToClipboardPacket(target);
      const oldCopy = vi.fn(() => copyText(oldText));
      const current = { ...target, changes: [target.changes[0], { ...target.changes[1], selected: false }] };
      const currentText = proposalToClipboardPacket(current);
      const currentCopy = vi.fn(() => copyText(currentText));
      const view = render(copyCard(target, oldCopy));
      fireEvent.click(screen.getByTestId('agent-proposal-copy'));
      view.rerender(copyCard(current, currentCopy));
      const button = screen.getByTestId('agent-proposal-copy');
      fireEvent.click(button);
      expect(button).toBeDisabled();
      expect(writeText).toHaveBeenCalledTimes(1);
      expect(currentCopy).not.toHaveBeenCalled();
      await act(async () => { oldNative.reject(new Error('permission denied late')); });
      expect(delivered).toBe(oldText);
      expect(button).toBeEnabled();
      expect(button).not.toHaveTextContent(copyLabels.copied);
      fireEvent.click(button);
      await waitFor(() => expect(button).toHaveTextContent(copyLabels.copied));
      expect(delivered).toBe(currentText);
      expect(writeText).toHaveBeenCalledTimes(2);
    } finally {
      if (previousClipboard) Object.defineProperty(navigator, 'clipboard', previousClipboard);
      else Reflect.deleteProperty(navigator, 'clipboard');
      if (previousExec) Object.defineProperty(document, 'execCommand', previousExec);
      else Reflect.deleteProperty(document, 'execCommand');
    }
  });

  it('counts unique selected files and exposes removed repeated lines in the preview', () => {
    const target = sameFileChain();
    target.changes[0].files[0] = { path: 'capabilities/x.md', kind: 'modify', before: 'same\nsame\nend', after: 'same\nend' };
    target.changes[1].files[0] = { path: 'capabilities/x.md', kind: 'modify', before: 'same\nend', after: 'same\nend\nnew' };
    render(copyCard(target, vi.fn(async () => true), true));
    expect(screen.getByTestId('agent-proposal-volume')).toHaveTextContent('1 files; +1; -1');
    expect(screen.getByText('변경 1건')).toBeInTheDocument();
    expect(screen.getAllByTestId('agent-proposal-diff')[0]).toHaveTextContent('− same');
  });
});

it('retires pending copy feedback when the proposal is cancelled', async () => {
  const pending = Promise.withResolvers<boolean>();
  const onCopy = vi.fn(() => pending.promise);
  const target = baseProposal('pending');
  const view = render(copyCard(target, onCopy));
  fireEvent.click(screen.getByTestId('agent-proposal-copy'));
  view.rerender(copyCard({ ...target, status: 'cancelled' }, onCopy));
  await act(async () => { pending.resolve(true); });
  expect(screen.queryByTestId('agent-proposal-copy')).not.toBeInTheDocument();
  expect(screen.getByTestId('agent-proposal-outcome')).toHaveTextContent(labels.cancelled);
});
