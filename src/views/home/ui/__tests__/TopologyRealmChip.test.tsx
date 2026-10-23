import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TopologyRealmChip } from "../TopologyRealmChip";

describe("TopologyRealmChip", () => {
  it("exposes a visible localized action to return from the named scope", () => {
    const onClear = vi.fn();
    render(<TopologyRealmChip title="Topology" beforeLabel="" afterLabel="만 보기" clearAriaLabel="전체 지도" onClear={onClear} />);

    const back = screen.getByRole("button", { name: "전체 지도" });
    expect(back).toHaveTextContent("전체 지도");
    expect(screen.getByTestId("topology-realm-chip-title")).toHaveTextContent("Topology");
    fireEvent.click(back);
    expect(onClear).toHaveBeenCalledOnce();
  });
});
