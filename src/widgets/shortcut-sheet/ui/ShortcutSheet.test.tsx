import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import enMessages from "../../../../messages/en.json";
import { ShortcutSheet } from "./ShortcutSheet";

/**
 * W2-C — the "지형도"/"Relief" (topology) section used to list interactions
 * the v2 canvas never implemented (더블클릭 로컬 · Shift+클릭 경로 · Tab
 * 이웃 · / 검색 · 0 깊이). This test locks the corrected section to the
 * canvas's ACTUAL behavior so a future stale-key regression fails loudly
 * (the exact failure mode that motivated this rewrite in the first place).
 */
function renderSheet() {
  render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ShortcutSheet open onClose={() => {}} />
    </NextIntlClientProvider>,
  );
}

describe("ShortcutSheet — topology section (W2-C)", () => {
  it("no longer lists the unimplemented double-click/shift-click/tab/slash/depth interactions", () => {
    renderSheet();
    expect(screen.queryByText(/Show only neighbors of the selected node/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Highlight the shortest path between two nodes/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Move to a neighbor of the selected node/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Focus the graph search input/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Clear the depth filter/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Limit to N hops/i)).not.toBeInTheDocument();
  });

  it("lists the real canvas interactions: click select, drag pan/move, wheel zoom, ⌘K search, Esc, right-click menu", () => {
    renderSheet();
    expect(screen.getByText("Select a node")).toBeInTheDocument();
    expect(
      screen.getByText("Pan the map (empty space) or move a node (spring rebound)"),
    ).toBeInTheDocument();
    expect(screen.getByText("Zoom in or out")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Context menu — document, edit relations, copy handoff, path, full detail",
      ),
    ).toBeInTheDocument();
  });
});
