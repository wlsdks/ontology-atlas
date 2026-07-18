import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TopologyIndexAgentHandoff } from "./TopologyIndexAgentHandoff";

const labels = {
  menuLabel: "Handoff",
  menuAria: "Copy agent handoff text",
  briefCopy: "Copy map brief",
  briefCopied: "Map brief copied",
  briefCopyAriaLabel: "Copy topology map brief",
  briefCopiedAriaLabel: "Topology map brief copied",
  reanalyzeCopy: "Audit",
  reanalyzeCopied: "Reanalysis command copied",
  reanalyzeCopyAriaLabel: "Copy ontology reanalysis command",
  reanalyzeCopiedAriaLabel: "Ontology reanalysis command copied",
  syncCopy: "Sync",
  syncCopied: "Update check copied",
  syncCopyAriaLabel: "Copy ontology update check",
  syncCopiedAriaLabel: "Ontology update check copied",
};

describe("TopologyIndexAgentHandoff", () => {
  it("copies the brief text and flashes the copied label", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <TopologyIndexAgentHandoff
        briefText="# Topology map brief"
        reanalyzeText="reanalyze me"
        syncText="sync gate packet"
        labels={labels}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: labels.briefCopyAriaLabel }));

    expect(writeText).toHaveBeenCalledWith("# Topology map brief");
    const copied = await screen.findByRole("button", {
      name: labels.briefCopiedAriaLabel,
    });
    expect(copied).toHaveTextContent(labels.briefCopy);
  });

  it("copies the reanalyze and sync texts independently", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <TopologyIndexAgentHandoff
        briefText="brief"
        reanalyzeText="reanalyze me"
        syncText="sync gate packet"
        labels={labels}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: labels.reanalyzeCopyAriaLabel }));
    expect(writeText).toHaveBeenCalledWith("reanalyze me");
    await screen.findByRole("button", { name: labels.reanalyzeCopiedAriaLabel });

    fireEvent.click(screen.getByRole("button", { name: labels.syncCopyAriaLabel }));
    expect(writeText).toHaveBeenCalledWith("sync gate packet");
    await screen.findByRole("button", { name: labels.syncCopiedAriaLabel });
  });

  it("renders the menu summary with the handoff label", () => {
    render(
      <TopologyIndexAgentHandoff
        briefText="brief"
        reanalyzeText="reanalyze"
        syncText="sync"
        labels={labels}
      />,
    );

    expect(screen.getByTestId("topology-index-agent-handoff-summary")).toHaveTextContent(
      "Handoff",
    );
  });
});
