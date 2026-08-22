import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { MeaningGapSection, type MeaningGapLabels } from "./MeaningGapSection";
import type { MeaningGapRow } from "../../lib/meaning-gap-rows";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/shared/lib/copy-text", () => ({ copyText: vi.fn(async () => true) }));

const labels: MeaningGapLabels = {
  openSource: "Open source",
  openBuilder: "Edit on map",
  openBuilderReadOnly: "View on map",
  handoffCopy: "Verify with agent",
  handoffCopyIdle: "Copy the command",
  handoffCopied: "Copied",
  handoffCopyFailed: '복사 실패',
  handoffCopiedHint: "Paste it into your AI tool.",
  rowMenuTrigger: "More actions",
  sectionTitle: "No meaning written down",
  hint: "One sentence is enough.",
  openMap: "Inspect on map",
  writeHere: "write it here",
  writeHereClose: "collapse",
  definitionPlaceholder: "Describe this in one sentence",
  domainLegend: "Which area?",
  confirmDefinition: (file) => `Will edit ${file}.md · description`,
  confirmDomain: (file, value) => `Will edit ${file}.md · domain becomes ${value}`,
  save: "Save",
  saving: "Saving",
  cancel: "Cancel",
  cancelArmed: "Press again to discard",
  saved: "Saved",
  failed: (message) => `Could not save — ${message}`,
  conflict: "This file just changed",
  needsText: "Write one sentence",
  needsDomain: "Pick one area",
  readOnlyHint: "The example folder cannot be edited.",
};

const row: MeaningGapRow = {
  id: "missing-definition:capabilities/pay",
  gap: "missing-definition",
  nodeId: "capability:pay",
  ownSlug: "capabilities/pay",
  agentRef: "capabilities/pay",
  title: "결제 승인",
  nodeKind: "capability",
  mtime: 42,
  handoffPayload: 'patch_concept({slug:"capabilities/pay"})',
};

function renderSection(
  overrides: Partial<React.ComponentProps<typeof MeaningGapSection>> = {},
) {
  const onWrite = overrides.onWrite ?? vi.fn(async () => {});
  const utils = render(
    <MeaningGapSection
      gapKind="missing-definition"
      rows={[row]}
      totalCount={1}
      abilities={{ canWriteVault: true, agentObserved: false }}
      mapHref={(id) => `/?node=${id}`}
      sourceHref={() => "/docs/?slug=capabilities%2Fpay"}
      builderHref={() => "/ontology/studio/?node=capability%3Apay"}
      onWrite={onWrite}
      moreCount={(count) => `+${count} more`}
      labels={labels}
      {...overrides}
    />,
  );
  return { ...utils, onWrite };
}

describe("MeaningGapSection", () => {
  it("한 문장을 적어 저장하면 그 파일 한 곳에만 쓴다 — 저장 전엔 아무 쓰기도 없다", async () => {
    const { onWrite } = renderSection();
    expect(onWrite).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("meaning-gap-write-toggle"));
    // What will be written where is on screen before pressing.
    expect(screen.getByTestId("meaning-gap-confirm")).toHaveTextContent("Write one sentence");
    fireEvent.change(screen.getByTestId("meaning-gap-definition-input"), {
      target: { value: "결제 요청을 승인/거절로 판정한다." },
    });
    expect(screen.getByTestId("meaning-gap-confirm")).toHaveTextContent(
      "Will edit capabilities/pay.md · description",
    );

    fireEvent.click(screen.getByTestId("meaning-gap-save"));
    await waitFor(() => expect(onWrite).toHaveBeenCalledTimes(1));
    expect(onWrite).toHaveBeenCalledWith(row, "결제 요청을 승인/거절로 판정한다.");
    await waitFor(() => expect(screen.getByTestId("meaning-gap-saved")).toBeInTheDocument());
  });

  it("저장은 누른 프레임에 잠긴다 — 연타해도 한 번만 쓴다", async () => {
    const pending: Array<() => void> = [];
    const onWrite = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          pending.push(resolve);
        }),
    );
    renderSection({ onWrite });
    fireEvent.click(screen.getByTestId("meaning-gap-write-toggle"));
    fireEvent.change(screen.getByTestId("meaning-gap-definition-input"), {
      target: { value: "한 문장" },
    });
    const save = screen.getByTestId("meaning-gap-save");
    fireEvent.click(save);
    fireEvent.click(save);
    fireEvent.click(save);
    expect(onWrite).toHaveBeenCalledTimes(1);
    expect(save).toHaveTextContent("Saving");
    pending.forEach((resolve) => resolve());
    await waitFor(() => expect(screen.getByTestId("meaning-gap-saved")).toBeInTheDocument());
  });

  it("취소는 파일을 만지지 않고, 적은 내용이 있으면 한 번 더 물어본다", () => {
    const { onWrite } = renderSection();
    fireEvent.click(screen.getByTestId("meaning-gap-write-toggle"));
    fireEvent.change(screen.getByTestId("meaning-gap-definition-input"), {
      target: { value: "적다가 그만둠" },
    });
    fireEvent.click(screen.getByTestId("meaning-gap-cancel"));
    expect(screen.getByTestId("meaning-gap-cancel-armed")).toBeInTheDocument();
    expect(screen.getByTestId("meaning-gap-disclosure")).toHaveAttribute("data-state", "open");

    fireEvent.click(screen.getByTestId("meaning-gap-cancel"));
    expect(screen.getByTestId("meaning-gap-disclosure")).toHaveAttribute("data-state", "closed");
    expect(onWrite).not.toHaveBeenCalled();
  });

  it("Esc 는 2단이다 — 펼친 행에서는 이 행이 먹고, 접힌 행에서는 위로 흘려보낸다", () => {
    const onOuterEscape = vi.fn();
    const { container } = render(
      <div onKeyDown={onOuterEscape}>
        <MeaningGapSection
          gapKind="missing-definition"
          rows={[row]}
          totalCount={1}
          abilities={{ canWriteVault: true, agentObserved: false }}
          mapHref={() => "/"}
          sourceHref={() => null}
          builderHref={() => "/"}
          onWrite={vi.fn(async () => {})}
          moreCount={(count) => `+${count} more`}
          labels={labels}
        />
      </div>,
    );
    const gapRow = within(container).getByTestId("do-next-meaning-gap-row");
    // Collapsed — the parent (tab or palette) receives it.
    fireEvent.keyDown(gapRow, { key: "Escape" });
    expect(onOuterEscape).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("meaning-gap-write-toggle"));
    onOuterEscape.mockClear();
    fireEvent.keyDown(gapRow, { key: "Escape" });
    expect(onOuterEscape).not.toHaveBeenCalled();
    expect(screen.getByTestId("meaning-gap-disclosure")).toHaveAttribute("data-state", "closed");
  });

  it("동시수정 충돌은 조용히 덮지 않고 행 안에서 알린다 — 적은 문장은 남는다", async () => {
    const conflict = Object.assign(new Error("Vault conflict"), { name: "VaultConflictError" });
    const onWrite = vi.fn(async () => {
      throw conflict;
    });
    renderSection({ onWrite });
    fireEvent.click(screen.getByTestId("meaning-gap-write-toggle"));
    fireEvent.change(screen.getByTestId("meaning-gap-definition-input"), {
      target: { value: "한 문장" },
    });
    fireEvent.click(screen.getByTestId("meaning-gap-save"));
    await waitFor(() => expect(screen.getByTestId("mtime-conflict-badge")).toBeInTheDocument());
    expect(screen.queryByTestId("meaning-gap-saved")).toBeNull();
    expect(screen.getByTestId("meaning-gap-definition-input")).toHaveValue("한 문장");
  });

  it("실패는 토스트가 아니라 행 안에서 말한다 — 입력 문맥을 떠나지 않게", async () => {
    const onWrite = vi.fn(async () => {
      throw new Error("no permission");
    });
    renderSection({ onWrite });
    fireEvent.click(screen.getByTestId("meaning-gap-write-toggle"));
    fireEvent.change(screen.getByTestId("meaning-gap-definition-input"), {
      target: { value: "한 문장" },
    });
    fireEvent.click(screen.getByTestId("meaning-gap-save"));
    await waitFor(() =>
      expect(screen.getByTestId("meaning-gap-failed")).toHaveTextContent(
        "Could not save — no permission",
      ),
    );
  });

  it("읽기 전용 세션엔 입력칸이 없고, 대신 넘길 명령과 이유가 있다 — 회색 비활성 버튼 0", () => {
    renderSection({ abilities: { canWriteVault: false, agentObserved: false } });
    expect(screen.queryByTestId("meaning-gap-write-toggle")).toBeNull();
    expect(screen.getByTestId("do-next-handoff-copy")).toHaveTextContent("Copy the command");
    expect(screen.getByTestId("meaning-gap-readonly-hint")).toBeInTheDocument();
    expect(
      screen.queryAllByRole("button").filter((button) => button.hasAttribute("disabled")),
    ).toHaveLength(0);
  });

  it("소속 미정 행은 볼트에 있는 영역만 칩으로 고르게 한다", async () => {
    const domainRow: MeaningGapRow = {
      ...row,
      id: "missing-domain:capabilities/pay",
      gap: "missing-domain",
    };
    const onWrite = vi.fn(async () => {});
    render(
      <MeaningGapSection
        gapKind="missing-domain"
        rows={[domainRow]}
        totalCount={1}
        abilities={{ canWriteVault: true, agentObserved: true }}
        domainChoices={[
          { value: "billing", label: "결제" },
          { value: "orders", label: "주문" },
        ]}
        mapHref={() => "/"}
        sourceHref={() => null}
        builderHref={() => "/"}
        onWrite={onWrite}
        moreCount={(count) => `+${count} more`}
        labels={{ ...labels, sectionTitle: "No area written down" }}
      />,
    );
    fireEvent.click(screen.getByTestId("meaning-gap-write-toggle"));
    const chips = screen.getAllByTestId("meaning-gap-domain-chip");
    expect(chips.map((chip) => chip.textContent)).toEqual(["결제", "주문"]);
    fireEvent.click(chips[1]);
    expect(screen.getByTestId("meaning-gap-confirm")).toHaveTextContent(
      "Will edit capabilities/pay.md · domain becomes orders",
    );
    fireEvent.click(screen.getByTestId("meaning-gap-save"));
    await waitFor(() => expect(onWrite).toHaveBeenCalledWith(domainRow, "orders"));
  });

  it("행이 없으면 섹션 자체를 그리지 않는다 — 「0건」 성공 카드는 잉크만 쓴다", () => {
    const { container } = render(
      <MeaningGapSection
        gapKind="missing-definition"
        rows={[]}
        totalCount={0}
        abilities={{ canWriteVault: true, agentObserved: false }}
        mapHref={() => "/"}
        sourceHref={() => null}
        builderHref={() => "/"}
        onWrite={vi.fn(async () => {})}
        moreCount={(count) => `+${count} more`}
        labels={labels}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
