import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VaultOpenGuideSheet } from "./VaultOpenGuideSheet";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("VaultOpenGuideSheet", () => {
  it("renders reassurance bullets and routes both actions", () => {
    const onPick = vi.fn();
    const onCreate = vi.fn();
    const onClose = vi.fn();
    render(
      <VaultOpenGuideSheet
        open
        onClose={onClose}
        onPickExisting={onPick}
        onCreateNew={onCreate}
      />,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // 안심 3줄 — 아무 폴더나 / 로컬 유지 / 빈 폴더 스캐폴드
    expect(screen.getByText("bulletAnyFolder")).toBeInTheDocument();
    expect(screen.getByText("bulletLocal")).toBeInTheDocument();
    expect(screen.getByText("bulletStarter")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("vault-guide-pick-existing"));
    expect(onPick).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("vault-guide-create-new"));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape and on scrim click, but not on card click", () => {
    const onClose = vi.fn();
    render(
      <VaultOpenGuideSheet
        open
        onClose={onClose}
        onPickExisting={vi.fn()}
        onCreateNew={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("vault-guide-scrim"));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <VaultOpenGuideSheet
        open={false}
        onClose={vi.fn()}
        onPickExisting={vi.fn()}
        onCreateNew={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
