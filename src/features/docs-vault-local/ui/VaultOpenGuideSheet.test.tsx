import type React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VaultOpenGuideSheet } from "./VaultOpenGuideSheet";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "ko",
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
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
    expect(screen.getByText("bulletPermission")).toBeInTheDocument();

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

  it("moves focus into the dialog and traps Tab in both directions", () => {
    render(
      <VaultOpenGuideSheet
        open
        onClose={vi.fn()}
        onPickExisting={vi.fn()}
        onCreateNew={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog");
    const close = screen.getByTestId("vault-guide-close");
    const cancel = screen.getByTestId("vault-guide-cancel");
    expect(document.activeElement).toBe(dialog);

    cancel.focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement).toBe(close);

    close.focus();
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(cancel);
  });

  it("restores focus to the opener when the sheet closes", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const view = render(
      <VaultOpenGuideSheet
        open
        onClose={vi.fn()}
        onPickExisting={vi.fn()}
        onCreateNew={vi.fn()}
      />,
    );
    expect(document.activeElement).toBe(screen.getByRole("dialog"));

    view.rerender(
      <VaultOpenGuideSheet
        open={false}
        onClose={vi.fn()}
        onPickExisting={vi.fn()}
        onCreateNew={vi.fn()}
      />,
    );
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  // 진입 검수 E-1 — 미지원 브라우저(Safari·Firefox)에서 두 CTA 는 눌러도
  // 아무 일이 없었고, 시트만 닫혀 왜 안 되는지도 어디로 가야 하는지도 사라졌다.
  it("unsupported 면 두 FSA CTA 를 걷고 macOS 앱 경로만 남긴다", () => {
    render(<VaultOpenGuideSheet open unsupported onClose={vi.fn()} />);
    expect(screen.getByTestId("vault-guide-pick-existing")).not.toBeVisible();
    expect(screen.getByTestId("vault-guide-create-new")).not.toBeVisible();
    // 오지 않을 OS 선택창을 예고하는 부제 대신 왜 안 되는지가 그 자리에 온다.
    expect(screen.queryByText("subtitle")).not.toBeInTheDocument();
    expect(screen.getByText("unsupportedNotice")).toBeInTheDocument();
    expect(screen.getByTestId("vault-guide-unsupported-cta")).toHaveAttribute(
      "href",
      expect.stringContaining("/download"),
    );
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
