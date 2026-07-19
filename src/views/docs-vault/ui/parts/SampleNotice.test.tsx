import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import koMessages from "../../../../../messages/ko.json";
import { SampleNotice } from "./SampleNotice";

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    className,
    ...rest
  }: {
    href: string;
    children: ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className} {...rest}>
      {children}
    </a>
  ),
}));

function renderNotice(isDesktopRuntime: boolean, onOpenFolder = vi.fn()) {
  return {
    onOpenFolder,
    ...render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <SampleNotice isDesktopRuntime={isDesktopRuntime} onOpenFolder={onOpenFolder} />
      </NextIntlClientProvider>,
    ),
  };
}

describe("SampleNotice", () => {
  it("explains why the doc is read-only in plain language", () => {
    renderNotice(false);
    expect(screen.getByText("읽기 전용 샘플이에요")).toBeInTheDocument();
    expect(
      screen.getByText(/이 문서는 Atlas 자체 예시라 편집이 잠겨 있어요\./),
    ).toBeInTheDocument();
  });

  it("offers 'open my folder' on desktop runtime and calls the reused local-vault flow", () => {
    const { onOpenFolder } = renderNotice(true);
    const button = screen.getByRole("button", { name: "내 폴더 열기" });
    fireEvent.click(button);
    expect(onOpenFolder).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("macOS 앱 다운로드")).not.toBeInTheDocument();
  });

  it("offers the macOS app download link on web runtime instead of a folder action", () => {
    renderNotice(false);
    const link = screen.getByRole("link", { name: "macOS 앱 다운로드" });
    expect(link).toHaveAttribute("href", "/download/");
    expect(screen.queryByText("내 폴더 열기")).not.toBeInTheDocument();
  });
});
