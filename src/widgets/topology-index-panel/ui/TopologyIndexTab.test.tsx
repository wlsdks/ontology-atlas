import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TopologyIndexTab } from "./TopologyIndexTab";

describe("TopologyIndexTab", () => {
  it("calls onExpand when clicked", () => {
    const onExpand = vi.fn();
    render(
      <TopologyIndexTab
        onExpand={onExpand}
        labels={{ expandAria: "Expand INDEX", agentSyncTitle: "synced 12m ago" }}
      />,
    );
    fireEvent.click(screen.getByTestId("topology-index-tab"));
    expect(onExpand).toHaveBeenCalledTimes(1);
  });
});
