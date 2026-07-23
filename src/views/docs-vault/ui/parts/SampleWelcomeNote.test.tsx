import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { SampleWelcomeNote } from "./SampleWelcomeNote";

function renderNote(
  locale: "ko" | "en",
  canOpenLocalVault: boolean,
  onOpenFolder = vi.fn(),
  onDismiss = vi.fn(),
) {
  return {
    onOpenFolder,
    onDismiss,
    ...render(
      <NextIntlClientProvider locale={locale} messages={{}}>
        <SampleWelcomeNote
          canOpenLocalVault={canOpenLocalVault}
          onOpenFolder={onOpenFolder}
          onDismiss={onDismiss}
        />
      </NextIntlClientProvider>,
    ),
  };
}

describe("SampleWelcomeNote", () => {
  it("explains what this doc space is in plain Korean", () => {
    renderNote("ko", false);
    expect(screen.getByText("이 문서함은 무엇인가요?")).toBeInTheDocument();
    expect(
      screen.getByText(/ontology-atlas 프로젝트 자신의 문서를 읽기 전용 샘플로/),
    ).toBeInTheDocument();
  });

  it("falls back to English copy for the en locale", () => {
    renderNote("en", false);
    expect(screen.getByText("What is this document space?")).toBeInTheDocument();
  });

  it("offers the open-folder CTA and calls it", () => {
    const { onOpenFolder } = renderNote("ko", true);
    const button = screen.getByRole("button", { name: "내 폴더 열기" });
    fireEvent.click(button);
    expect(onOpenFolder).toHaveBeenCalledTimes(1);
  });

  it("hides the open-folder CTA when local vault access is unavailable", () => {
    renderNote("ko", false);
    expect(screen.queryByRole("button", { name: "내 폴더 열기" })).not.toBeInTheDocument();
  });

  it("dismisses via the close button", () => {
    const { onDismiss } = renderNote("ko", false);
    fireEvent.click(screen.getByRole("button", { name: "안내 닫기" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
