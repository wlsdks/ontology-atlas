import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import koMessages from "../../../../../messages/ko.json";
import { SampleNotice } from "./SampleNotice";

const vault = vi.hoisted(() => ({ status: "idle", open: vi.fn() }));

vi.mock("@/entities/vault-session", () => ({ useLocalVault: () => vault }));

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

const cta = koMessages.openVaultCta;

function renderNotice(status: string, onOpenFolder = vi.fn()) {
  vault.status = status;
  return {
    onOpenFolder,
    ...render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <SampleNotice onOpenFolder={onOpenFolder} />
      </NextIntlClientProvider>,
    ),
  };
}

describe("SampleNotice", () => {
  beforeEach(() => {
    vault.open.mockReset();
  });

  it("explains why the doc is read-only in plain language", () => {
    renderNotice("unsupported");
    expect(screen.getByText(koMessages.docsVault.sampleNotice.title)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(koMessages.docsVault.sampleNotice.body.replace(".", "\\.")))).toBeInTheDocument();
  });

  it("opens the folder through the page's own flow where a folder can be opened", () => {
    const { onOpenFolder } = renderNotice("idle");
    const button = screen.getByRole("button", { name: cta.label });
    expect(button).toHaveAttribute("data-open-vault-cta", "picker");
    fireEvent.click(button);
    expect(onOpenFolder).toHaveBeenCalledTimes(1);
    expect(vault.open).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: cta.unsupportedLabel })).not.toBeInTheDocument();
  });

  it("offers the app where the browser cannot open a folder", () => {
    renderNotice("unsupported");
    const link = screen.getByRole("link", { name: cta.unsupportedLabel });
    expect(link).toHaveAttribute("href", "/download/");
    expect(screen.queryByRole("button", { name: cta.label })).not.toBeInTheDocument();
  });
});
