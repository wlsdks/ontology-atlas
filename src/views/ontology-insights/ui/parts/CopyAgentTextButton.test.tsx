import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import koMessages from "../../../../../messages/ko.json";
import { CopyAgentTextButton } from "./CopyAgentTextButton";
import { copyText } from "@/shared/lib/copy-text";

vi.mock("@/shared/lib/copy-text", () => ({
  copyText: vi.fn(async () => true),
}));

const copyTextMock = vi.mocked(copyText);

function renderButton() {
  return render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <CopyAgentTextButton label="복사" copiedLabel="복사됨" text="payload" />
    </NextIntlClientProvider>,
  );
}

function renderCompactButton() {
  return render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <CopyAgentTextButton label="복사" copiedLabel="복사됨" text="payload" compact />
    </NextIntlClientProvider>,
  );
}

/**
 * 라이트 모드 가독성 회귀 가드.
 *
 * 이 버튼은 인사이트 페이지 전반에 쓰이는데, idle 텍스트 색이 하드코딩
 * light-on-dark rgba(예: rgba(211,215,255,0.96)) 였을 때 라이트 모드 흰 배경에
 * 묻혀 "Copy CLI pack" 등이 안 보였다(브라우저 육안 확인). 텍스트 색은 양
 * 모드에서 모두 읽히는 mode-aware 토큰을 써야 한다.
 */
describe("CopyAgentTextButton — mode-aware 텍스트 색 (라이트 모드 가독성)", () => {
  beforeEach(() => {
    copyTextMock.mockClear();
    copyTextMock.mockResolvedValue(true);
  });

  it("idle 텍스트는 하드코딩 light rgba 가 아니라 indigo-accent 토큰을 쓴다", () => {
    renderButton();
    const button = screen.getByRole("button");
    expect(button.className).toContain("text-[color:var(--color-indigo-accent)]");
    // 라이트 모드에서 흰 배경에 묻히던 light-on-dark 리터럴 금지.
    expect(button.className).not.toContain("rgba(211,215,255");
    expect(button.className).not.toContain("rgba(211, 215, 255");
  });

  it("compact copy 버튼도 모바일에서 32px hit target 아래로 내려가지 않는다", () => {
    renderCompactButton();
    const button = screen.getByRole("button");
    const classTokens = button.className.split(/\s+/);
    expect(classTokens).toContain("min-h-8");
    expect(classTokens).not.toContain("py-1");
  });

  it("복사 성공 후에도 보이는 라벨 폭을 늘리지 않고 아이콘과 live region 으로 피드백한다", async () => {
    renderButton();
    const button = screen.getByRole("button", { name: "복사" });

    fireEvent.click(button);

    await waitFor(() => expect(copyTextMock).toHaveBeenCalledWith("payload"));
    await screen.findByText("복사됨");
    expect(button).toHaveTextContent("복사");
    expect(button).not.toHaveTextContent("복사 · 복사됨");
    expect(button.className).toContain("active:translate-y-[1px]");
    expect(button.className).toContain("motion-reduce:transition-none");
  });
});
