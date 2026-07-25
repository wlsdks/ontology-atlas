import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import koMessages from "../../../../messages/ko.json";
import { CopyProjectLinkButton } from "./CopyProjectLinkButton";

const mocks = vi.hoisted(() => ({
  copy: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/shared/lib/use-copy-feedback", () => ({
  useCopyFeedback: () => ({
    state: "idle" as const,
    copy: mocks.copy,
  }),
}));

vi.mock("@/shared/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/ui")>();
  return {
    ...actual,
    useToast: () => ({ show: mocks.toast }),
  };
});

describe("CopyProjectLinkButton", () => {
  beforeEach(() => {
    mocks.copy.mockReset().mockResolvedValue(true);
    mocks.toast.mockReset();
  });

  it("현재 locale이 포함된 정적 export-safe 상세 URL을 복사한다", async () => {
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <CopyProjectLinkButton slug="임의 프로젝트" />
      </NextIntlClientProvider>,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: koMessages.copyProjectLink.labelIdle,
      }),
    );

    await waitFor(() => expect(mocks.copy).toHaveBeenCalledTimes(1));
    expect(mocks.copy).toHaveBeenCalledWith(
      `${window.location.origin}/ko/project/fallback/?${new URLSearchParams({
        slug: "임의 프로젝트",
      }).toString()}`,
    );
  });
});
