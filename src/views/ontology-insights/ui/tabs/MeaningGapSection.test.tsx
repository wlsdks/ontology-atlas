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
  askAgent: "Ask the agent",
  fixHere: "Fix it myself",
  viewOnMap: "View on map",
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
      sentence="Nothing says what this means."
      abilities={{ canWriteVault: true, agentObserved: false }}
      mapHref={(id) => `/?node=${id}`}
      sourceHref={() => "/docs/?slug=capabilities%2Fpay"}
      builderHref={() => "/ontology/studio/?node=capability%3Apay"}
      onWrite={onWrite}
      labels={labels}
      {...overrides}
    />,
  );
  return { ...utils, onWrite };
}

describe("MeaningGapSection", () => {
  it("writes only that file on save and nothing before", async () => {
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

  it("writes once when save is pressed repeatedly", async () => {
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

  it("leaves the file untouched on cancel and confirms when text was entered", () => {
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

  it("handles Escape in an expanded row and lets it bubble from a collapsed one", () => {
    const onOuterEscape = vi.fn();
    const { container } = render(
      <div onKeyDown={onOuterEscape}>
        <MeaningGapSection
          gapKind="missing-definition"
          rows={[row]}
          sentence="Nothing says what this means."
          abilities={{ canWriteVault: true, agentObserved: false }}
          mapHref={() => "/"}
          sourceHref={() => null}
          builderHref={() => "/"}
          onWrite={vi.fn(async () => {})}
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

  it("reports a concurrent edit conflict in the row and keeps the entered text", async () => {
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

  it("reports failure in the row instead of a toast", async () => {
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

  /**
   * The read-only line itself moved up to the list (it is said once per screen, beside the control
   * that opens a folder, rather than once per run of rows). What the row must still do is offer a
   * door that opens: no input, but a way to look and a command to hand over.
   */
  it("offers a handoff command instead of an input in a read-only session", () => {
    renderSection({ abilities: { canWriteVault: false, agentObserved: false } });
    expect(screen.queryByTestId("meaning-gap-write-toggle")).toBeNull();
    expect(screen.getByTestId("do-next-item-view")).toHaveTextContent("View on map");
    fireEvent.click(screen.getByTestId("do-next-row-menu"));
    expect(screen.getByTestId("do-next-row-menu-handoff")).toHaveTextContent("Copy the command");
    expect(
      screen.queryAllByRole("button").filter((button) => button.hasAttribute("disabled")),
    ).toHaveLength(0);
  });

  it("offers only vault domains as chips for a row without a domain", async () => {
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
        sentence="No domain is written down."
        abilities={{ canWriteVault: true, agentObserved: true }}
        domainChoices={[
          { value: "billing", label: "결제" },
          { value: "orders", label: "주문" },
        ]}
        mapHref={() => "/"}
        sourceHref={() => null}
        builderHref={() => "/"}
        onWrite={onWrite}
        labels={labels}
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

  it("renders no section without rows", () => {
    const { container } = render(
      <MeaningGapSection
        gapKind="missing-definition"
        rows={[]}
        sentence="Nothing says what this means."
        abilities={{ canWriteVault: true, agentObserved: false }}
        mapHref={() => "/"}
        sourceHref={() => null}
        builderHref={() => "/"}
        onWrite={vi.fn(async () => {})}
        labels={labels}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
