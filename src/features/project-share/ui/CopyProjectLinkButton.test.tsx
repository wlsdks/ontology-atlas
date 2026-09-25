import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import koMessages from "../../../../messages/ko.json";
import { CopyProjectLinkButton } from "./CopyProjectLinkButton";

const mocks = vi.hoisted(() => ({
  copyText: vi.fn<(text: string) => Promise<boolean>>(),
  toast: vi.fn(),
}));

vi.mock("@/shared/lib/copy-text", () => ({
  copyText: (text: string) => mocks.copyText(text),
}));

vi.mock("@/shared/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/ui")>();
  return {
    ...actual,
    useToast: () => ({ show: mocks.toast, dismiss: vi.fn() }),
  };
});

const labels = koMessages.copyProjectLink;

function renderButton() {
  render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <CopyProjectLinkButton slug="임의 프로젝트" />
    </NextIntlClientProvider>,
  );
  return screen.getByRole("button", { name: labels.labelIdle });
}

describe("CopyProjectLinkButton", () => {
  beforeEach(() => {
    mocks.copyText.mockReset().mockResolvedValue(true);
    mocks.toast.mockReset();
  });

  it("현재 locale이 포함된 정적 export-safe 상세 URL을 복사한다", async () => {
    fireEvent.click(renderButton());

    await waitFor(() => expect(mocks.copyText).toHaveBeenCalledTimes(1));
    expect(mocks.copyText).toHaveBeenCalledWith(
      `${window.location.origin}/ko/project/fallback/?${new URLSearchParams({
        slug: "임의 프로젝트",
      }).toString()}`,
    );
  });

  /*
   * 2026-09-26: the button already said the link was copied, and a toast said it again in a box
   * over the project page's own text. The outcome is said once, where the press was.
   */
  it("says the copy on the button and raises no toast", async () => {
    fireEvent.click(renderButton());

    // Every label is laid in one cell and only the current one is read (the others are
    // `aria-hidden`), so the button's name is what it says now.
    await waitFor(() => expect(screen.getByRole("button", { name: labels.labelCopied })).toBeInTheDocument());
    expect(mocks.toast).not.toHaveBeenCalled();
    // The live region reads the same outcome out.
    expect(screen.getByText(labels.labelCopied, { selector: "[aria-live]" })).toBeInTheDocument();
  });

  it("says a refused copy on the button too", async () => {
    mocks.copyText.mockResolvedValue(false);
    fireEvent.click(renderButton());

    await waitFor(() => expect(screen.getByRole("button", { name: labels.labelError })).toBeInTheDocument());
    expect(mocks.toast).not.toHaveBeenCalled();
  });
});
